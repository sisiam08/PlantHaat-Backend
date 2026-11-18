# Full Image & PDF Upload System — Architecture & Implementation Guide

> A complete analysis of the file-upload system in this project (Personal Portfolio), written so it can be
> replicated in another project. Covers the backend (Express + Multer + Cloudinary), the database (Prisma/PostgreSQL,
> storing URLs only), the frontend (Next.js admin panel), and public delivery (_secure URLs, forced PDF downloads_).

---

## 1. High-Level Architecture

```
┌──────────────────────────┐                        ┌─────────────────────────────────────┐
│  Browser (Admin)         │                        │  Cloudinary (CDN / Asset Storage)   │
│  Next.js 16 (App Router) │                        │                                     │
│                          │  multipart/form-data   │  personalPortfolio/                 │
│  Admin components build  ├────────────────────────┤    ├── images/      <-- JPG/PNG/...  │
│  a FormData  and send it │   (file + text fields) │    ├── pdfs/       <-- PDF resume   │
│  to /api/v1/*            │                        │    └── ...documents/texts/...       │
└─────────┬────────────────┘                        └───────────────▲─────────────────────┘
          │  Next.js rewrites                                       │  uploads the raw file
          │  /api/v1/* → BACKEND_URL/api/v1/*                       │  returns secure_url
          ▼                                                         │
┌──────────────────────────┐                                       │
│  Backend (Express 5)     │──────────── upload via ───────────────┘
│                          │   multer + multer-storage-cloudinary
│  PATCH /users/me         │   (uploads happen INSIDE the route middleware)
│  POST/PATCH /projects    │
│                          │         stores returned secure URL
│  Prisma (PostgreSQL)     │◄──────────────────────────────────────────────┐
│  User.image, User.       │                                               │
│  resumeUrl, Project.image│   DB stores ONLY the URL, never the binary    │
└──────────────────────────┘
          │
          ▼  public site reads URL fields and renders/downloads assets
┌──────────────────────────┐
│  Public Portfolio UI     │
│  <img src={user.image}/> │
│  Resume: fetch→blob→     │
│  programmatic download   │
└──────────────────────────┘
```

**Key design decision:** binaries are never stored in the database or on the app server's disk.
The DB stores only the Cloudinary `secure_url` string. The upload itself happens *inside a route
middleware* (Multer → Cloudinary storage engine), and the controller receives the file already
uploaded, needing only `file.path` (the secure URL).

---

## 2. Technology Stack

### Backend (`backend/`)

| Package | Version | Role |
|---|---|---|
| `express` | ^5.2.1 | HTTP framework (route-level middleware chain) |
| `multer` | ^2.1.1 | `multipart/form-data` parser + file filter/limits engine |
| `multer-storage-cloudinary` | ^4.0.0 | Custom Multer **storage engine** that streams the file directly to Cloudinary |
| `cloudinary` | ^1.41.3 | Cloudinary SDK (config, signed operations, deleting assets) |
| `@prisma/client` | ^7.8.0 | ORM — stores the resulting URLs |
| `better-auth` | ^1.6.9 | Session/cookie auth used by the upload-guarding middleware |
| `zod` | ^4.4.1 | Request-body validation |

### Frontend (`frontend/`)

| Package | Role |
|---|---|
| Next.js 16 (App Router) | Admin dashboard + public site; `rewrites()` proxy `/api/v1/*` to the backend |
| Plain `fetch` + `FormData` | `adminApi()` client never throws; handles cookies + field errors |
| `react-hot-toast` | success/error toasts |
| `lucide-react` | upload/download icons |

### Cloudinary (asset storage & CDN)

- Stores binaries and serves them globally via `res.cloudinary.com`.
- Free tier is sufficient for a portfolio; assets are referenced by URL, so no extra infra.

### Database role

PostgreSQL (via Prisma) stores URL strings, e.g.:

```
User.image      → https://res.cloudinary.com/<cloud>/image/upload/v179.../personalPortfolio/images/xxx.jpg
User.resumeUrl  → https://res.cloudinary.com/<cloud>/image/upload/v179.../personalPortfolio/pdfs/xxx.pdf
Project.image   → https://res.cloudinary.com/<cloud>/image/upload/v...
```

---

## 3. Backend Implementation (folder: `backend/src`)

### 3.1 Environment configuration (`backend/.env` → `src/config/index.ts`)

```env
CLOUDEINARY_CLOUD_NAME=<your-cloud-name>
CLOUDEINARY_API_KEY=<your-api-key>
CLOUDEINARY_API_SECRET=********
APP_URL=http://localhost:3000      # CORS origin (the Next.js frontend)
```

`src/config/index.ts` loads dotenv and exposes `config.cloudinary.{cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret}`.

### 3.2 Cloudinary SDK setup (`src/config/cloudinary.config.ts`)

```ts
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import config from ".";

cloudinary.config({
  cloud_name: config.cloudinary.cloudinaryCloudName,
  api_key: config.cloudinary.cloudinaryApiKey,
  api_secret: config.cloudinary.cloudinaryApiSecret,
});
```

Three exports matter:

1. **`cloudinaryUpload`** (the configured SDK instance) — handed to Multer's Cloudinary storage engine.
2. **`uploadFileToCloudinary(buffer, fileName)`** — a manual `upload_stream` helper (used when a
   file arrives as a Buffer rather than a Multer stream). Computes a unique name
   (`random36 + timestamp + sanitized original name + extension`) and puts the asset under
   `personalPortfolio/images` or `personalPortfolio/others`.
3. **`deleteFileFromCloudinary(url)`** — extracts the `public_id` + resource type from a delivery URL
   and calls `cloudinary.uploader.destroy()`:

```ts
const regex = /\/(image|raw|video|auto)\/upload\/v\d+\/(.+)$/;
const match = url.match(regex);
// resourceType: "auto" → "raw"
// image/video public_ids exclude the extension; raw (PDF/doc) public_ids keep it
const publicId = resourceType === "raw" ? match[2] : match[2].replace(/\.[a-zA-Z0-9]+$/, "");
await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
```

> **Critical detail:** image/video assets have `public_id` *without* extension, but `raw` assets
> (PDFs uploaded as `raw`) keep the extension in their `public_id`. The delete helper handles both —
> getting this wrong makes "replace/delete" silently leave orphaned Cloudinary assets.

### 3.3 Multer storage engine (`src/config/multer.config.ts`) — the heart of the system

```ts
const storage = new CloudinaryStorage({
  cloudinary: cloudinaryUpload as any,
  params: async (req, file) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`);
    }

    // Sanitize name: only append extension when the original name has none
    const lastDot = originalName.lastIndexOf(".");
    const extension = lastDot > 0 ? originalName.substring(lastDot).toLowerCase() : "";
    const fileNameWithoutExt = /* lowercase, spaces→dashes, strip non [a-z0-9-] */;

    const uniqueName = `${random36}-${Date.now()}-${fileNameWithoutExt}${extension}`;

    // Folder routing by file type
    const folder = extension === ".pdf" ? "pdfs"
      : extension === ".txt" ? "texts"
      : /\.(ppt|pptx)/.test(extension) ? "presentations"
      : /\.(doc|docx)/.test(extension) ? "documents"
      : "images";

    return {
      folder: `personalPortfolio/${folder}`,
      public_id: uniqueName,
      resource_type: "auto",       // Cloudinary infers image vs raw (PDF) from content
      type: "upload",              // public delivery (NOT "authenticated")
      access_mode: "public",       // guarantees browser-fetchable delivery URLs
      timeout: 120000,             // 2 min for large files
    };
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(new Error("File type not allowed..."));
    cb(null, true);
  },
});
```

**Allowed MIME types:** JPEG, PNG, GIF, WEBP images; **application/pdf**; text/plain; DOC/DOCX; PPT/PPTX.

**Why these params (hard-won lessons):**
- `type: "upload"` + `access_mode: "public"` → delivered URLs work in browsers without auth.
  Newer Cloudinary accounts can otherwise end up with restricted/authenticated assets → **HTTP 401**
  when the browser fetches the PDF.
- `resource_type: "auto"` → a PDF becomes a `raw` asset, an image becomes an `image` asset.
- Extension is appended **only if missing** — otherwise files whose names already end in `.pdf`
  get a double extension (`resume.pdf.pdf` in `public_id`).

### 3.4 Wiring uploads into routes (`src/modules/*/*.router.ts`)

Route middleware order matters: **auth → multer → validation → controller**.

```ts
// Single field (e.g. project image)
router.patch("/:id", auth_middleware(), upload.single("image"),
  validateRequest(ProjectValidation.updateProjectSchema), ProjectController.updateProject);

// Multiple optional fields (profile photo + resume PDF in one request)
router.patch("/me", auth_middleware(),
  upload.fields([
    { name: "image",  maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  validateRequest(UserValidation.updateUserSchema), UserController.updateMyProfile);
```

> `multer` `limits.files` must be ≥ the number of fields you register (here raised to 2, otherwise
> the second field is rejected with LimiterError).

Validation still runs on the *text* fields of the multipart body (`req.body` is populated by Multer
before `validateRequest` runs). URLs produced from uploads never pass through body validation —
the controller injects them afterwards.

### 3.5 Controllers — turning `req.file/files` into DB payloads (`src/modules/*/*.controller.ts`)

`CloudinaryStorage` uploads the file during the middleware and stores the resulting `secure_url` on
the file object. Controllers read it:

```ts
// single file
const file = req.file as Express.Multer.File | undefined;
const updateData: UserUpdateInput = { ...req.body };
if (file) updateData.image = (file as any).path || (file as any).url;  // Cloudinary secure URL

// multiple named fields
const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
if (files?.image?.[0])  updateData.image     = files.image[0].path;
if (files?.resume?.[0]) updateData.resumeUrl = files.resume[0].path;
```

### 3.6 Services — persistence + old-asset cleanup (`src/modules/*/*.service.ts`)

Pattern used everywhere (User profile, Project image, …):

1. Fetch the existing row (`prisma.x.findUnique`) *before* updating.
2. Update with the payload via Prisma (`prisma.x.update`).
3. **If the file URL changed, delete the previous Cloudinary asset — best effort, non-blocking:**

```ts
if (payload.image && existing?.image && existing.image !== payload.image) {
  deleteFileFromCloudinary(existing.image).catch(() => undefined);   // never fail the request
}
if (payload.resumeUrl && existing?.resumeUrl && existing.resumeUrl !== payload.resumeUrl) {
  deleteFileFromCloudinary(existing.resumeUrl).catch(() => undefined);
}
```

Also on **hard delete** (`ProjectService.deleteProject`) the image asset is removed after the row is gone.

> Cleanup is fire-and-forget on purpose: an orphaned CDN asset should never break a user's update.

### 3.7 Where every uploaded file ends up

| Upload | Route/field | Cloudinary folder | DB column | Consumer |
|---|---|---|---|---|
| Profile portrait | `PATCH /api/v1/users/me` → `image` | `personalPortfolio/images` | `User.image` | Navbar/Hero `<img>` via `next/image` |
| Resume PDF | `PATCH /api/v1/users/me` → `resume` | `personalPortfolio/pdfs` | `User.resumeUrl` | Resume buttons → blob download |
| Project screenshot | `POST/PATCH /api/v1/projects` → `image` | `personalPortfolio/images` | `Project.image` | Project cards |

---

## 4. Frontend Implementation (folder: `frontend/`)

### 4.1 Same-origin API client with cookies (`lib/adminApi.ts`)

`next.config.ts` rewrites proxy `/api/v1/*` and `/api/auth/*` to the backend, so the admin panel
talks to the API on the same origin — the httpOnly Better-Auth **session cookie is attached
automatically** (no tokens in JS, no extra CORS handling):

```ts
async function adminApi<T>(path, { method = "GET", body, formData }: Options = {})
```
- Sends `FormData` when given (no `Content-Type` header — the browser sets the multipart boundary),
  else JSON.
- Never throws; returns `{ data, error, status, fieldErrors }` and redirects to `/admin/login` on 401/403.

### 4.2 FormData builder (`lib/adminApi.ts` → `toFormData`)

```ts
export function toFormData(record: Record<string, unknown>): FormData {
  // skips undefined/null; appends File values; booleans → "true"/"false";
  // arrays → JSON string (matched and re-parsed by a zod transform on the backend)
}
```

### 4.3 Admin upload widgets (`src/components/admin/ui.tsx`)

Two dedicated pickers with identical interaction patterns:

- **`ImagePicker`** — accept JPG/PNG/WEBP/GIF, 5 MB client-side cap, live `URL.createObjectURL`
  preview (merged over `existingUrl`), optional dimension/size warnings, *Replace / Remove* actions.
- **`ResumePicker`** — accept `application/pdf`, 10 MB cap, shows selected file name + size,
  "View current resume" link (`target="_blank" rel="noopener noreferrer"`) when a resume already exists.

### 4.4 Form-submit flow (example: `ProfileManager.tsx`)

```tsx
const [image, setImage]  = useState<File | null>(null);
const [resume, setResume] = useState<File | null>(null);

const submit = async (e) => {
  const parsed = profileSchema.safeParse(form);          // zod client-side
  if (!parsed.success) { setFieldErrors(...); return; }

  const fd = toFormData({ ...parsed.data, image: image ?? undefined, resume: resume ?? undefined });
  const res = await adminApi("/users/me", { method: "PATCH", formData: fd });

  if (res.error) { setFieldErrors(res.fieldErrors); toast.error(res.error); return; }
  toast.success("Profile updated");
  setImage(null); setResume(null);
  await revalidatePublic();   // Next.js server action → revalidatePath("/")
  load();                     // refetch profile (now with new Cloudinary URLs)
};
```

Projects follow the same flow (`ProjectsManager.tsx`) with the `image` field and a required-file check.

### 4.5 Public display & delivery

- **Images** render directly by URL (Next.js `next/image` with
  `images.remotePatterns: [{ hostname: "res.cloudinary.com" }, { hostname: "**" }]`).
- **Resume download** (`src/app/_components/`):
  - `resume.ts` — `downloadResume(url)` runs a **background fetch → Blob → programmatic anchor click**:
    ```ts
    const res  = await fetch(url);                       // Cloudinary allows CORS on delivery
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl; a.download = "Md_Shahariar_Islam_Siam_Resume.pdf";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    ```
    Result: instant download with **no tab opening / blank-tab flash**. If `fetch` fails, it falls
    back to opening `resumeDownloadHref(url)`.
  - `resumeDownloadHref(url)` — for direct-open fallback it injects Cloudinary's
    `fl_attachment:Md_Shahariar_Islam_Siam_Resume` flag, which makes Cloudinary serve
    `Content-Disposition: attachment` (so cross-origin links download instead of rendering).
  - `ResumeDownloadButton.tsx` ("use client") — wraps the handler as `<button type="button">`
    so server components (`HeroSection`, `AboutSection`) can pass their styled children (Download
    icon + label) into one shared client handler.

---

## 5. End-to-End Flow Walkthroughs

### 5.1 Uploading a project image

1. Admin fills the project form; `ImagePicker` holds the `File` in state.
2. `toFormData({...fields, image})` → `POST /api/v1/projects` (multipart).
3. Next.js rewrite → Express backend, cookie auth middleware verifies the admin session.
4. `upload.single("image")` — Multer parses the multipart body → `CloudinaryStorage` streams the
   file to Cloudinary (`personalPortfolio/images/<random>-<ts>-<name>.jpg`) → `req.file.path`
   already contains the `secure_url`.
5. Zod validates the remaining text fields; controller sets `projectData.image = file.path`.
6. `ProjectService.createProject` persists the row (slug, order, skill connect); URL in DB.
7. Frontend toasts success, calls `revalidatePublic()` (ISR revalidation), clears the picker.

### 5.2 Replacing/deleting

- On update with a *new* file, the service diffs `existing.image !== payload.image` and destroys the
  old Cloudinary asset (best-effort).
- Deleting a project destroys its image asset too.
- Same diff-and-cleanup pattern guards `User.image` and `User.resumeUrl`.

### 5.3 Downloading the resume PDF

1. Public page renders the resume URL from `GET /api/v1/users/me`.
2. Click → `downloadResume(url)`: background `fetch` (Cloudinary delivery is CORS-enabled) →
   `Blob` → temp anchor `download="Md_Shahariar_Islam_Siam_Resume.pdf"` → programmatic click →
   revoke object URL. No navigation, no new tab.
3. If fetch fails: fallback opens `…/fl_attachment:NAME/...` which Cloudinary serves as an
   attachment download.

---

## 6. Replication Checklist for Another Project

### Install (backend)

```bash
npm i express multer multer-storage-cloudinary cloudinary
npm i -D @types/multer
```

### Setup checklist

1. Copy `cloudinary.config.ts` + `multer.config.ts`, wire them to your env config.
2. Adjust `ALLOWED_MIME_TYPES`, `FILE_SIZE_LIMIT`, and the folder-mapping function to your needs.
3. Add `type: "upload"` + `access_mode: "public"` in storage params (avoid 401 delivery errors).
4. Only append a file extension when the original filename lacks one.
5. Raise `limits.files` to the number of named fields (`upload.fields([...])`).
6. Route order: `auth → multer(.single/.fields) → validateRequest → controller`.
7. In controllers derive URLs from `(file as any).path || (file as any).url`.
8. In services: fetch existing row first, `update`, then diff-and-destroy old Cloudinary assets via
   the regex `deleteFileFromCloudinary` (handle `image`/`raw` public_id extension difference).
9. DB columns are plain `String` URLs (`image`, `resumeUrl`, …) — never blobs.
10. Frontend: same-origin proxy (`rewrites()`), cookie-based `adminApi`, `toFormData`, picker
    widgets with preview + size/type validation, clear the picker after success.
11. Public site: images direct by URL; for forced cross-origin PDF downloads use the
    blob-fetch + anchor-click pattern (`downloadResume`) with the `fl_attachment` fallback.

### Gotchas learned the hard way (do not skip)

| Problem | Cause | Fix in this codebase |
|---|---|---|
| `HTTP 401` opening the PDF | Cloudinary account blocks public **PDF delivery** by default on new accounts; asset could also be `authenticated` | Uploaded with `type: "upload"` + `access_mode: "public"`; cloud console *Settings → Security → Restricted media types* must allow PDF |
| `ERR_INVALID_RESPONSE` / 400 on download URL | `fl_attachment:name.pdf` (flag value ending in an extension) is invalid on image-type PDFs | `fl_attachment:<name-without-extension>` |
| Old PDF/download didn't change | was actually uploading fine — Cloudinary propagation delay | re-verify with `HEAD` request after toggling account settings |
| Second file field rejected | Multer `limits.files` default/1 for multi-field routes | raised to 2 |
| `resume.pdf.pdf` in public_id | extension re-appended to a name that already had it | append only when missing |
| Orphaned Cloudinary files after replace/delete | image public_id includes `extensions`? (raw) vs not (images) | regex-based `deleteFileFromCloudinary` distinguishes `image`/`raw` |
| Browser ignores `download` attr | anchor URL is cross-origin (Cloudinary) | blob + object-URL is same-origin → honored; or `fl_attachment` server-side |
| Multipart body fields undefined in admin UI | controller expected raw JSON | Multer populates `req.body` first; validation runs after multer |

---

## 7. File Inventory (exact locations in this repo)

```
backend/src/
  config/index.ts                  # env loader (cloudinary keys, APP_URL)
  config/cloudinary.config.ts      # SDK config, manual upload_stream helper, delete-by-URL helper
  config/multer.config.ts          # CloudinaryStorage engine, MIME list, folders, size limit
  middleware/auth.ts               # Better-Auth session guard (admin-only for uploads)
  middleware/validateRequest.ts    # zod schema → req.body validation (after multer)
  modules/User/{router,controller,service,validation}.ts    # image + resume fields
  modules/Project/{router,controller,service,validation}.ts # image field + cleanup on update/delete
  routes/index.ts                  # /api/v1/* mounting
  app.ts                           # cors(credentials), urlencoded, json, /api/v1 router

frontend/
  next.config.ts                   # rewrites /api/v1/* + /api/auth/* → backend; cloudinary image host
  lib/adminApi.ts                  # cookie client, FormData builder, never-throws result shape
  lib/adminSchemas.ts              # zod form schemas (client-side)
  src/action/admin.action.ts       # revalidatePublic() → revalidatePath("/")
  src/components/admin/ui.tsx      # ImagePicker, ResumePicker, admin primitives
  src/components/admin/ProfileManager.tsx
  src/components/admin/ProjectsManager.tsx
  src/app/_components/resume.ts                # resumeDownloadHref + downloadResume (blob fetch)
  src/app/_components/ResumeDownloadButton.tsx # shared client download button
  src/app/_components/{Navbar,HeroSection,AboutSection}.tsx # consumers
```

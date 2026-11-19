# Home Highlights API (admin-managed)

Last verified: 2026-11-19 (`feature/payments`). The feature extends the existing `Banner` table
with placement `HOME_HIGHLIGHTS`; no existing banner endpoint was removed or renamed.

## Data model (Banner additions)

`imageUrl` is the desktop image; `mobileImageUrl` is optional. Both have width/height metadata and
stored upload `publicId`s. Overlay, scrim, text colors, 3x3 desktop/mobile positions, alignment,
button (preset or custom colors), whole-slide link, schedule, active flag and created/updated-by are
stored on the row. `linkUrl` remains the whole-slide link. All new columns are nullable or defaulted;
the migration is additive (`20261119120000_home_highlights_banner_fields`).

## Public endpoint

`GET /api/v1/home/highlights` (no auth)

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "title": { "bn": "হাইলাইট", "en": "Highlights" },
    "autoplay": false,
    "intervalSeconds": 6,
    "slides": [
      {
        "id": "...",
        "sortOrder": 0,
        "image": { "url": "https://...", "width": 1920, "height": 640 },
        "mobileImage": { "url": "https://...", "width": 960, "height": 640 },
        "alt": { "bn": "...", "en": "..." },
        "focal": { "x": 50, "y": 50 },
        "mobileFocal": { "x": 50, "y": 50 },
        "overlay": {
          "enabled": true,
          "headline": { "bn": "...", "en": "..." },
          "subtext": { "bn": "...", "en": "..." },
          "textColor": "#EFE7D2",
          "scrimColor": "#0B2116",
          "scrimOpacity": 45,
          "position": { "desktop": "BOTTOM_LEFT", "mobile": "BOTTOM_LEFT" },
          "align": { "desktop": "left", "mobile": "left" }
        },
        "button": {
          "enabled": true,
          "label": { "bn": "কিনুন", "en": "Shop now" },
          "href": "/products",
          "style": "primary",
          "backgroundColor": null,
          "textColor": null
        },
        "link": null,
        "openInNewTab": false
      }
    ]
  }
}
```

- When `home.highlights.enabled` is false, or no slide is active/within schedule, `slides` is empty.
  The frontend then renders nothing (no section, heading, gap or skeleton).
- Only active rows inside `startsAt`/`endsAt` are returned, ordered by `sortOrder`, capped by
  `home.highlights.maxSlides` (1-10).
- `Cache-Control: public, max-age=30, stale-while-revalidate=30` and an `ETag`; `If-None-Match`
  returns `304`. Active rows are cached in-process for 15 s; settings are read on every call.
  Admin writes clear the in-process row cache, so changes appear on the next request.
- Public contract excludes `title`, `placement`, `isActive`, creator/updater ids, raw image public
  ids and other admin fields. E2e asserts this.

## Admin endpoints

All require `ADMIN`; mutations are audited (`banner.create|update|delete|duplicate|reorder`) with
actor and request meta. Upload URLs must already exist in `UploadedAsset` (Cloudinary https, local
test upload origin or same-site `/uploads/...`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/banners?placement=HOME_HIGHLIGHTS` | List slides (all placements if omitted) |
| POST | `/api/v1/admin/banners` | Create; returns `{ ...banner, warnings[] }` |
| PATCH | `/api/v1/admin/banners/:id` | Update; returns warnings |
| DELETE | `/api/v1/admin/banners/:id` | Delete and clean unreferenced images |
| POST | `/api/v1/admin/banners/:id/duplicate` | Hidden draft copy (`isActive: false`) |
| PATCH | `/api/v1/admin/banners/reorder` | `{ ids: string[] }` reorders in one transaction |

Create defaults `sortOrder` to max+1; the admin can override it. A duplicate keeps the same image
URLs; asset cleanup checks every banner reference before deleting.

## Validation (server-side)

- Desktop image required; uploads must be owned assets. Recommended 1920x640 (3:1), minimum 1200 px
  wide. Mobile recommended 960x640 (3:2) or 16:9, minimum 640 px wide. Off-aspect/small images are
  returned as warnings, not blocks (focal-point crop handles them).
- Links: same-site `/<path>` or `https://`; `javascript:`, `data:`, protocol-relative and other
  schemes are rejected. External links with `openInNewTab` render `rel="noopener noreferrer"`.
- Colors `#RRGGBB`; headline <= 60, subtext <= 140, button label <= 24 per language; plain text
  only (no `<`/`>` HTML). Schedule end must be after start. At most `maxSlides` rows may be active
  and visible now (future scheduled rows are allowed; the public endpoint caps output).
- Contrast guard (estimated against the scrim over a neutral image): overlay text below 4.5:1 is a
  warning unless the scrim is at maximum (90%+), where it blocks; custom button text below 3:1
  blocks and below 4.5:1 warns. Preset token buttons are not recomputed.
- Attach lifecycle: both image URLs are attached in the same transaction as the row write; replaced
  or deleted assets are removed only when no other banner references them.

## Scripts

- `npm run home:highlights:import` (dev DB only, guarded) uploads the owner's existing
  `frontend/public/banners/*.webp` files through the normal pipeline and creates three
  marker-tagged slides (`[seed:home-highlights]`). Idempotent: if marker rows exist it does nothing.
- `npm run home:highlights:import:remove` (dev DB only) deletes marker rows and their unreferenced
  assets. Run it before/after seed changes; never in production.

## Frontend

- Home slot: `src/features/catalog/components/home-highlights.tsx`; shared renderer
  `highlight-slide-view.tsx`; lazy carousel `highlights-carousel.tsx`.
- Single slide / feature off: zero carousel JavaScript. Multi-slide: the carousel engine is
  dynamically imported when the section is within 300 px of the viewport; the first slide is server
  rendered. Off-screen slide images are not rendered until that slide is selected.
- `<picture>` art direction downloads only the desktop or mobile variant. Cloudinary delivery uses
  `f_auto,q_auto,c_limit,w_<width>`; legacy local/external URLs keep working.
- Admin UI: **Home → Highlights** (`/admin/highlights`) with master switch, autoplay/interval,
  slide list (drag + up/down), status chips, duplicate/delete, editor, focal picker, contrast
  warnings and a live desktop/mobile + bn/en preview.

# Upload and image storage architecture

Cloudinary is the primary persistent image store. The local disk driver exists only for tests and
offline development; production refuses it. Every uploaded URL is tracked in `UploadedAsset` and must
be marked `ATTACHED` in the same transaction as the entity write.

## 1. Request flow

```text
Browser -> uploadsApi -> POST /api/v1/uploads/images (multipart)
        -> multer memory storage (5 MB cap)
        -> magic-byte + MIME validation
        -> sharp re-encode to WebP (EXIF stripped, 2000 px products / 1600 px others)
        -> StorageService.put()
        -> Cloudinary secure_url + public_id
        -> UploadedAsset(PENDING)
        -> entity service writes the URL and calls attachAssetsInTransaction(tx, urls)
        -> frontend renders the Cloudinary URL
```

`POST /uploads/documents` stores private seller KYC files (PDF/JPEG/PNG/WebP) under
`<folder>/private/seller-docs`. It returns only a `key`; private files are never public URLs and are
never auto-deleted by the orphan cron.

## 2. Producer inventory (verified 2026-11-19)

| Producer | Storage field(s) | Attach in entity transaction? | Old asset cleanup |
|---|---|---|---|
| Seller product image add | `ProductImage.url` | Yes (`attachAssetsInTransaction`) | n/a on add |
| Seller product image remove | `ProductImage.url` | n/a | Yes, unless `OrderItem.imageUrl` snapshot or another product image still references it |
| Admin category create/update | `Category.imageUrl` | Yes | Yes on replace; delete on category delete |
| Seller shop create/update | `Shop.logoUrl`, `Shop.bannerUrl` | Yes | Yes on replace |
| User avatar update | `User.avatarUrl` | Yes | Yes on replace |
| Admin banner create/update/delete | `Banner.imageUrl` | Yes | Yes on replace/delete |
| Review create/update/delete | `ReviewImage.url` | Yes | Yes for removed/replaced review images |
| Complaint/dispute evidence | `ComplaintAttachment.url` | Yes | No complaint deletion flow exists |
| Advance payment proof (Part 3) | `PaymentSubmission.proofUrl` | Yes | Historical proof; never auto-deleted |
| Seller dispute response photos | none | **Not implemented** (response is text-only today) | If added, must use the same helper |
| Delivery proof (Part 4) | `ShopOrder.deliveryProofUrl` | **No writer exists yet**; column is registered | Future writer must attach |
| Chat/message attachment | `Message.attachmentUrl` | **Schema only** (messaging not implemented) | Registered for future use |
| Seller KYC/documents | `SellerDocument.fileKey` (private key) | Not tracked (private) | Never auto-deleted; admin review only |
| Refund/payout "proof" | `Refund.reference`, `Payout.reference` | Not file uploads (text references) | n/a |
| Order item image snapshot | `OrderItem.imageUrl` | Not a producer (copy of product image) | Protected from product-image deletion |
| JSON columns | `Notification.data`, `HomepageSection.config`, `SystemSetting.value`, audit before/after, payment payloads, etc. | Registered for reference checks | Cron text-searches them before deleting |

## 3. Orphan cron safety

`UploadsMaintenanceService.purgeOrphans()` runs hourly. Before deleting a `PENDING` asset older than
`upload.orphanGraceDays` (Settings, default 7 days, minimum 1 day):

1. **Private assets** (`url` null or public id contains `/private/`) are skipped and flagged in the
   summary; they are never auto-deleted.
2. **Foreign environment prefixes** are skipped when the driver is not local.
3. **Every registered reference** is checked: scalar columns by exact match, JSON columns by a
   parameterized text search, private keys by exact match. If any reference exists, the asset is
   relinked to `ATTACHED` and never deleted.
4. Only unreferenced public assets in the current prefix are deleted.

Summary log fields: `scanned`, `deleted`, `wouldDelete`, `relinked`, `skippedPrivate`,
`skippedForeignPrefix`, `graceDays`, `dryRun`.

Commands:

```bash
npm run uploads:orphans              # dry-run (default)
npm run uploads:orphans -- --apply   # delete only unreferenced assets
npm run uploads:reconcile            # read-only report; refuses production
npm run uploads:smoke                # live Cloudinary probe in its own temporary folder
```

`uploads:reconcile` lists: DB URLs without an `UploadedAsset` row, `ATTACHED` rows with no current
reference, and Cloudinary objects under the current prefix unknown to the DB. It never deletes.

## 4. Registry and guard tests

- `src/modules/uploads/upload-references.ts` is the single registry of URL/key columns and JSON
  columns. `upload-references.spec.ts` parses `schema.prisma` and fails if a new URL-like or JSON
  column is not registered.
- `upload-persistence.guard.spec.ts` fails if a known persistence service stops using
  `attachAssetsInTransaction` or uses the non-transactional helper.
- Runtime e2e coverage: advance payment proof (`advance-payments.e2e-spec.ts`) and dispute evidence
  (`settlement.e2e-spec.ts`) assert the tracked asset becomes `ATTACHED`.

**Rule:** every upload URL is attached in the same transaction as the entity write. Do not add a new
URL column or upload flow without updating the registry and the guard tests.

## 5. Environment separation

`CLOUDINARY_FOLDER` selects the folder for the current environment:

| Environment | Folder |
|---|---|
| development | `planthaat/dev` |
| test | `planthaat/test` |
| production | `planthaat/prod` (required; boot fails if missing or without a `/prod` segment) |

`CLOUDINARY_FOLDER_PREFIX` is kept as a deprecated alias. The migration script, smoke test, orphan
cron and reconciliation only touch the current folder. `uploads:smoke` writes under
`<folder>/smoke/<timestamp>` and deletes its probe assets.

Existing migrated assets live under the old `planthaat/...` path. They remain accessible and are not
moved automatically. Optional relocation: copy assets to the new prefix with the Cloudinary console
or Admin API, update the DB URLs only after verifying delivery, then remove the old copies after a
backup. Do not run a bulk move without a rollback plan.

## 6. Production checklist

- `STORAGE_DRIVER=cloudinary`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER=planthaat/prod`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (frontend production build fails without it)
- `next.config.ts` allows `res.cloudinary.com/<cloud-name>/**` and the production CSP includes
  `https://res.cloudinary.com`
- Run `npm run uploads:smoke` after deploy
- Admin → Settings → Image storage → “Check storage” (uploads a tiny probe, HEADs it, deletes it)
- Keep the local `uploads/` static route only for legacy files; new uploads must not use it

## 7. Performance note

The storefront already uses the custom Cloudinary loader (`PlantImage` +
`src/lib/images/cloudinary-loader.ts`) with `f_auto,q_auto,c_limit,w_<width>` for product/category
imagery. A browser check of the home page found 36 direct Cloudinary URLs, 0 `_next/image` requests
for Cloudinary originals, 0 local `/uploads` URLs, and `sizes` on every Cloudinary image. The Next
optimizer therefore does not fetch Cloudinary originals on the LCP path, so no loader change was made.
Admin thumbnails may use the default optimizer but are not part of the storefront LCP. If a future
page starts using default `next/image` with Cloudinary originals, re-run the CDP Slow 4G + 4x CPU
comparison before changing it.

## 8. Secret handling

Cloudinary credentials were present in `backend/.env.example` history (commit `35675ba`) and have been
removed from the working tree. See `docs/security/secret-rotation.md` for rotation steps. The
`npm run lint` gate includes `scripts/check-secrets.mjs`.

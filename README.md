# PlantHaat Backend

NestJS + Prisma API for PlantHaat, a multi-vendor online plant marketplace for
Bangladesh. See `../BACKEND_DESIGN.md` for the full design and `../BACKEND_CONTEXT.md`
for the working rules, progress log and decisions.

## Stack

- NestJS 11 (TypeScript, strict) — ESM
- PostgreSQL + Prisma 7 (`prisma-client` generator, driver adapter `@prisma/adapter-pg`)
- JWT auth in httpOnly cookies (access + rotating refresh token)
- Jest + supertest

> The app and its generated Prisma client are ESM. The generated client uses
> `import.meta` and extensionless relative imports, so plain `node dist/main.js`
> cannot resolve modules — every runtime command loads the `tsx` ESM loader via
> `node --import tsx`.
>
> `tsx` on the TypeScript source is **not** used for running the app: esbuild
> (tsx's transpiler) does not emit NestJS decorator metadata correctly here, so
> `npm run dev` compiles with `tsc --watch` and runs the emitted `dist/` with
> `node --watch`. This keeps DI working exactly as in production.

## Requirements

- Node.js LTS (tested with Node 24) and npm
- A PostgreSQL database (the local `.env` points at the developer's database)

## Setup

```bash
npm install            # also runs `prisma generate` (postinstall)
cp .env.example .env   # then fill in real values (never commit .env)
npm run db:deploy      # apply committed migrations
npm run db:seed        # districts, categories, settings, admin, global commission
```

Generate secrets locally:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY (must decode to 32 bytes)
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the API in watch mode (`tsc --watch` + `node --watch` on `dist/`) |
| `npm run build` | Type-check and emit `dist/` (`tsc -p tsconfig.build.json`) |
| `npm start` | Run the built app (`node --import tsx dist/main.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint (flat config) |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Unit tests (Jest, ESM) |
| `npm run test:e2e` | E2E tests (separate test database) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | Seed the database (districts, categories, admin, settings) |
| `npm run db:seed:demo` | Dev-only demo data (3 sellers, 60+ plants across all categories, 5 customers, a sample order) |
| `npm run db:seed:demo:reviews` | Optional dev-only demo reviews (20 reviews across 8 existing products, 5 marker orders). Idempotent; guarded to the dev database. |
| `npm run db:seed:demo:reviews:cleanup` | Deletes only the rows created by the demo-review seed (reviews `seedrvw_*`, orders `DEMO-RVW-*`) and recomputes product/shop rating aggregates. |
| `npm run docs:export` | Build and write the OpenAPI document to `openapi.json` |

Demo reviews are separate from `seed-demo.ts` so the owner can add or remove
them independently. The seed uses only existing demo customers/products,
creates one delivered marker order per involved customer (`DEMO-RVW-*`), writes
reviews with ids starting `seedrvw_`, and recomputes the denormalized
`Product.ratingAvg` / `Shop.ratingAvg` columns. Running it twice is a no-op
while the marker orders exist; run the cleanup first to reseed. Both scripts
refuse to run with `NODE_ENV=production` and the npm scripts run
`scripts/db-guard.mjs` first, so they cannot touch another database.

## Production

The build needs the dev toolchain (TypeScript), so install everything, build,
then prune dev dependencies for the runtime image:

```bash
npm ci
npm run build
npm prune --omit=dev
npm start          # -> node --import tsx dist/main.js
```

- `npm start` loads the ESM output through `tsx` (kept in `dependencies` because
  the generated Prisma client uses `import.meta` + extensionless imports and
  cannot run under plain `node dist/main.js`).
- Apply migrations and seed before starting: `npm run db:deploy` (`prisma` is a
  dev dependency, so run it before pruned, or from a build stage that keeps it).
- `npm run verify:prod` rebuilds and confirms `dist/app.module.js` loads using
  the runtime dependency graph.

## Environment

All variables are listed in `.env.example` and validated at boot with a `zod`
schema (`src/config/`). The app fails fast with a readable message if any
required variable is missing or invalid. Tests use a separate `.env.test`
(see `.env.test.example`) pointing at a **separate** database.

## Database

- Schema: `prisma/schema.prisma` (authoritative data model — do not diverge).
- Migrations: `prisma/migrations/` (committed; never edit an applied migration).
- The `20261010043000_custom_constraints` migration adds what Prisma cannot
  express: the `pg_trgm` extension + GIN trigram indexes on `Product`, `CHECK`
  constraints (stock/price/quantity/rating) and partial unique indexes (one
  default address per user, one pending cancellation request per shop order).

## Demo data (dev only)

`npm run db:seed:demo` refuses to run with `NODE_ENV=production` and populates a
realistic catalog for frontend testing:

- 3 approved sellers/shops in different districts, with different delivery zones
  (nationwide + one limited to Dhaka/Chattogram/Sylhet) to exercise delivery quotes.
- 60+ active, in-stock products spread across all 11 seeded categories, with
  varied prices and multi-variant products.
- Locally generated placeholder images (sharp from SVG, no network): every
  category has an image and 10+ products have 3–5 image galleries (≥1200 px long
  edge, mixed aspect ratios) for the product-page zoom.
- A few low-stock and out-of-stock variants, 5 customers and a sample PENDING order.

It is idempotent: re-running only adds missing rows (it also replaces legacy
`picsum.photos` image URLs with locally generated ones).

Demo accounts:

| Role | Emails | Password |
|---|---|---|
| Seller | `seller1@planthaat.test`, `seller2@planthaat.test`, `seller3@planthaat.test` | `SellerDemo1` |
| Customer | `customer1@planthaat.test` … `customer5@planthaat.test` | `CustomerDemo1` |

## Realtime (WebSocket)

Notifications are pushed over a Socket.IO namespace `/realtime` (ticket auth,
no cookies). `POST /api/v1/realtime/ticket` returns a short-lived one-time
ticket; the browser connects with `auth: { ticket }`. See `docs/REALTIME.md` for
the full contract (handshake rules, events, revocation, limits, env). The
transport is designed to be reused by the future messaging module.

## Behind a BFF (Next.js)

When the Next.js server calls this API, set `BFF_SHARED_SECRET` and send it as
`X-BFF-Key` together with `X-Forwarded-For` so throttling/sessions/audit use the
real client IP. The BFF authenticates with `Authorization: Bearer <access token>`
(no browser `Origin`), and the refresh token is sent to `/auth/refresh` and
`/auth/logout` as the `ph_rt` cookie. `BFF_SHARED_SECRET` is required in
production.

## File storage

`STORAGE_DRIVER=local` (default) writes to `${UPLOAD_DIR}/public` (served at
`/uploads/<key>`) and `${UPLOAD_DIR}/private` (never served). `STORAGE_DRIVER=s3`
uses `@aws-sdk/client-s3` against any S3-compatible service (AWS S3, Cloudflare
R2, MinIO).

S3 setup:

- Env: `S3_BUCKET`, `S3_REGION` (or `S3_ENDPOINT` for R2/MinIO), `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_BASE_URL` (the CDN/public base for public
  objects, e.g. `https://cdn.planthaat.com`). These are validated at boot when
  `STORAGE_DRIVER=s3`.
- Bucket CORS (for browser direct access to public objects, if not behind a CDN):
  allow `GET`/`HEAD` from the site origins.
- Public objects are uploaded with `Cache-Control: public, max-age=31536000,
  immutable` and a correct `Content-Type`; private objects with `private,
  max-age=0, no-store`. Private seller documents are only reachable via
  short-lived presigned GET URLs (≈5 min); `GET /admin/sellers/:id/documents/:docId`
  redirects to the presigned URL (the local driver streams the file instead).

## API

- Base path: `/api/v1`
- Swagger UI: `/api/docs` (enabled when `ENABLE_SWAGGER=true`, disabled in
  production unless explicitly enabled)
- Ops: `GET /api/v1/health`, `GET /api/v1/health/ready`
- Success envelope: `{ "success": true, "data": ..., "meta"? }`
- Error envelope: `{ "success": false, "statusCode", "error": { "code", "message", "details"? }, "path", "timestamp" }`

## Out of scope in v1 (by design)

Online payment gateways and messaging are **schema-only**. See
`src/modules/payments` (`PaymentProvider` interface) and
`src/modules/messaging/README.md`.

# PlantHaat Backend

NestJS + Prisma API for PlantHaat, a multi-vendor online plant marketplace for
Bangladesh. See `../BACKEND_DESIGN.md` for the full design and `../AI_CONTEXT.md`
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
| `npm run db:seed:demo` | Dev-only demo data (3 sellers, 40 plants, 5 customers, a sample order) |
| `npm run docs:export` | Build and write the OpenAPI document to `openapi.json` |

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

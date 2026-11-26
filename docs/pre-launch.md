# Pre-launch readiness (2026-11-21)

This is the operational checklist for taking PlantHaat live. It is code/docs only where marked; the
owner actions are at the end.

## 1. Environment reference

Backend (production values required; the API refuses to boot when they are dev-looking):

| Key | Rule |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` behind the proxy |
| `DATABASE_URL` | production Postgres; migrations via `npm run db:migrate:all` |
| `APP_URL` | public `https://` URL, not localhost/.local |
| `API_URL` | public `https://` URL |
| `CORS_ORIGINS` | comma-separated public `https://` origins (no localhost) |
| `BFF_SHARED_SECRET` | ≥32 chars, server-only |
| `JWT_ACCESS_SECRET` | ≥32 chars, not `change-me`/`secret`/`test` |
| `DATA_ENCRYPTION_KEY` | ≥32 chars, not a default |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | real address, password ≥12, not `TestAdmin123!` etc. |
| `STORAGE_DRIVER` | `cloudinary` (or `s3`), never `local` |
| `CLOUDINARY_FOLDER` | includes a `/prod` segment |
| `MAIL_TRANSPORT` | `smtp` for real delivery; `log` only for staging |
| `MAIL_FROM` | real domain, not `*.local` |

Frontend (build/runtime): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `API_INTERNAL_URL`,
`BFF_SHARED_SECRET`, optional `SITE_ORIGINS_EXTRA`; `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.

Production settings baseline: `backend/scripts/prod-settings-baseline.ts` (dry-run default; requires
`PROD_API_URL`, `PROD_ORIGIN`, admin credentials; `--apply` writes). It turns Advance/providers OFF,
empties both numbers and keeps COD ON. Run it before traffic; never copy the dev bKash number.

## 2. Health, logging, errors

- Liveness: `GET /api/v1/health` (DB round-trip). Readiness: `GET /api/v1/health/ready`.
- Logs: Nest logger + gateway `Server-Timing`; secrets/numbers are never logged. Use the platform
  log drain. Error hook: add a `MailService`-style adapter or a `logger.error` collector externally;
  no new dependency is included.
- Scheduled jobs: settlement release every 5 min; payment expiry/SLA every 5 min; order auto-cancel
  hourly; upload orphan sweep hourly (dry-run configurable); session cleanup daily 03:00 + startup
  catch-up. Each job is idempotent and safe after downtime; check the logs after the first boot.

## 3. Database backup/restore (rehearse on `planthaat_test`)

1. `pg_dump --format=custom --no-owner "$DATABASE_URL" > planthaat-$(date).dump`
2. Restore into a scratch test DB: `pg_restore --clean --no-owner -d "$TEST_URL" planthaat-*.dump`
3. Run `npm run db:status:all` and the backend e2e preflight against the restored DB.
4. Keep `*.dump` and `backups/` out of git; store encrypted off-machine. The owner currently manages
   his data; no backup verification is automated.

Migration/rollback: every migration itend; do not drop data. Run `db:migrate:all` before
deploying and `db:status:all` afterwards. Cookie rename rollback logs users in once (old code ignores
`ph_web_*`); do not delete cookies server-side.

## 4. Email/SMS and notifications

- Verification, password reset: `MailService` (`log` in dev, SMTP when configured).
- There is no SMS provider; phone verification is not implemented. Order/payment/status events use
  the in-app bell and realtime socket; no external SMS/email order notification is sent.
- Documented templates: `mail.templates.ts`; review the sender/domain and SPF/DKIM before launch.

## 5. Public metadata/legal

- `robots.ts`, `sitemap.ts`, home/product/shop OG images exist; metadata is localized.
- Policy pages (`/policies/terms|privacy|refund-cancellation|delivery`) now show a visible
  “DRAFT POLICY - REVIEW WITH A LAWYER BEFORE LAUNCH” note. The refund text describes the
  setting-driven return window; no legal claim is invented.

## 6. Payment operations runbook

- Advance: buyer sends the exact total to the snapshotted bKash/Nagad number and submits TrxID +
  sender number (+ proof). Admin → Payments to verify: enter the received amount; only exact amount
  marks PAID, underpaid stays payable, overpaid creates a refund. Reject with a reason for resubmit.
- Refunds: Admin → Advance refunds; send money manually, record the TrxID; the ledger is append-only.
- Payouts/withdrawals: seller requests reserve the amount; admin → Withdrawals re-auth reveals the
  destination; reject returns the reserve with a reason; destination cooldown applies.
- Disputes: Admin → Complaints; decision `RESOLVED_REFUND`/`RESOLVED_REPLACEMENT`/`REJECTED`; refunds
  follow the refund queue and ledger.
- Reconciliation: Admin → Reconciliation shows the balanced state; a non-zero difference is an
  incident—freeze payouts and inspect the ledger, do not “adjust” without a ledger entry.
- COD: buyer pays the courier; seller confirms delivery; commission dues accrue; withdrawals block
  above the configured dues limit.

## 7. Realtime/CSP

- Realtime socket uses a short-lived ticket (`/realtime/ticket`) and the public URL
  `NEXT_PUBLIC_REALTIME_URL`; the production CSP `connect-src` must include that origin (http + ws).
- Next headers include CSP (production only), X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
  Permissions-Policy. Verify with `curl -I` on the production frontend, not only the code.

## OWNER ACTIONS

0. Cloudinary key rotation: **done** 2026-11-21; `npm run uploads:smoke` passed (public 200, private unsigned 404, signed 200, deleted 404).
2. Supply real photos (11 categories, product 4:5, banners desktop 1920x640 / mobile 960x640) via
   admin/Cloudinary; the placeholders are byte-identical.
3. Decide the merge (see `MERGE-PLAN.md`); nothing is pushed to `main`.
4. Legal review of the four policy pages; replace the draft notice.
5. Provide the production domain/accounts, SMTP credentials, and decide whether to enable Advance
   with a real receiving number after the isolated smoke run.

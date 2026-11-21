# Merge plan (feature branches → main)

Status: **ready to fast-forward**, not merged. Nothing was pushed to `main`.

## Branches and dry run (2026-11-21)

| Repo | Feature branch | main state | Commits ahead | Dry-run result |
|---|---|---|---:|---|
| `PlantHaat-Backend` | `feature/payments` | ancestor of feature | 50 | `git merge-tree --write-tree main feature/payments` → tree `b3a1e7fce4�`, **0 conflicts** |
| `PlantHaat-Frontend` | `redesign/phase2` | ancestor of feature | 86 | `git merge-tree --write-tree main redesign/phase2` → tree `f07100d9ea…`, **0 conflicts** |

Both merges are fast-forwards; the merged tree is identical to the tested feature tips (no merge
commit needed). Full test evidence on those tips: backend unit **272/272**, backend e2e **23 suites,
168 passed, 3 skipped** (known upload-key assertions), frontend Vitest **94 passed, 1 skipped**,
money Playwright **9/9 + 12/12 + 3/3 + 4/4 + 2/2**, sessions **18/18**, delivery-proof/response-photo
UI **1/1** (real Chrome), proof upload through the Cloudinary test prefix **1/1**, header/nav **5/5**.

## What is included

- Backend: settings registry/UI/history/re-auth, manual Advance payments (A1–A9), Part 4 settlement
  ledger/release/disputes/withdrawals/COD dues/reconciliation, auth sessions (role sliding + absolute,
  web cookie rename, session-expired dialog contract), admin Settings/Highlights/audit
  consolidations, upload tracking/backfill and production env hardening.
- Frontend: the full `redesign/phase2` track (tokens, shell, home hero + Highlights, catalog/PDP,
  cart/checkout/payments, seller/admin panels, sessions + inline session-expired login, admin audit
  consolidations, dev ribbon, production env checks, single `En | ???` header toggle, auth-aware
  header/mobile nav, in-place notifications popover/bottom sheet).

## Migrations (additive; apply in this order to BOTH databases)

1. `20261115070000_p5_history_sequence`
2. `20261115160000_settings_history_batch`
3. `20261115170000_p3_advance_payments`
4. `20261117203000_auth_session_absolute_expiry`
5. `20261118120000_p4_settlement_ledger`
6. `20261119120000_home_highlights_banner_fields`
7. `20261121120000_delivery_proof_and_response_photos`

Run `npm run db:migrate:all` (dev + `planthaat_test`, guarded) and record `npm run db:status:all`.
All are additive (new tables/columns, nullable/defaulted); no drops or rewrites. Rollback notes are in
each migration/spec and in `decisions-log.md`; the only irreversible operational change is the web
cookie rename (old `ph_at`/`ph_rt` are read once as a fallback, then cleared).

## Environment changes

- Backend `.env` adds/keeps: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
  `CLOUDINARY_FOLDER` (must contain `/prod` in production), `BFF_SHARED_SECRET` (required in
  production), `STORAGE_DRIVER=cloudinary` (production), `DATA_ENCRYPTION_KEY` (≥32 chars),
  `JWT_ACCESS_SECRET` (non-default), `ADMIN_EMAIL`/`ADMIN_PASSWORD` (real, not test defaults),
  `APP_URL`/`API_URL`/`CORS_ORIGINS` (public https only). The schema now rejects dev-looking values.
- Frontend `.env.local`/production: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`,
  `API_INTERNAL_URL`, `BFF_SHARED_SECRET`, optional `SITE_ORIGINS_EXTRA`; no new dependencies.
- Production settings: run `backend/scripts/prod-settings-baseline.ts` (dry-run first, then `--apply`)
  **before** switching traffic: Advance OFF, both provider numbers empty, COD ON. Never copy the dev
  bKash number.

## Rollout order

1. Back up both databases (owner procedure); apply migrations to `planthaat_test`, run backend e2e;
   then apply to the production database.
2. Deploy the backend API with the production env above; verify `/api/v1/health`, Cloudinary storage
   health, and that the startup env validation passes.
3. Apply the production settings baseline; confirm Advance is OFF and no provider number exists.
4. Deploy the frontend (same API contract); verify `/`, catalog, PDP, auth, cart.
5. Enable Advance only after the owner configures a real receiving number and the Part 3/4 smoke run
   on the isolated stack passes.
6. Run `uploads:reconcile` and `uploads:orphans` dry-run; then the scheduled jobs.

## Rollback

- Redeploy the previous backend and frontend images/commits. Do not drop additive tables/columns
  (old code ignores them) and do not rewrite data.
- Settings rollback: history is append-only; use Settings → history values (re-auth) or the API.
- If the web cookie rename misbehaves, the old code will not read `ph_web_*`; users sign in once.
  That is the safe failure mode; do not delete cookies server-side.
- Feature flags: Advance OFF and COD ON immediately restore the legacy checkout path.

## Owner uncommitted files (handle before merging)

- Backend: `prisma/seed-demo.ts`, `package-lock.json`, `scripts/start-api.ps1` (untracked). Decision:
  owner work, left uncommitted; archived with checksums in
  `E:\Development\Projects\_owner-files-archive\planthaat-item4-2026-11-21.zip`.
- Frontend: `.gitignore`, `next.config.ts` (`instantInsights` change), banners deletions,
  `public/placeholders/plant-placeholder.webp`, about page, public layout, `category-grid.tsx`,
  `products-list.tsx`, `tsconfig.json`, `public/fonts/Kalpurush.ttf` (untracked). Decision: owner UI/
  tooling work, left uncommitted; same archive contains copies and patch files.
- Do not stage or commit these as part of the merge; let the owner finish them first, then re-run
  `git status` and the merge dry-run. No conflicts are expected for the tracked feature work.
  `.gitignore`/`tsconfig.json` changes are tooling-generated (new dist dirs); the banner/placeholder/
  about changes are owner visual assets and must not be reverted.

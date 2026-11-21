# Backend documentation index

Canonical docs for the backend repo (`feature/payments`). Documentation lives only in `<repo>/docs`; one file per topic. Cross-cutting product/process docs and anything backend-owned live here. UI-owned docs live in `frontend/docs`.

| File | Purpose | Owner | Last verified |
|---|---|---|---|
| `BACKEND_CONTEXT.md` | Backend working rules, phase history, decisions/deviations, endpoint inventory | backend | 2026-11-18 (docs index added; historical log kept) |
| `BACKEND_DESIGN.md` | Backend final-state design: architecture, domain rules, API, DB, security | backend | 2026-10-20 |
| `BACKEND_CHANGE_REQUESTS.md` | Additive backend changes requested by the frontend | backend (for frontend) | 2026-11-18 |
| `UPLOAD_SYSTEM.md` | Upload/Cloudinary architecture, producer inventory, orphan safety, environment separation, production checklist | backend | 2026-11-19 |
| `home-highlights-guide.md` | Admin-facing guide for Home Highlights: image sizes, overlay/button/schedule tips, limits | backend | 2026-11-19 |
| `security/secret-rotation.md` | Secret findings and rotation order/effects | backend | 2026-11-19 |
| `decisions-log.md` | Single chronological decision log (both tracks) | cross-cutting | 2026-11-18 |
| `progress.md` | Single chronological implementation/resume log (payments + frontend consistency track) | cross-cutting | 2026-11-18 |
| `api/conventions.md` | Envelope, pagination, auth, idempotency, money/date conventions | backend | 2026-11-18 |
| `api/realtime.md` | Socket.IO `/realtime` ticket auth, events, limits, revocation | backend | 2026-11-18 |
| `api/home-highlights.md` | Home Highlights data model, public/admin API, validation, scripts, frontend behavior | backend | 2026-11-19 |
| `auth/sessions.md` | Access/refresh session model, cookies, refresh flows, security settings, short-TTL testing | backend | 2026-11-18 |
| `admin-audit.md` | Admin route inventory, duplicate/overlap findings, canonical owners, consolidation status | backend | 2026-11-20 |
| `MERGE-PLAN.md` | Feature?main merge plan, migrations/env/rollout/rollback, dry-run result, owner files | backend | 2026-11-21 |
| `pre-launch.md` | Production env, health/logging, jobs, backup/restore, email, payment ops, owner actions | backend | 2026-11-21 |
| `payments/PAYMENTS_MASTER_PROMPT.md` | Canonical payments/settings/settlement master spec | backend | 2026-11-18 |
| `payments/design.md` | Payments design note + amendments A1–A9 + owner decisions | backend | 2026-11-18 |
| `payments/api.md` | Manual Advance API contract, states, proof upload, jobs | backend | 2026-11-18 |
| `payments/manual-test.md` | Owner manual test script (COD + Advance + admin verify + seller gate) | backend | 2026-11-18 |
| `payments/live-report.md` | Advance live verification report (12/12 scenarios) | backend | 2026-11-18 |
| `settings/reference.md` | Every settings key, old hard-coded value, wiring location and guards | backend | 2026-11-18 |
| `settings/manual-test.md` | Owner manual test script for settings effects | backend | 2026-11-18 |
| `testing/baseline.md` | Backend e2e baseline, known skips, safe test-running rules, isolated production settings stack | backend | 2026-11-18 |
| `AGENTS-root.md` | Versioned copy of the workspace-root `AGENTS.md` (the root file is the live agent config) | workspace | 2026-11-18 |

## Isolated settings/test stack

`backend/scripts/test-stack.ps1 start|stop|status|seed` builds the backend and a production frontend (`NEXT_DIST_DIR=.next-test`) and runs API `:5001` (test DB) + frontend `:3002`. Never point settings specs at dev `:5000`/`:3000`. Full commands and fixtures are in `frontend/docs/testing/live-log.md` and `testing/baseline.md`.

## Frontend canonical docs

- `frontend/docs/FRONTEND_DESIGN.md`, `frontend/docs/FRONTEND_CONTEXT.md`
- `frontend/docs/design/audit.md`, `performance.md`, `typography.md`, `cart-checkout.md`, `DIRECTION.md`, `MASTER.md`
- `frontend/docs/testing/live-log.md`

## Moved documents

| Old path (workspace root) | New path |
|---|---|
| `docs/PAYMENTS_MASTER_PROMPT.md` | `backend/docs/payments/PAYMENTS_MASTER_PROMPT.md` |
| `docs/payments-progress.md` | `backend/docs/progress.md` |
| `docs/payments-design.md` | `backend/docs/payments/design.md` |
| `docs/payments-api.md` | `backend/docs/payments/api.md` |
| `docs/payments-manual-test.md` | `backend/docs/payments/manual-test.md` |
| `docs/settings-reference.md` | `backend/docs/settings/reference.md` |
| `docs/settings-manual-test.md` | `backend/docs/settings/manual-test.md` |
| `docs/auth-sessions.md` | `backend/docs/auth/sessions.md` |
| `docs/test-baseline.md` | `backend/docs/testing/baseline.md` |
| `docs/decisions-log.md` | `backend/docs/decisions-log.md` |
| `BACKEND_CHANGE_REQUESTS.md` | `backend/docs/BACKEND_CHANGE_REQUESTS.md` |
| `BACKEND_CONTEXT.md` | `backend/docs/BACKEND_CONTEXT.md` |
| `BACKEND_DESIGN.md` | `backend/docs/BACKEND_DESIGN.md` |
| `UPLOAD_SYSTEM.md` | `backend/docs/UPLOAD_SYSTEM.md` |
| `backend/docs/API_CONVENTIONS.md` | `backend/docs/api/conventions.md` |
| `backend/docs/REALTIME.md` | `backend/docs/api/realtime.md` |
| `backend/docs/payments-api.md` (older) | merged into `backend/docs/payments/api.md` |
| `backend/docs/payments-design.md` (older) | merged into `backend/docs/payments/design.md` |
| `backend/docs/payments-progress.md` (older) | merged into `backend/docs/progress.md` |
| `backend/docs/settings-manual-test.md` (dup) | merged into `backend/docs/settings/manual-test.md` |
| `backend/docs/settings-reference.md` (older) | merged into `backend/docs/settings/reference.md` |
| `backend/docs/test-baseline.md` (older) | merged into `backend/docs/testing/baseline.md` |
| `docs/design-review/live-log.md` | `frontend/docs/testing/live-log.md` |
| `docs/design-review/payments/REPORT.md` | `backend/docs/payments/live-report.md` |
| `docs/design-review/consistency/AUDIT.md` + `home-consistency/AUDIT.md` | `frontend/docs/design/audit.md` |
| `docs/design-review/consistency/PERF.md` | `frontend/docs/design/performance.md` |
| `docs/design-review/cart-checkout/README.md` | `frontend/docs/design/cart-checkout.md` |
| `docs/design-review/typography/*.md` | `frontend/docs/design/typography.md` |
| `FRONTEND_DESIGN.md` | `frontend/docs/FRONTEND_DESIGN.md` |
| `FRONTEND_CONTEXT.md` | `frontend/docs/FRONTEND_CONTEXT.md` |
| `design-system/planthaat/DIRECTION.md` | `frontend/docs/design/DIRECTION.md` |
| `design-system/planthaat/MASTER.md` | `frontend/docs/design/MASTER.md` |
| `prompts/*.md` | `frontend/docs/process/prompts/*.md` |

## Conventions

- Docs live only in `<repo>/docs`; do not create a separate docs repo or root-level docs.
- One canonical file per topic. Cross-reference the other repo instead of duplicating content.
- No screenshots or raw measurement dumps are committed. Agent screenshots go to a gitignored folder such as `frontend/.artifacts/` (or the OS temp dir) and are deleted after the report text is written. Only owner-provided reference images may live in `frontend/docs/reference/`.
- Temporary scripts and diagnostic specs are deleted at the end of the task that created them.
- Progress and decision logs are single files, appended chronologically (`progress.md`, `decisions-log.md`).
- Every task updates the canonical docs instead of creating new files.
- File names are kebab-case, except established spec names such as `PAYMENTS_MASTER_PROMPT.md`, `BACKEND_CONTEXT.md`, `BACKEND_DESIGN.md`, `FRONTEND_DESIGN.md`, `FRONTEND_CONTEXT.md`, `DIRECTION.md`, `MASTER.md`, and `AGENTS-root.md`.

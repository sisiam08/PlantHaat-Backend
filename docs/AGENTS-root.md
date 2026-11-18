# PlantHaat — Project Agent Rules

## Purpose
PlantHaat is a multi-vendor plant marketplace for Bangladesh: a NestJS/Prisma API in `backend/` and a Next.js 16 storefront/seller/admin app in `frontend/`. Preserve existing behavior, API contracts, permissions, pricing, inventory, cart/checkout, seller and admin flows unless the task explicitly changes them.

## Repo layout and branches
- `backend/` — separate git repo; work on `feature/payments`. Never push payment/settings/ledger work to `main`; merge only when the owner says so.
- `frontend/` — separate git repo; work on `redesign/phase2`.
- The workspace root is not a git repo. It holds only `AGENTS.md`, opencode config (`.opencode/`, `.editorconfig`) and the two repos.
- Never run `git reset --hard`, rebase/rewrite history, or force-push. Do not stage or overwrite the owner's uncommitted files (about page, banners, config, `prisma/seed-demo.ts`, fonts, etc.); check `git status` before every commit.

## Hard rules
- Do not fabricate product data, stock, prices, delivery promises, seller trust claims or payment states. Never silently remove, mock or weaken a feature.
- Keep loading, empty, error, success, disabled and permission-denied states; consider guest→authenticated cart, checkout validation and seller-wizard validation.
- Never expose, print, commit or modify secrets. The bKash number in dev settings is the owner's real number: keep it, never print it unmasked.
- Servers: one supervised API on `:5000` and the frontend dev server on `:3000`; `:3100` stays OFF. Do not delete `.next` while the dev server runs or `backend/logs` while the API runs.
- Migrations are additive on both DBs via `npm run db:migrate:all`; record `db:status:all`. `backend/backups/` and `*.dump` stay gitignored.
- Use Playwright/axe for UI work; report only checks that actually ran.

## Frontend rules
- Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui + Radix, next-intl, TanStack Query/Table. Server Components by default; add `use client` only for interactivity.
- Light-only theme. Use existing design tokens/semantic layers; no parallel token system or off-token values.
- Typography: Inter for Latin, Hind Siliguri for Bangla (the supplied `Kalpurush.ttf` has no Bengali glyphs and is not wired). Verify mixed-script wrapping, line-height and Latin digits with the taka sign before amounts.
- Use semantic HTML, accessible names, keyboard support, visible focus and 44px targets. Keep responsive layouts usable at 360px, not scaled desktop.
- Prefer existing shared components; avoid duplicate components, unnecessary dependencies, broad refactors and boolean-prop sprawl.

## Working process
1. Audit the target and state a scoped plan.
2. Implement in small, reviewable steps.
3. Run the real repo scripts: `npm run typecheck`, `npm run lint`, tests, build; use Playwright at mobile and desktop where UI changed.
4. Summarize changes, checks actually run, known gaps and migration/config impact.
5. Never commit or push unless the task explicitly says to.

## Documentation
Docs live only inside the two repos: `backend/docs/` and `frontend/docs/`. One canonical file per topic; no duplicates, screenshots/measurement dumps, root-level docs or separate docs repo. Progress/decisions are single appended files. Update canonical docs in the task instead of creating new files.

Canonical entry points:
- Backend: `backend/docs/README.md` — master spec `payments/PAYMENTS_MASTER_PROMPT.md`, `progress.md`, `decisions-log.md`, `payments/design.md`, `payments/api.md`, `settings/reference.md`, `auth/sessions.md`, `testing/baseline.md`, `BACKEND_DESIGN.md`, `BACKEND_CONTEXT.md`.
- Frontend: `frontend/docs/README.md` — `FRONTEND_DESIGN.md`, `FRONTEND_CONTEXT.md`, `design/DIRECTION.md`, `design/MASTER.md`, `design/audit.md`, `design/performance.md`, `design/typography.md`, `design/cart-checkout.md`, `testing/live-log.md`.
- A versioned copy of this file is kept at `backend/docs/AGENTS-root.md`.

## Docs conventions
- No screenshots or raw measurement dumps are committed. Agent captures go to gitignored `frontend/.artifacts/` or the OS temp dir and are deleted after the written report is updated. Only owner-provided reference images may live in `frontend/docs/reference/`.
- Temporary scripts/diagnostic specs are deleted at the end of the task that created them.
- Kebab-case filenames, except established spec names (`PAYMENTS_MASTER_PROMPT.md`, `BACKEND_CONTEXT.md`, `BACKEND_DESIGN.md`, `FRONTEND_DESIGN.md`, `FRONTEND_CONTEXT.md`, `DIRECTION.md`, `MASTER.md`, `AGENTS-root.md`).

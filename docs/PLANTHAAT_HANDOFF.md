# PlantHaat — handoff for a new session

Owner: Siam (Bangladesh). Reply to him in Bengali script (বাংলা), never Banglish. He is not a native English reader of long text: keep answers short, concrete, with examples.

## Project
PlantHaat: plant marketplace for Bangladesh. Frontend Next.js 16 (branch `redesign/phase2`), backend NestJS + Prisma + Postgres (branch `feature/payments`). Never push to `main`, never force-push or rewrite history. Docs live ONLY in each repo: start at `backend/docs/README.md` and `frontend/docs/README.md` (index + moved-docs map). Canonical specs: `backend/docs/payments/PAYMENTS_MASTER_PROMPT.md` (rules, payments, settlement), `backend/docs/progress.md` (status), `backend/docs/decisions-log.md`, `frontend/docs/FRONTEND_DESIGN.md`, `FRONTEND_CONTEXT.md`, `frontend/docs/design/*`.

## Working rules that matter
- Do not touch the owner's uncommitted work (about page, banners config, fonts, `prisma/seed-demo.ts`, package-lock, `scripts/start-api.ps1`, category-grid, tsconfig): check `git status` first.
- Ports: frontend dev :3000, API :5000, :3100 OFF. Every migration through `npm run db:migrate:all` (dev + `planthaat_test`, guarded). Tests use `planthaat_test` only; never write test values to dev settings. Start servers detached; one API process.
- Never print secrets or full phone numbers (the owner's real bKash number is saved in dev settings).
- Presentation decisions to keep: light-only forest/marigold tokens; Inter + Hind Siliguri only; Latin digits 0-9 in both locales, ৳ BEFORE amounts (`<Price>`); no shop name on product cards, rating row with star; single-link cards, keyboard-only focus ring overlay; Qty wording; one summary per page with buttons inside; one primary marigold action per region; 44px targets; no horizontal overflow; CLS <= 0.1; no 3D libraries, no fabricated data/images.
- Verify visually in a real browser (headed Playwright), view screenshots, report evidence; run suites serially; never revert tests to get green.

## What is built (see progress.md for hashes)
Redesign A–G; cart/checkout fixes; Settings registry + admin Settings UI (re-auth, history, batch save); silent token refresh/sessions; Advance payment (bKash/Nagad manual TrxID, state machine, admin verify/refund queues); Part 4 settlement ledger (48h return window, disputes, wallet, withdrawals, COD dues, reconciliation) with UI; Cloudinary uploads with attach lifecycle and safe orphan cron; admin-controlled Highlights slider + Settings → Home (hero text, chips, optional hero image); docs reorganized.

## Open items
1. Rotate the Cloudinary API key/secret (old values are in git history of `.env.example`); then run `npm run uploads:smoke`.
2. Real photos: 11 category images (square, 600px+), product photos (4:5), banners (desktop 1920x640, mobile 960x640) uploaded via admin (Cloudinary), not the public folder.
3. HERO (done 2026-11-20): restored the owner-preferred left side from `f100858` (badge, settings headline/subheadline, native GET search, two links) and added a borderless right-side scene of four real cutouts (monstera, palm, snake, calathea) with a progressive-enhancement WebGL sway. Static `<img>` is the no-JS/reduced-motion/save-data/no-WebGL result; `home.hero.image` replaces it statically. Build assets with `frontend/scripts/build-hero-assets.mjs` from the uncommitted root `hero-source/` photos; see `frontend/docs/README.md`. Chips are unwired. LCP trade-off documented in `frontend/docs/design/performance.md`.
4. Seller/admin panel visual consistency; larger performance program (fonts, critical CSS, catalog LCP); pre-launch checklist (prod env vars, HTTPS, Secure cookies, backups, monitoring, rate limits, CSP, legal pages: privacy, terms, returns).
5. Legal/business caution already given: holding buyers' money on the platform's personal bKash needs proper business setup (I am not a lawyer).

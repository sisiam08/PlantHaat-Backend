# Implementation progress (single canonical log)

> Chronological log for backend payments/settings/settlement and the frontend redesign/consistency track. Append new entries here; do not create new progress files. The "advance stays false until Part 3" lines are historical (settings was prepared before Part 3); the current state is at the top.

## Current state (2026-11-18)

- Backend `feature/payments`: settings foundation, auth sessions, manual Advance payments (bKash/Nagad TrxID verification) and refund obligations are implemented. Part 4 settlement ledger/COD dues/unified hold window remains.
- Frontend `redesign/phase2`: customer consistency, payments UI, auth session refresh and performance re-baseline are implemented.
- Dev DB settings are owner-managed: Advance ON, bKash ON with the owner's real number, Nagad OFF, COD ON (last changed 2026-11-16 11:11 UTC). Never print, delete or overwrite the number.
- Isolated verification stack: `:5001` (planthaat_test) + `:3002`; dev servers `:5000`/`:3000`; `:3100` stays off.
- Docs consolidated into the two repos on 2026-11-18; old-root path map is in `README.md`.
- 2026-11-19 image storage: dev now uses Cloudinary (`STORAGE_DRIVER=cloudinary`); 109 legacy local URLs migrated (98 product images, 11 categories; one avatar file was already missing); every upload flow now marks `UploadedAsset` ATTACHED and replacement/removal cleans Cloudinary safely. See `BACKEND_CONTEXT.md` and `decisions-log.md`.


## Verified backlog (2026-11-21)

| Item | Status | Evidence |
|---|---|---|
| P0-1 money suites | Done for the documented suites | Part 4 all 9/9 (order matters: settlement first, permissions last); payments-advance 12/12; settings 3/3; proof upload through the Cloudinary test prefix 1/1. Backend unit 272/272 and e2e 168 passed/3 known-skips; frontend Vitest 94/1 skip. The whole frontend Playwright matrix was not run in one pass; the documented money/session/admin groups passed. |
| P0-2 dev/prod separation | Done | Non-production ribbon on admin/seller/checkout/payment (real Chrome screenshot); production env validation + 9 tests; production settings baseline script (dry-run default). Not run against production (owner action). |
| P0-3 uploads | Done | 109 missing UploadedAsset rows created (11 categories, 98 product images); reconcile now 118 rows / 3 untracked (1 broken local avatar + 2 external picsum); Radix avatar fallback covers the broken URL; seller dispute-response photos and delivery proof are implemented (2026-11-21 Task 1). |
| P0-4 secrets/abuse | Done (2FA design optional; Cloudinary rotated) | Secret gate passes; Cloudinary key rotated 2026-11-21 and `uploads:smoke` passed; history contains the old value at `.env.example` 35675ba only. Throttles for payment/upload/withdrawal/complaint/checkout + metadata test 6/6; production CSP/headers verified with curl; auth reset/verify covered by the 168-passing backend e2e. |
| P1-1 performance | Open | Not re-measured in this pass. |
| P1-2 seller/admin consistency | Partial | Admin duplicate audit/axe done; seller-page audit and full design-conformance extension open. |
| P1-3 quality debt | Done | unused vars removed; home padding decided (12 header/16 content); Date.now warning not reproducible; only the known react-hook-form compiler skips remain. |
| P2-1 pre-launch | Done | `pre-launch.md`, policy draft notice, env rules, jobs/backup/payment ops; owner actions listed. |
| P2-2 merge plan | Done | `MERGE-PLAN.md`; both mains are ancestors, 0-conflict fast-forward dry-runs. |

## Backend/payments log

﻿# Payments implementation progress

- [ ] 5a settings registry + migration + history + public endpoint
- [ ] 5b settings values
- [ ] 5c behavior wiring / snapshots
- [ ] 5d admin settings UI
- [ ] 5e settings tests
- [ ] 5f docs
- [ ] 3a payments design finalized
- [ ] 3b checkout selector
- [ ] 3c payment backend
- [ ] 3d payment frontend
- [ ] 3e payment tests
- [ ] 3f docs
- [ ] 4a ledger design/deferred
- [ ] 4b ledger core
- [ ] 4c lifecycle/release/disputes
- [ ] 4d durable jobs
- [ ] 4e withdrawals
- [ ] 4f UI
- [ ] 4g tests
- [ ] 4h report

Blocked before first migration: verify DB backup restore.
- [ ] 5a settings registry + migration + history + public endpoint — BLOCKED before migration: backup restore verification failed (local PG 0xC0000142)
- [ ] 5b-5f — blocked behind 5a
- [ ] 3a-3f — note updated with A1-A9
- [ ] 4a-4h — note updated with A1-A9
## Batch 1 status — settings foundation (commit 34f4d12, backend main)
- [x] 5a registry, additive migration, history table, cache, admin registry/history endpoints, public endpoint
- [x] DB guard script and dump ignore
- [ ] 5b/5c wiring and admin UI — next
- Tests: backend tsc/build pass; public endpoint 200; migration applied on dev DB (host printed by guard)
- Rollback: `DROP TABLE "SystemSettingHistory";` (additive table only; no existing rows touched)
- Note: backup restore verification skipped by owner decision
## Batch 1 tests — feature/payments (2a553cb)
- Registry: 5 tests pass (defaults/types/labels, invalid mobile/hours/commission, public↔sensitive disjoint, public contract, masking).
- Service: 4 tests pass (default fallback, cache invalidation, one history row per change, both payment methods disabled rejected).
- Public endpoint returns 200.
- Batch 2 (reauth + admin UI) and Batch 3 (wiring + grep check) not started yet.
- Backend main still contains 34f4d12; not force-reset pushed. feature/payments contains 34f4d12 + 2a553cb.
## Batch 2 DB/test hardening (78511d8 + next)
- Migration applied to both DBs; `db:migrate:all` and `db:status:all` added.
- E2E preflight fails if test DB is behind.
- Real-DB history tests: 4/4 (success, forced rollback, 10 concurrent writes, duplicate behavior).
- Admin e2e: 6/6.
- Admin UI, characterization and Batch 3 wiring remain.
## History chain (post Batch 2)
- Added `applySettingChange` with INSERT-if-missing + SELECT ... FOR UPDATE + update + history in one transaction.
- Added `sequence` (SERIAL, unique) to SystemSettingHistory; migration applied to dev and planthaat_test via db:migrate:all.
- Integration: 4/4 — success chain, forced rollback, 10 concurrent writes with old[n]==new[n-1], duplicate chain.
- Unit settings: 14/14.
- Admin Settings UI and Batch 3 wiring remain.
## API process management (2026-11-15)
- Start only when down: `powershell -File backend/scripts/start-api.ps1`
- It checks `/api/v1/health` first, exits if healthy; otherwise starts one detached `scripts/serve-supervised.mjs` with stdin/stdout/stderr redirected.
- Never start a second API; verify one supervisor + one `dist/main.js` child.
- :3100 stays off.
## Batch 2d — Admin Settings UI (frontend commit next)
- Tabbed Payments/Orders/Wallet/Payouts/Support; dynamic registry fields, defaults/reset, unsaved guard.
- Re-auth AlertDialog for sensitive keys; token sent as header, never localStorage.
- Recent history + last-changed per field; payments preview; one-payment-method hint.
- Live check: 5 tabs, 7 fields visible, history present, no horizontal overflow at 1280.
- Remaining: characterization + Batch 3 wiring/grep guard.
## Resume point
Next: characterization tests (COD, delivery/free-delivery, commission, 48h wording/timers) then Batch 3 wiring. Backend feature/payments at 64f6e57; frontend redesign/phase2 at 58cf314. Both DBs migrated. Admin UI basic version done; help text/validation messages and real payment preview still to polish. API supervised PID 12348/child 19444; :3000 up; :3100 off.
## Payment provider safety
- Defaults: bKash/Nagad enabled = false.
- Backend rejects provider enabled without valid BD number; Advance requires an enabled, valid provider.
- UI disables provider checkbox until number valid, inline issues, sticky save/discard, plural count, summary label.
- Dev stored payment settings: only `payment.advance.enabled=true`; no provider numbers. History: admin@planthaat.local changed advance false→true at 2026-11-15 07:51 UTC. Not modified.
- Screenshot bKash number was not present in dev DB.
- UI e2e pending; backend settings tests 5/5.
## Customer-visible wiring slice
- Reset `payment.advance.enabled` to false through admin re-auth + history.
- Rebuilt API. Provider defaults now false; no provider numbers stored.
- Wired `payment.cod.enabled` and `order.codMaxAmount` in checkout UI + backend order creation.
- Public settings fetched by checkout with 60s stale time.
- Not yet wired: support contacts, return window, commission, payout/payment timings. No UI e2e yet.
## Payment-method safeguard
- effectiveAdvance is false until Part 3; COD cannot be disabled (backend validation + UI disabled reason).
- Checkout shows "Ordering is temporarily unavailable" if no method is active.
- Settings UI now shows Active / Not active yet from registry `wired`.
- Settings tests 5/5. COD order behavior tests and support/return/commission wiring still pending.
## Checkout encoding fix
- Fixed checkout ×/·/→ mojibake and products-browser quote/infinity/price strings.
- Added frontend `.editorconfig` (UTF-8) and Vitest repo scan: 1/1 pass.
- Next: Qty component, vertical gaps, sticky checkout summary, duplicate info and geomettry e2e.
- Done: shared Qty/unit line, checkout spacing diagnosis/fix, sticky summary actions, de-duplicated summary, geometry e2e (30/30). Docs: frontend/docs/design/cart-checkout.md. Next: settings wiring only when scheduled.
## Session 2 - isolation, COD tests, wiring, settings polish (2026-11-15)
- Added test/settings-test-helper.ts: clears SystemSetting rows + SettingsService cache before/after settings-touching suites; COD suite uses unique test-prefixed data and cleans in afterAll.
- COD real-DB tests: 7/7 (defaults, 0=no limit, exact limit accepted / limit+1 rejected against server grand total, disabled rejects, cannot disable while advance inactive, zero-method state, commission.default 12.5 strict money).
- Wiring: complaints use return.windowHours; footer/contact read support.* with env fallback; trust strip + PDP use return.windowHours; commission.default already the last-resort rate and now characterization-tested.
- Cache: admin PATCH /admin/settings revalidates the `settings` tag; public settings cache is stale:0, revalidate:60. Gateway now forwards x-settings-reauth.
- Settings UI: grouped bKash/Nagad/Timing/Checkout cards, bilingual help, sticky Save/Discard, specific validation, inline re-auth error, 1280/360 screenshots.
- Docs: settings-reference.md and settings-manual-test.md completed; copied to backend/docs for git history.
- E2E settings suite needs ADMIN_EMAIL/ADMIN_PASSWORD and restores changed values; it leaves history rows for sensitive changes unless cleaned.
- Final checks: backend typecheck/lint pass; backend unit 222/222; COD real-DB 7/7; frontend typecheck pass; full frontend lint 0 errors; Vitest 50/50; settings Playwright 3/3.
- Known gaps: full backend e2e still has pre-existing failures in upload key expectations, products/catalog isolation, review/seller-timeout keys missing from the registry, and concurrency timeouts; not caused by the COD/settings changes. Frontend full e2e still has compile/timeout flakes in auth, seller-dashboard overflow, messages bn home and qa-content; affected pages were rechecked separately where possible.
- Settings e2e writes real history rows while changing values; values are restored, and test history rows were cleaned from dev after the final run. Prefer running it against the test API in future.
## Admin settings persistence bugfix (2026-11-16)
- Root causes: the gateway did not forward x-settings-reauth (sensitive number saves were rejected); the controller rejected more than one sensitive key per save; re-auth tokens were key-scoped instead of save-scoped; validation returned one generic message without per-key details; history had no batch id for one-save groups.
- Fix: one Save sends all changed keys and is applied in one transaction validated against the merged resulting state; one re-auth prompt/token scoped to the exact sensitive key set, single-use and tamper-proof; per-key validation details shown inline and form state kept; one history row per key with shared batchId; admin GET refetch on mount; history masks sensitive values.
- Isolated test env: API :5001 on planthaat_test, frontend :3002 against it. Playwright persists number + bKash + Advance through five reloads and shows inline error when the number is cleared.
- Tests: backend unit 223/223; admin+settings-batch+COD e2e 18/18; frontend Vitest 50/50; Playwright persistence 1/1.
- Dev settings remain untouched: payment.advance.enabled=false, no provider enabled, no provider number. Owner can now enter the real bKash number and Save once.
## Part 3 backend - Advance payments (2026-11-16)
- Additive migration 20261115170000_p3_advance_payments applied to dev and planthaat_test: PaymentIntent, PaymentIntentAllocation, PaymentSubmission, RefundObligation + ADVANCE enum. Existing orders untouched.
- Checkout accepts ADVANCE behind payment.advance.enabled + enabled provider + valid number; amounts remain server-computed; stock is held; COD unchanged.
- Buyer/admin/seller APIs and payments/api.md added. Refund obligations handle cancellation, overpayment and late-payment-without-stock.
- Jobs: startup + every 5 minutes, UNPAID-only expiry and SLA alert; stored timestamps, locks, idempotent.
- Tests: advance e2e 10/10; COD e2e 7/7; backend unit 223/223; lint/typecheck pass. Four baseline upload/dues failures are skipped with visible reasons (testing/baseline.md).
- Advance remains OFF in dev. No frontend payment page built in this session.

## Customer-facing fixes (2026-11-16)
- Product cards: shop name removed; rating row now shows one marigold star + one-decimal average + (count), with reserved height for unreviewed products. Shared card used by home rails, feed, catalog, wishlist, related and shop grids.
- Digits: all customer/admin numbers use Latin digits in both locales. Shared helpers force `bn-BD-u-nu-latn` + `numberingSystem: latn`; ৳ always precedes the amount. ICU plural counts now receive preformatted strings.
- Auth entry: /login, /register and /register/seller server-redirect valid sessions to a sanitized next/callback/returnTo or role home; stale cookies are cleared through /auth/continue; bfcache is covered by a client guard.
- Cart replay: backend order transaction already deletes only purchased lines atomically; idempotent retry leaves newer lines. Client now marks the guest snapshot handled on merge and order, clears guest storage + React Query cart caches on success, and never replays a snapshot older than the last merge/order. No duplicate orders were found for the demo customer.

## Part 3 frontend - Advance payment UI (2026-11-16)
- Checkout: functional COD/Advance selector; Advance shows the amount due and "Pay now by bKash or Nagad"; only enabled methods; ordering-unavailable state kept; ADVANCE redirects to /checkout/payment/[orderId].
- Payment page: buyer-only, refresh/back safe; provider toggle from the order snapshot; warning, number + copy fallback ("Copied"), 4 steps, form (sender/TrxID, optional proof upload through /uploads/images purpose=payment), double-submit guard, states UNPAID/PENDING/PAID/REJECTED/EXPIRED/underpaid/overpaid/partial refund, expiry countdown, WhatsApp help from public settings.
- Orders list/detail: payment badge, Complete payment action, amount/paid/refund + submission timeline (submitted/reviewed), ADVANCE only.
- Admin: /admin/advance-payments (pending-first, SLA highlight, proof viewer limited to stored internal URLs, verify with mismatch warnings, reject with required reason in AlertDialog, card fallback below md), /admin/advance-refunds (complete dialog with refund TrxID); grouped nav entries with counts.
- Seller: payment badge on list/detail, confirm/ship disabled with reason until PAID (server already enforced).
- Settings: real payment-page preview from unsaved draft values; bKash/Nagad enable flags marked wired.
- Notifications: payment verified/underpaid/rejected link to the payment page or order.
- Docs: payments/manual-test.md (en + bn), settings/reference.md updated, proof contract in payments/api.md.
- Isolated stack: backend/scripts/test-stack.ps1 seeds planthaat_test (fake admin, 2 buyers, 3 shops, 6 products, Advance ON, bKash 01700000000, Nagad 01800000000) and runs API :5001 + frontend :3002. Dev settings untouched (Advance OFF, providers OFF, no numbers).

### Part 3 frontend verification (2026-11-16)
- Isolated stack :5001/:3002 (fake data + fake numbers), stopped after the run.
- Playwright e2e/payments-advance.spec.ts (12 scenarios): COD, full ADVANCE journey with UI copy/form/proof and admin UI verify, rejection+resubmission, duplicate TrxID (409), underpayment+second TrxID, overpayment refund obligation, UNPAID expiry with stock return and PENDING_VERIFICATION not expiring, late payment in grace with reinstatement, partial refund after one-shop cancellation, permissions (other buyer 404, seller sees status only), settings snapshot (old order keeps old number, new order uses new number, provider off hides bKash). All 12 passed across the runs; screenshot scenarios captured 360/1280 en/bn.
- Existing suites (dev :3000, desktop project): checkout geometry 32/32 after raising its timeout for the extra payment card, messages 8/8, typography 8/8, overflow 9 pass/1 skip, scroll-restore 6/6 after stabilising the mobile filter-sheet wait, cart-quantity 2/2, digits 1/1. Vitest 52/52; frontend typecheck/lint green (warnings only).
- Backend: unit 223/223; advance e2e 11/11; typecheck/lint/build green.
- Screenshots: frontend/.artifacts/payments/ (unpaid/pending/paid/rejected/underpaid/expired 360+1280 en, unpaid bn 360/1280, checkout selector en/bn, admin queue/refunds, seller orders/gating, settings preview).
- Dev settings: NOT modified by this session. The owner's records show Advance already ON with a real bKash number (last change 2026-11-16 11:11 UTC, before/independent of this work). Display only masked; do not print. Test values never entered dev.
- Remaining Part 4: ledger entries for refunds/COD dues/settlement, unified return/payout window (design note added), and the skipped earnings dues test re-diagnosis.

## Auth sessions (2026-11-17) - branch feature/payments + redesign/phase2
- Root cause: 15-minute access cookie disappeared; server refresh only ran on selected paths and could race the gateway/client; grace replies without `ph_rt` made the Next refresh helper treat a live session as dead; gateway never persisted rotated refresh cookies.
- Backend: sliding + absolute refresh sessions per role (customer 30/90, seller 14/60, admin 7/30 days), 15-minute access tokens, 30 s reuse grace, rotation/reuse detection, rate-limited refresh, startup+cron cleanup, password change revokes all, password reset/logout unchanged semantics. Additive migration `20261117203000_auth_session_absolute_expiry` (nullable `absoluteExpiresAt`, backfilled with `expiresAt`) applied to `neondb` and `planthaat_test` via `db:migrate:all`.
- Settings: new admin-only group `security` (8 keys) in the registry, validation (absolute ≥ sliding), admin UI tab “Security & Sessions”. Not public; no re-auth required.
- Frontend: proxy refreshes missing/expired access with the refresh cookie, propagates new cookies to the same navigation, handles `/login` + `/register` logged-in redirects, returns `returnTo` + localized expiry reason only on real auth failures; gateway writes both rotated cookies and `x-auth-refresh-generation`; server `getSession()` refreshes once and separates auth vs transient; client single-flight + cross-tab lock + expiry toast.
- Tests: backend `auth-sessions.e2e` 8/8, `auth.e2e` 9/9, unit auth/controller/settings/env 46/46; Playwright `session-refresh.spec.ts` 8/8 desktop + 8/8 mobile on the 10 s access-TTL stack (customer/seller/admin, en/bn, two tabs, 10 parallel = one refresh, revocation→returnTo→login, no storage tokens). Existing suites: auth-redirect 4/5 in the full slow-dev run (all 5 pass individually), access-control 6/9 (slow-dev h1 timeouts), cart-persistence timed out on `/checkout` networkidle.
- Docs: `auth/sessions.md` (lifetimes, cookies, flows, settings keys, short-TTL testing, rollback), `settings/reference.md`.

## Advance payment live verification (2026-11-18)
- Isolated stack `:5001` (planthaat_test) + `:3002`, fake seed only; dev data/settings untouched. Headed Chromium, serial.
- **12/12** `payments-advance.spec.ts` scenarios passed: COD, full Advance (checkout → payment page → proof/TrxID → pending → admin exact-amount verify → seller unlock/confirm/pack), rejection+resubmission, duplicate TrxID (409), underpayment+second TrxID, overpayment refund, UNPAID expiry + stock return, PENDING_VERIFICATION not expiring, late-payment grace, partial refund, permissions, settings snapshot, screenshots.
- Supplemental seller ship walk: `CONFIRMED → PACKED → SHIPPED`; buyer reads `SHIPPED`.
- Settings specs against the isolated stack: grouping/history passed; sensitive and persist specs timed out on the slow `:3002` dev server (saves/persisted values visible in the failure snapshots); no product bug. Report: `frontend/.artifacts/payments/REPORT.md`.
- Dev settings actual state (not written by this session): advance ON, bKash ON with the owner's real number, Nagad off, COD on; history last change 2026-11-16 11:11 UTC. The real number was never printed/changed/deleted. Safe to use Advance in dev is already true; the owner should re-confirm the number and manual verification process before real money.




## Frontend consistency track

# Customer-facing consistency — progress / resume

Branch: `redesign/phase2` (frontend); backend `feature/payments`. API `:5000`, frontend
`:3000`, `:3100` kept off.

## Commit state

- `f100858` — home consistency batch. Pushed.
- `306d6ef` — customer page-shell batch. Pushed.
- `d5eaf1d` — auth POST fallback. Pushed.
- New batch (2026-11-17 resume): auth pre-hydration, silent-refresh evidence/grace, copy/date
  pass, shared card surfaces, rail minimum, checkout empty state, a11y fixes, design/a11y
  specs. Committed separately from the owner's dirty files.
- Owner-uncommitted files (about page, banners, `next.config.ts`, `home-banners.ts`,
  `category-grid.tsx`, `providers`, seller products, `.gitignore`, fonts) were not staged.

## Auth / session evidence

- Reproduced the old failed matrix: a Submit click before React hydration triggered the
  native POST to `/login`; `/api/v1/auth/me` returned `data:null` and protected pages
  redirected. The session itself was valid.
- After the fix, the matrix asserts `page.url()` is not `/login` and `/api/v1/auth/me` is
  200 before every screenshot: **130/130 authenticated screenshots, 0 errors** across
  bn/en × 1280/1440/768/390/360 (cart empty/filled/error, checkout, payment, order detail,
  orders, wishlist, account/addresses/sessions, notifications, complaints/new, PDP).
- Silent refresh verified with only `ph_at` removed: `/account` refreshed via `proxy.ts` and
  stayed on `/account`; cookies re-issued. `auth/sessions.md` records the contract.
- Backend grace window raised to 20 s (schema default + dev env); rotation, grace, reuse and
  expiry unit tests 33/33.

## Done in this run

1. Auth forms: `inert` + disabled Submit until hydration (`useHydrated`), no credentials in
   the URL, no native error page. Tested with JS disabled and normal en/bn login.
2. Copy/format: one date formatter implementation (Latin digits, localized month); localized
   `paymentMethod` in order detail; shared "info card" heading size; 44px secondary links in
   order/account/checkout/PDP/notifications/payment; header Log in/Register 44px.
3. Surfaces: shop/cart/checkout/filter/info cards use `rounded-xl` (feature 2xl),
   `border-border/60`, `shadow-[var(--shadow-soft)]`; catalog sort trigger 44px (`size="lg"`).
4. Home rails: any rail with `<4` unique in-stock plants after dedupe is hidden; Pet safe
   stays, Low light disappears; first-paint ordering/dedupe unchanged.
5. Checkout with an empty cart shows the shared empty state (no zero-total form).
6. A11y: auth layout owns `<main>`, seller apply has a main landmark, gallery carousel label,
   payment h1 in loading/error, checkout summary scroll region focusable.
7. Specs: `e2e/design-conformance.spec.ts` extended (copy/encoding, Latin price digits, taka
   position, heading scale, header/footer targets, duplicate-free rails); new
   `e2e/a11y.spec.ts`; `e2e/auth.spec.ts` gained pre-hydration and now actually logs out
   before the second login.

## Gate results (production build on :3000, serial)

| Gate | Result |
|---|---|
| Vitest | 18 files / **62 tests passed** |
| design-conformance (1440/390, desktop project) | **42/42 passed** |
| axe all customer routes, bn/en × 1440/390 | **0 violations** (both the standalone sweep and `e2e/a11y.spec.ts`; 390 and 1440 runs recorded) |
| auth / auth-redirect / access-control | **3/3 + 9 passed / 2 skipped** (admin without `ADMIN_PASSWORD`); rerun of the register test after API throttle reset passed |
| checkout-layout | **30/30 passed** (after making the checkout summary fit the viewport and focusable) |
| cart-layout | **8/8 passed** after API restart (earlier 429s were the documented login/seed throttle) |
| home-consistency, product-card, cart-quantity/persistence, scroll-restore, digits | **28 passed** |
| overflow, typography, messages, qa-content, skeleton-rows | **42 passed / 2 skipped** |
| typecheck (frontend + backend) | clean |
| full lint (frontend + backend) | **0 errors** (7 pre-existing frontend warnings) |
| production build | green |
| seller/admin smoke 1280/360 | screenshots in `frontend/.artifacts/consistency/smoke-*.png`; no visible breakage |

## Skipped / not green (honest)

- `settings.spec.ts`, `settings-persist.spec.ts`: need `ADMIN_PASSWORD` and the isolated
  `:5001`/`:3002` stack; not run against dev (would write real settings).
- `payments-advance.spec.ts` and `payments-advance` scenarios: require the isolated payment
  stack; not run here to avoid mutating dev payment rows.
- Lighthouse CLI: not installed; installing is a new dependency, so STEP 5 uses Chromium
  PerformanceObserver data (`rontend/docs/design/performance.md`). `benchmarkIndex` unavailable.
- Pre-consistency git-worktree perf comparison: not run (time/tooling); baseline numbers from
  docs are cited qualitatively.
- The demo account has no ADVANCE order, so the payment screen is verified in its error state
  (h1 + retry + Back to orders) rather than a payable state.

## Environment notes

- One API `:5000` (supervisor script) and one production frontend `:3000` were used for gates;
  the dev server was stopped for the production runs and will be restored after handoff.
  `:3100` stayed off. Orphan Playwright MCP/duplicate dev processes were stopped.
- Backend login throttle is 10/min and global throttle 100/min; long serial suites can hit
  429. Restarting the API between groups (as done) resets it; failures were `429`, not code.

## Final commit hashes

- Frontend `ecea1d4` — fix(auth): block native submit before hydration (pushed to `redesign/phase2`).
- Frontend `a773226` — fix(customer): align copy, card surfaces, rails and a11y (pushed).
- Backend `ce99157` — fix(auth): widen refresh reuse grace to 20s (committed on `feature/payments`; backend push was not part of the requested `redesign/phase2` push).
- `d5eaf1d..a773226` confirmed on `origin/redesign/phase2`.

## Perf re-baseline (2026-11-18)

- Re-measured with the same method on the same machine: production build on `:3000`, API `:5000`,
  Slow 4G (1.6/0.75 Mbps, 150 ms) + 4× CPU, 5 runs/route, 390×844, cache disabled.
- Current vs pre-consistency (`c3a0255`): home **2304 vs 2092 ms** LCP (+212 ms, still <2.5 s;
  7-run recheck 2344 ms), catalog **3024 vs 3164**, PDP **2148 vs 2356**, cart **1768 vs 1816**,
  checkout **4300 vs 4768**. JS/fonts unchanged; images slightly smaller; cart/checkout CLS remains
  ~0.42/0.40 in both.
- Verdict: no broad regression; only home is ~10% slower from the added merchandising DOM/hydration.
  No low-risk code change was needed (font preload once per locale and `sizes` are already correct).
  Full method/table/causes: `rontend/docs/design/performance.md`.

## Advance payment live journey (2026-11-18)

- Isolated stack `:5001` (planthaat_test) + `:3002`, fake seed only; headed Chromium, serial.
- **12/12** payment scenarios pass (COD, full Advance journey with proof, admin verify, seller
  unlock/confirm/pack, rejection+resubmit, duplicate, underpay+second TrxID, overpay refund, unpaid
  expiry vs pending SLA, late-payment grace, partial refund, permissions, settings snapshot).
- Supplemental seller shipping walk: `CONFIRMED → PACKED → SHIPPED`; buyer reads `SHIPPED`.
- Settings specs: grouping/history 1/3 pass; sensitive and persist specs time out on the slow
  `:3002` dev server (screenshots show the save/history/persisted values); customer-side effects not
  reached. No product bug found.
- Dev settings were not written. Actual dev state: advance ON, bKash ON with the owner's real
  number, Nagad off, COD on (last changed 2026-11-16 11:11 UTC). Not reset, per the no-delete rule.
- Evidence: `frontend/.artifacts/payments/REPORT.md` + screenshots.

## Remaining queue (recommended order)

1. **Part 4 settlement/ledger** — refund/COD dues/settlement entries, unified return/payout window,
   row locks/idempotency. Money correctness first.
2. **Cart/checkout CLS (~0.4) + checkout LCP 4.3 s** — reserve summary/address geometry and stop the
   skeleton→content swap; server-render a stable first summary line.
3. **Seller/admin consistency pass** — the remaining screens not covered by the customer pass.
4. **Larger performance program** — font subsetting/critical CSS, catalog LCP image priority,
   bundle analysis; only after 1–2.
5. **Settings spec harness** — replace `networkidle`/fixed timeouts with explicit waits and a stable
   fixture so the two settings specs stop timing out on the isolated dev server.

## Verification session commits (2026-11-18)

- Frontend `1df234d` — test(settings): stabilise isolated-stack settings specs (pushed `redesign/phase2`).
- Backend `18ad4c6` (includes `ce99157`) — pushed `feature/payments`.
- No product code changed: the Advance journey passed 12/12 and no P0/P1 bug was found.




## Docs cleanup (2026-11-18)

- Documentation moved into `backend/docs/` and `frontend/docs/`; duplicate audits/progress/perf/typography docs consolidated; screenshots and measurement dumps deleted. Undo archive: workspace `_cleanup-archive/` (outside both repos).

## 2026-11-18 money-path stability pass

- Cart/checkout CLS fixed at the source: server-rendered first paint, reserved skeletons for shops/summary/addresses/payment, in-place quote refresh, Inter optional + metric fallback. Production 5-run medians: cart CLS 0.0042-0.0108, checkout CLS 0.0073-0.0093, checkout LCP 1.83-1.99 s (targets met). Guest cart 0, 6-shop cart 0.0083.
- Shared PasswordInput and keyboard-only card focus rings landed with Playwright guards.
- Settings harness: production isolated stack; settings 4/4, payments-advance 12/12, session-refresh 8/8. Fixed public-settings staleness (60 s -> 1 s).
- Warning: the dev settings still have Advance enabled with the owner's real bKash number; with these settings a real customer on the dev app could send real money to that number, so the dev app must not be exposed publicly while Advance is enabled. Do not change these settings from tests.

## 2026-11-18 Part 4 settlement ledger (backend only)

- Branch `feature/payments`; code commit `2361c08` (docs commit follows).
- Migration `20261118120000_p4_settlement_ledger` applied to **both** dev `neondb` and
  `planthaat_test` with `npm run db:migrate:all` (16 applied before, 17 after). Additive only;
  rollback SQL is in the migration.
- Ledger: `LedgerEntry` gained nullable `account`, `releaseAt`, `batchId`, unique
  `idempotencyKey`, business refs; `sellerProfileId` is nullable for platform entries. New account
  buckets (BUYER_RECEIPTS, PLATFORM_HOLDINGS, SELLER_PENDING/AVAILABLE/ON_HOLD/
  WITHDRAWAL_RESERVED/PAID_OUT, REFUND_PAYABLE/PAID, PLATFORM_COMMISSION, COD_DUES). Legacy rows
  stay `account = NULL` and keep the old projection; no existing balance changed.
- Hold: one setting (`return.windowHours`); `payout.holdHours` is a deprecated read/write alias.
  Delivery snapshots `ShopOrder.releaseAt`; release job runs on bootstrap + every 5 minutes, locks
  each ShopOrder row, skips open disputes and is replay-safe.
- Disputes: existing complaints extended with decision/deadlines/hold fields; buyer-only delivered
  disputes inside the window, one open per ShopOrder, photo limit from settings; admin decision
  endpoint posts refund payable/paid or returns held funds. Audit + notifications.
- Wallet/withdrawals: seller wallet (pending/available/on hold/reserved/withdrawn/COD dues),
  transactions, payout profile with encryption + cooldown, withdrawal request with row lock and
  immediate reserve, admin pay/reject queue. `Payout` is reused.
- COD: commission is a receivable (`COD_DUES`), no buyer receipt; optional auto-deduction from
  available; manual dues payment records the TrxID; withdrawals blocked above the dues limit.
- Reconciliation: A5 conservation check added to `GET /admin/reconciliation` with
  `SETTLEMENT_CONSERVATION_BREACH`; settlement summary in the response.
- Baseline failure fixed: `test/earnings.e2e-spec.ts` dues-payment test was un-skipped, the wrong
  payout expectation replaced by the real `PAYOUT_EXCEEDS_AVAILABLE` guard and COD dues assertions.
- Tests actually run: backend unit **228/228** (29 suites); settlement e2e **8/8** (advance hold +
  boundary 47h59/48h01, early release, multi-shop rounding, dispute-vs-release race x3, parallel
  withdrawals, COD dues/block/manual clear, dispute refund/reject, permissions); earnings **2/2**;
  advance+cod-settings **18/18**; full backend e2e **21 suites, 153 passed, 3 skipped** (the three
  known pre-existing upload/seller-onboarding failures).
- Dev settings were not written. Advance and COD suites still pass.
- Follow-up `dfd3a02`: Part 3 refund obligations (overpay, cancellation, late no-stock) now post
  `PLATFORM_HOLDINGS -> REFUNDS_PAID` when the admin records the refund TrxID, keeping A5 conserved.
  Advance payments e2e re-run: 11/11.

## 2026-11-19 Part 4 UI (frontend) + live verification

- Frontend branch `redesign/phase2`, commit `9f15c3f` (pushed below): seller wallet, buyer return
  window/early release, admin withdrawals queue, dispute decision panel + evidence lightbox,
  reconciliation settlement block, dashboard counters and nav badges.
- Shared header mobile padding/gap reduced to remove the 5 px 360 px overflow; wallet tab contrast
  fixed for axe; Bengali nav labels for Wallet/Withdrawals repaired after a test-stack render showed
  corrupt glyphs. No new dependencies.
- Backend tiny UI-support fix on `feature/payments` `4c678a1`: admin complaint detail now includes
  shop + shop order summary (no money logic). Backend typecheck/lint and complaints unit 6/6 pass.
- Tests on isolated production stack (`:5001` + `:3002`): `e2e/part4-settlement.spec.ts` **1/1**
  (axe + 360 overflow included), `payments-advance.spec.ts` **12/12**, Vitest **68 passed / 1
  skipped**, frontend typecheck/lint clean (5 pre-existing warnings), production build green.
- Live report: `frontend/docs/testing/part4-live-report.md`. Screenshots were kept only in a
  gitignored `.artifacts/` folder and deleted after the report.
- Dev database/settings untouched; test only. Test stack stopped at the end.

## 2026-11-19 Part 4 closing pass

- Payout destination reveal: admin-only, re-auth-scoped, single-use, `Cache-Control: no-store`,
  5/min throttle, audit without the value, UI password reveal + copy + 60s auto-hide. Tests cover
  role denial, missing/single-use token, audit row, absence from lists, copy and auto-hide (en/bn).
- Dispute filters: `seller`, `minAgeHours`, `maxAgeHours`, `minAmount`, `maxAmount` added to the
  admin complaint query with unit + UI coverage; admin list filter bar wired.
- Double decision now returns `409 DISPUTE_INVALID_STATE` (stale tabs get a clear conflict instead of
  a replay); COD-dues block copy explains how to resolve it.
- UI live scenarios split into independent specs under `e2e/part4-*.spec.ts` (the monolithic spec was
  removed). Results: **9/9** scenario spec tests passed (filters, reject dispute + stale tab,
  multi-shop refund, destination reveal, permissions, reconciliation, window, withdrawal reject,
  withdrawal validation); `payments-advance` **12/12**. Backend settlement e2e **8/8**, complaints
  unit **7/7**, typecheck/lint clean.
- Breach path exercised in the visible browser with `scripts/part4-breach-test.ts` (test DB only),
  then restored; balanced path passes in UI.
- Legacy-settled labels added to seller transactions and admin order detail; reconciliation help text
  added bn/en. Dev database/settings untouched; test stack stopped.

## Upload/Cloudinary follow-up (2026-11-19)

- Producer inventory written to `docs/UPLOAD_SYSTEM.md`; every existing persistence flow attaches in the entity transaction. Seller dispute response photos and delivery-proof writers do not exist yet; messaging is schema-only. Private KYC files are never auto-deleted.
- Orphan cron now uses the central reference registry, relinks live PENDING assets, skips private/foreign-prefix assets, supports `upload.orphanGraceDays` (default 7, min 1), dry-run and summary logs. `uploads:orphans` and `uploads:reconcile` added.
- Live damage check: Category.imageUrl 11/11 OK, ProductImage.url 98 OK + 2 external picsum errors, User.avatarUrl 1 pre-existing missing (record left intact).
- Env separation: `CLOUDINARY_FOLDER=planthaat/dev` locally; production requires `/prod`. Smoke uses its own temporary folder and passed live after the delete-propagation retry.
- Secrets: Cloudinary credentials in history at `35675ba`; working tree sanitized; `npm run lint` includes `scripts/check-secrets.mjs`; rotation runbook added.
- Frontend: home banners point at existing `.webp` files with a Vitest guard; admin Settings has a storage health card; production build requires `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.

## 2026-11-19 Home hero Part A (marketplace-first)

- Branch: backend `feature/payments`, frontend `redesign/phase2`. No migrations in Part A.
- Backend: added `home.hero.headline`, `home.hero.subheadline`, `home.hero.chips`, `home.hero.image` to the Settings registry (group `home`, public), with safe-link/JSON validation, upload attach lifecycle and cleanup on replace. `settings-registry.spec.ts` covers the validators (12/12 settings tests).
- Frontend: hero rebuilt as a compact search-first marketplace hero; real popular in-stock product cards replace the decorative composition; the standalone trust band and `HeroComposition` were removed. Search remains a native GET form; chips link to existing filters (`isIndoor`, `light`, `isPetSafe`, `maxPrice`, `category`).
- Admin: Settings ? Home has bilingual headline/subheadline, reorderable chips (max 8), optional hero image with mobile variant/alt/focal and the Highlights on/off/autoplay/interval/max controls.
- Perf (prod, 390x844, Slow 4G + 4x CPU, 5 runs): LCP 6740 -> **3288 ms** en and 5584 -> **3584 ms** bn; CLS 0; JS 363 KB unchanged. Details in `frontend/docs/design/performance.md`.
- E2E `e2e/home-hero.spec.ts`: 7 passed, 2 skipped (admin credentials not set in this environment; native no-JS semantics asserted because the streamed shell requires JS, logged in decisions).
- Dev settings were not modified beyond the new registry defaults. No destructive migration.

## 2026-11-19 Home Highlights Part B (admin-managed slider)

- Migration `20261119120000_home_highlights_banner_fields` applied to dev **and** `planthaat_test` via
  `npm run db:migrate:all`; `db:status:all` clean (18 migrations). Additive `Banner` columns,
  `UploadedAsset.width/height`, `Banner.mobileImageUrl` registered in the upload reference registry.
- Backend: public `GET /home/highlights` (active/schedule/maxSlides, ETag, 30 s Cache-Control,
  15 s in-process row cache, settings read live); admin list/create/update/delete/duplicate/
  transactional reorder with role guard + audit. Server validation covers safe links, colors,
  lengths, schedule order, owned uploads, aspect warnings, visible-count cap and the contrast guard.
  Uploads attach in the entity transaction; replaced/deleted assets are cleaned only when
  unreferenced. `highlights.validation.spec.ts` 8/8; `content-highlights.e2e-spec.ts` 8/8.
- Frontend: shared `HighlightSlideView`, server `HomeHighlightsSlot`, lazy `HighlightsCarousel`
  (Embla loaded on visibility; non-selected images not rendered until selected). 3:2 mobile / 3:1
  desktop art direction; single-slide/off = no carousel JS. Admin **Home ? Highlights** page with
  master switch, autoplay/interval, drag + up/down reorder, status chips, duplicate/delete, editor,
  focal picker, contrast warnings and desktop/mobile bn/en live preview. Settings ? Home carries the
  hero + highlights settings.
- Import: `home:highlights:import` (dev-guarded, idempotent marker `[seed:home-highlights]`) uploaded
  the owner's three static banner files (1920x640 desktop + mobile) and created three dev slides;
  `home:highlights:import:remove` documented and available. Test/prod DB untouched by the import.
- Perf (prod, 5 runs, medians): 390 LCP 2832/3044 ms en/bn, CLS 0, JS 356 KB, images 217/191 KB;
  1440 LCP 2968/3140 ms, CLS 0/0.0001. Mobile-only `w_640` (~22 KB) and desktop-only `w_1920`
  (~77 KB) variants verified; off-screen slides not requested until selected.
- E2E: `home-highlights.spec.ts` 8/8 guest tests on dev (geometry bn/en, art direction, axe); the
  admin page test passes on the isolated stack. `admin-highlights.spec.ts` 1/1 on the isolated stack
  (create + uploads + overlay/button/external link, public render, admin list, schedule hidden,
  duplicate, reorder, feature off/on with no section/gap, cleanup).
- Dev settings were left at registry defaults (feature on); imported slides are real owner artwork.
- Added `e2e/admin-highlights-ui.spec.ts` (visible browser, test stack): uploads desktop+mobile through the editor, fills bn/en overlay and button/external link, saves, verifies the home page, toggles the feature off/on and deletes the slide. 1/1 passed.

## 2026-11-20 Home hero restored + real-plant scene

- Left side restored from `f100858`: badge, settings headline/subheadline, native GET search, two links. Removed the marketplace category select/chips/hero product cards/hero trust row; the separate trust band remains removed. `home.hero.chips` marked unwired/non-public and removed from Settings UI; `home.hero.image` is a static scene override.
- Built four transparent cutouts from the owner-provided `hero-source/` photos with `frontend/scripts/build-hero-assets.mjs` (alpha crop, mirror calathea, brightness equalize, 6% pad, WebP + scene JSON + typed module). Desktop total 204 KB; variants 25/40/57/106 KB. Composition: monstera/palm/snake/calathea at 66/94/48/50% heights, pot centers 27.5/37.7/60.1/80.2%, stage 11/10 desktop and 3/2 below lg.
- Static server `<img>` scene + borderless cream stage; WebGL island with the pivot/gust shader, premultiplied textures, one draw per plant, DPR/fps caps, off-screen/hidden pause, reduced-motion/save-data/no-WebGL static fallback, admin image static. No new dependencies; frontend sharp WASM was incomplete so the script falls back to the backend native sharp.
- Tests: `home-hero.spec.ts` 8/8, `home-hero-scene.spec.ts` 9/9 on the test stack (including the admin image/settings override), `home-highlights` 8/8. Sway screenshots show moving fronds and identical pot pixels; no-WebGL/reduced-motion/save-data stay static; pause/resume works. Existing suites: design-conformance 43/43, overflow/typography/product-card/scroll-restore 74/77 (two pre-existing header-padding failures at 390, one scroll test updated for the taller hero and now 2/2).
- Perf (prod, 5 runs): mobile LCP 2904/3124 ms, desktop 3452/3716 ms, CLS 0, JS 332 KB. The palm is the LCP and is preloaded; the desktop trade-off is documented in `frontend/docs/design/performance.md` and decisions.

## 2026-11-20 Hero fixes (4 items)

- A: fixed the one-time sway by measuring raw rAF deltas before the 45 fps cap; added warmup/ignore rules, cached clip rects, ResizeObserver, StrictMode-safe cleanup and a 150 ms/5 s static fallback (logged deviation). 60 s Chrome logs on dev and prod stay webgl with frames increasing. Unit tests 5/5; the 15 s 4x-CPU Playwright test passes.
- B: fixed the 11:10 inner scene box; outer stage 300 px phone / 420 px tablet, centered. Pot-center/height ratios differ by <=0.14% across 360/390/412/768/899/1280/1440; mobile pots clear the bottom nav and search stays above the fold.
- C: added edge-band checks + 4% alpha feather for clipped left/right/top cutout edges (bottom pot base excluded). Palm left/right/top counts 22/27/57; 2x before/after crops show no hard vertical cut. Replacement/rerun instructions added to `frontend/docs/README.md`.
- D: added AVIF primary + WebP fallback for all plants, palm 600 px visible (672 padded), AVIF q50, AVIF preload with imagesrcset/imagesizes. Desktop scene 136.7 KB AVIF. Measured mobile 2632/3040 ms LCP (improved/flat), desktop 3116-3208/3384-3904 ms, CLS 0, JS 332-358 KB; desktop 5% goal documented as not consistently met because the palm paints after the hero text.
- Existing hero/hero-scene/highlights/design-conformance/overflow/typography/product-card/scroll-restore tests and typecheck/lint/build were re-run; only the known 390 header-padding consistency failure remains.

## 2026-11-21 queue status (verified)

- P0-1 trustworthy suites: backend unit 272/272; backend e2e 23 suites, 168 passed, 3 skipped (known upload-key assertions); frontend Vitest 94 passed, 1 skipped; isolated money stack: Part 4 9/9 (settlement first), payments-advance 12/12, settings 3/3, admin consolidation 4/4, highlights 2/2; sessions 18/18 (short-TTL stack); Cloudinary payment-proof upload 1/1 through planthaat/teststack with cleanup. One flaky reauth unit timeout was raised to 30 s (argon2 under load), not weakened; full rerun passed.
- P0-2: dev ribbon verified in real Chrome on seller + checkout (screenshot viewed); payment page inline test warning; production env validation 9 tests; production settings baseline script (dry-run default) not run against any production DB. uploads:backfill dry-run then apply: 109 ATTACHED rows; reconcile 118 rows / 3 untracked (1 broken avatar + 2 external picsum).
- P0-4: secret gate passes; Cloudinary rotated (smoke passed); throttles for payment/upload/withdrawal/complaint/checkout + metadata test 6/6.
- P1-1: not re-measured. Current documented medians remain the last real-plant-hero baseline (mobile LCP 2632/3040 ms, desktop 3116-3208/3384-3904 ms, CLS 0, JS 332-358 KB).
- P1-2: admin duplicate audit/consolidation done; seller duplicate audit and full design sweep remain open.
- P1-3: unused-var warnings removed; the two remaining React Compiler notes are the known react-hook-form watch() skips (documented, no safe local fix). JS-disabled check: home search is a native GET /products form and /products?q=aloe server-renders cards. Date.now prerender warning did not reproduce.
- P2-1/P2-2: docs/pre-launch.md and docs/MERGE-PLAN.md written; both main branches are ancestors, fast-forward dry-runs produce 0 conflicts (backend tree 330efa1, frontend 97b8fac). Policy pages carry the lawyer-review draft notice.

## 2026-11-21 Task 1 - dispute response photos + delivery proof

- Migration `20261121120000_delivery_proof_and_response_photos` applied to dev and `planthaat_test` via `npm run db:migrate:all`; `db:status:all` shows both current. Additive tables `ShopOrderDeliveryProof` (1-3; first copied to legacy `deliveryProofUrl`) and `ComplaintCommentAttachment` (seller response photos; max from `return.maxEvidencePhotos`). Rollback: drop the two new tables (no existing column/row rewritten).
- Backend: `order.deliveryProofRequired` (default false) in Settings → Orders; delivery proofs and response photos validated for owner/deadline/decision/max, stored and ATTACHED in the same transaction; registered in the upload-reference registry so the orphan cron never sees them as orphans; buyer order page, seller order/complaint pages and admin dispute view show them. No ledger/release/commission change.
- Storage test-mode correction: tests default to local, but an explicit `STORAGE_DRIVER=cloudinary` in a test process now selects Cloudinary (unit test added). The proof-upload script re-run is a real Cloudinary test now.
- Tests: backend settlement evidence cases **2/2**; orders/complaints/storage/upload guards **64/64**; frontend `evidence-proof-ui` **1/1** (real Chrome, UI uploads, ATTACHED, buyer/seller/admin views, axe, 1280/360); `uploads:smoke` passed after rotation; Cloudinary test-prefix assets cleaned, `.env.test` restored to local.

## 2026-11-21 Task 1 commit

- Backend commit `207fb13` and frontend commit `0abf48e` (pushed). Migration applied to both DBs; `db:status:all` shows no pending migrations. Cloudinary rotation item removed from OWNER ACTIONS; `uploads:smoke` passed.
- Dev restored: API `:5000` (new build), frontend `:3000`; test stack stopped; `:3100` off; `.next-test`, test results and test-prefix assets cleaned. Owner-uncommitted files untouched.

## 2026-11-21 Task 4 - header and navigation cleanup

- Language: one `En | বাং` control in the customer header and one in the seller/admin `DashboardShell`; removed `LocaleSwitch` from the footer, account menu and every other placement (file deleted). One click writes `NEXT_LOCALE`, reloads once and restores the previous scroll position after the hash anchor/late images settle; path, query and hash stay unchanged and `html lang` follows the locale. Labels are 44px targets with active-segment contrast and per-label `lang`; accessible action names are "Switch language to Bangla" / "ইংরেজিতে পরিবর্তন করুন".
- Header auth state: guests see logo, search, `En | বাং`, cart and text "Log in" (no Register, bell or profile); signed-in users see the bell, cart and profile menu. The mobile logo wordmark hides below `sm`; the 360px header now has no horizontal overflow. `ph_has_session=1` is a non-sensitive layout hint only, written from `/auth/me`/login and cleared on logout/session-expired; authorization remains API-only. `session:expired` clears the cached user so the header becomes guest while the inline re-auth dialog stays open.
- Mobile bottom nav: guests get Home/Categories/Cart/Orders (Account hidden); signed-in users keep all five tabs. Orders remains for guests and opens the login flow; hiding Orders was intentionally not chosen.
- Notifications: the bell is a button, never a link. Desktop opens an anchored popover (`aria-label` on the dialog), mobile a bottom-sheet dialog; URL never changes. Shared panel: title, mark-all, newest-first rows, unread marker, relative time (`Intl.RelativeTimeFormat`, Latin digits), 10-row paging, skeleton/empty/error+retry, "See all" link, badge cap `9+`, arrow-key row navigation, Escape/outside close and focus return. Opening refreshes; realtime invalidation plus 30s polling while open; item click marks read, closes, then follows the target (or only marks read when there is none). Type-localization/href logic moved to `notification-content.ts` and is shared with `/notifications`.
- Tests: frontend Vitest **94 passed, 1 skipped**; new `header-nav.spec.ts` **5/5** in real Chrome serial (locale path/query/hash/scroll, guest header, bell popover/Escape, 360 guest nav/overflow, mobile bottom sheet); axe clean on the production header at 360/1440 in bn/en and on the open panel at 390/1440. `npm run typecheck`, full lint and the production build passed.
- Performance (production build, 390x844, 5s window, 3 warm runs): LCP **1424/2868/1032 ms** (bn) and **1300/1360/848 ms** (en), median ~1.4/1.3 s; CLS **0.006 / 0.0058**. Desktop single runs 1708/856 ms, CLS 0.0003/0.0002. One cold mobile bn run was 5324 ms; all CLS values are below the 0.1 target and no 360/390 overflow.
- Owner files: all existing uncommitted/untracked backend and frontend files were left untouched. Copies, git patches and SHA-256 checksums were archived to `E:\Development\Projects\_owner-files-archive\planthaat-item4-2026-11-21.zip` (22 entries); `.next-item4` and temp scripts were removed. Dev `:3000`/`:5000` restored; temporary `:3004` stopped; `:3100` remains off.
- MERGE-PLAN refreshed: backend `50` / frontend `86` commits ahead, fast-forward dry-runs tree `b3a1e7fce4...` / `f07100d9ea...` with 0 conflicts; migration `20261121120000_delivery_proof_and_response_photos` added as step 7.

## 2026-11-21 Task 2 - performance programme

- Baseline and final method: production build (`.next-prod`) on `:3000` after stopping dev, API `:5000`, Chromium real Chrome, CDP Slow 4G 1.6/0.75 Mbps + 150 ms RTT + 4x CPU, cache off, 5 runs, medians; home/catalog/PDP/cart/checkout at 390/1440 in bn/en. Results and full before/after table: `frontend/docs/design/performance.md`.
- Kept: early home palm preload in the shell (home LCP 3496/3208 -> 2856/2388 ms at 390 bn/en; 4660/3160 -> 2872/2868 at 1440); 3 KB Hind subset for `৳`/`বাং` so English no longer downloads full Hind 400+600 (English fonts 195 KB -> 51.6 KB; Bangla unchanged at 198 KB; typography suite green); catalog first-four card priority (390 3552/2972 -> 2512/2444 ms). CLS stayed <= 0.0114 on every route.
- Reverted: session-expired dialog/form dynamic split (+11 KB JS, chunks 29->30, no LCP win). Not applied: auth/me, realtime, toaster deferral (already gated or unsafe for no-flash header); CSS/chunk reduction (no safe lever); backend includeTotal/index (no verified N+1/index proposal; `/products` warm p50 356 ms is the documented bottleneck).
- Guards: `npm run check:bundle` with per-route gzip limits (current home 372, catalog 386, PDP 403, cart 371, checkout 360 KB); home/header CLS added to `e2e/cls.spec.ts`.
- Tests: Vitest **95/95**; target Playwright serial **101 passed, 3 skipped** (design-conformance, home consistency, hero, hero-scene, highlights, overflow, typography, scroll-restore) plus header/nav + CLS **9/9**, access-control **8/8** (1 skipped); typecheck/full lint/production build pass. Session-expired spec requires the isolated `:3002` stack and was not run in this pass; no session code changed.
- Remaining: home hydration/render delay 1.2-1.6 s; Cloudinary image TTFB 0.4-4 s drives PDP/catalog desktop noise; Bangla fonts remain 198 KB; checkout 1440 CLS 0.024.

## 2026-11-21 Task 3 - seller panel consistency and duplicate audit

- Inventory: 17 seller/storefront routes at 1280/360 in bn/en (dashboard, products/new/edit, orders/detail, earnings, payout accounts, complaints, reviews, questions, shop, delivery zones, analytics, cancellations, apply, public storefront); complaint detail was absent because the demo seller has no complaint. Screenshots reviewed as contact sheets; audit table: `docs/seller-audit.md`.
- Shared system: all 15 seller-shell pages moved from hand-rolled `main`/`h1` to `PageContainer` + `PageHeader`; `DashboardShell` breadcrumb is a span so pages own the single `h1`. Order/complaint details use `PageHeader` with status actions and back links. Products/orders/reviews/questions/cancellations/zones use `EmptyState`/`QueryError`; products/zones/payout deletes use `AlertDialog` (native confirm removed).
- Duplicates: removed the earnings “Payout profile” tab (canonical destination editor is `/seller/payout-accounts`, now linked from wallet); deleted unused `earnings-client.tsx`; hid Apply from approved sellers and added a back link on `/seller/apply`; removed the duplicated Shop card title; earnings metadata now matches the Wallet h1. Shop vs onboarding, earnings/withdrawals vs payouts, orders/cancellations/complaints, and product/variant editors were documented as intentionally separate.
- Tests: `e2e/seller-panel.spec.ts` **5/5** (route sweep + axe at bn/en and 1280/360, one h1/PageHeader/no overflow/no raw enums, canonical earnings/apply check, product delete dialog); existing design-conformance/overflow/typography/scroll-restore/access-control/header-nav/CLS **82 passed, 2 skipped**; Vitest **95/95**; typecheck/lint/production build pass. Bundle budgets unchanged (372/386/403/371/360 KB).
- No backend endpoint, money rule or migration changed. Dev restored `:3000`/`:5000`; `:3100` off.

## 2026-11-22 Task 5 - cart/checkout/PDP/catalog regression bisect

- Repeatable method: production builds of git worktrees (`a0ab6a7` before the font/priority commit, `214482e` font/priority, `16f17d5` current) served on `:3000`; real Chrome, Slow 4G + 4x CPU, cache off, same demo customer/cart/product, **7 runs**, image responses recorded once and replayed locally so Cloudinary TTFB cannot dominate. LCP element + document/resource TTFB, load duration, render delay, CLS, TBT proxy, JS/CSS/font/image bytes and chunk count recorded.
- Bisect: catalog 1440 before/font/current = 3064/3396/2460 bn and 2768/4164/2508 en; PDP 1440 = 3032/2964/2636 bn and 2452/2504/2440 en; cart 390 = 2788/2688/3344 bn and 2232/2204/2268 en; checkout 390 = 2260/2436/2424 bn and 2292/2160/2224 en. The earlier PDP/cart/checkout regressions do not reproduce with image replay; the one catalog anomaly at the font commit does not persist with the same public code on current. No font or priority revert was justified.
- Proven fix kept: cart bn LCP was the first line image starting/painting after hydration. Server-side `preload()` of the first cart image (from server-rendered cart) plus first-line priority moves cart 390 to **2408 bn / 2172 en ms** (from 2600/3344 bn and 2268 en), both under the 2.5 s target. Checkout 390 is **2252/2128 ms**; catalog 1440 **2884/2976 ms**; PDP 1440 **2688/2532 ms** (en +5% vs old 2408, within range; render-delay bound); home 1440 **3372/3152 ms** or 2924/2896 on recheck, no code change. CLS stays <=0.0113.
- Guard: `e2e/performance.spec.ts` uses the same image replay/CDP method and enforces cart/checkout 2750 ms (target 2500 + 10% margin), PDP/catalog 3300 ms and home 3800 ms. It passes **1/1** in 5.3 min; `cls` + `overflow` rerun **14 passed, 1 skipped**; `check:bundle` green.
- Full method, bisect table and final numbers: `frontend/docs/design/performance.md`. No backend change; dev restored `:3000`/`:5000`; `:3100` off.

## 2026-11-22 Admin/seller dashboard Phase 1 - verified and closed

- Scope confirmation: the instruction names no phase on its final line; Phase 1 (the additive foundation) remains the safe choice because Phases 2-4 depend on the kit and panels API. No page redesign was done in this pass.
- Frontend kit in `src/components/dashboard/` (20 primitives + `use-chart-width`), dev-only `/dev/dashboard-kit` (404 in production, `robots.ts` disallow) and 19 unit tests (chart math/Dhaka ranges, KPI deltas, ChartCard states/toggle, donut grouping, funnel conversion, meter semantics, tab keyboard/URL/lazy, DataTable sorting/density, public-route isolation).
- Chart visual QA at 1280 and 360 in real Chrome found three defects, fixed: (1) fixed 640/720 viewBoxes shrank axis text and horizontal bar labels on phones -> charts now measure their container (ResizeObserver) so 1 SVG unit = 1 CSS px, full-height at every width; (2) the last two x-label ticks overlapped on 30-day series -> evenly rounded tick indices; (3) horizontal rankings clipped long names -> dynamic label gutter + ellipsis (exact value stays in the tooltip/data table).
- Also fixed visible dev-panel defects found by the same sweep: the Bengali development ribbon and five seller/admin Bangla strings were literal `?` mojibake (now written properly); the admin dashboard reconciliation queue card rendered `?` for an intentionally absent count (now an em dash).
- Analytics API: `GET /admin/analytics/panels` and `GET /seller/analytics/panels` are read-only, role-scoped, Asia/Dhaka bucketed (<=90 points, weekly beyond 90 days), money from the same order/commission/ledger sources, no PII; OpenAPI updated. E2E `test/analytics-panels.e2e-spec.ts` 4/4 (series totals = overview totals, Dhaka 20:00Z boundary, seller isolation, caps, 403s, PII, <4 s).
- Synthetic test data: `db:seed:dashboard-kit` / `:cleanup` are guarded to `planthaat_test` by `scripts/db-test-guard.mjs`, marker-tagged and idempotent. Verified: 60 orders / 5 products / 12 reviews seeded, second run no-op, cleanup removed 60 orders / 60 shop orders / 20 intents. Dev data/settings untouched.
- Bundles: `check:bundle` budgets `/admin` and `/seller/dashboard` (500 KB) and fails if a public route manifest imports dashboard/admin/seller/recharts code. Result: public 373/387/403/372/360 KB unchanged; `/admin` 352 KB, `/seller/dashboard` 351 KB. `tests/dashboard-isolation.test.ts` guards imports.
- Performance baselines (production build, real Chrome, Slow 4G + 4x CPU, bn, 5 runs, medians) recorded in `frontend/docs/design/performance.md`: `/admin` 1816 ms 1440 / 1728 ms 390, `/seller/dashboard` 1816 / 1744; pre-redesign `/admin/orders` 7152, `/admin/reconciliation` 5984, `/seller/orders` 5584, `/seller/earnings` 4988 are the Phase 2/3 targets; TBT 43-323 ms, CLS <= 0.009, API p50 224-735 ms / p95 1.1-3.0 s.
- Checks actually run: frontend typecheck clean; frontend lint 0 errors / 7 pre-existing warnings; Vitest **114/114** (30 files, `--pool=threads` because the forks worker pool timed out on this Windows host); production build green; `check:bundle` green; backend typecheck clean; backend lint + secret gate green after replacing a `String(value)` false positive and teaching the secret scanner that `$env:`/PowerShell variable references are not literals; analytics e2e 4/4. Visual QA screenshots (kit/admin/seller/reconciliation/orders) reviewed at 1280/360 in real Chrome.
- Restored: dev `:3000` and API `:5000` up, `:3100` off. Temporary `.artifacts/dash-phase1` scripts/screenshots and `.next-prod` are deleted before commit (screenshots are not committed). Owner-uncommitted files (about/banners/config/seed-demo/fonts etc.) were not staged.

## 2026-11-22 Admin dashboard Phase 2 - redesign, slow-page fixes, docs

- Frontend `redesign/phase2`; backend `feature/payments` (one additive query mode + tests). Admin-only; no ledger/payment/commission/release/settlement rule changed.
- Inventory retained and ticked in `frontend/docs/design/dashboard-guide.md` (moved out of FRONTEND_DESIGN.md, which now points to it). Admin pages use `PageContainer` + `PageHeader`; dashboard/orders/reconciliation use the shared kit; settings groups use `AnimatedTabs`.
- Dashboard: period selector + queue tiles + KPI strip (sparklines/deltas) + trend tabs (GMV/orders/delivered/commission) + orders-by-status + payment mix + verification aging + disputes status/type/aging + refunds/withdrawals queues + settlement composition/breach + inventory/ratings/delivery + top shops/products/categories/districts. Every legacy overview number remains (operations snapshot + legacy overview query).
- Orders: additive `?view=summary` projection (no status history/payments/proofs per row); first page + panels server-rendered; sortable DataTable with density/mobile cards; status chart. Backend unit tests assert summary/select vs full/include and totals.
- Reconciliation: period, checked count, balanced/breach banner, settlement totals, bucket donut + ranking + exact data table/CSV, sortable violations table (mobile cards). No new money math.
- Refunds/withdrawals/complaints/commission-rules: PageHeader + shared server-prefetched `AnalyticsStrip`; lists/filters/actions unchanged. Other admin pages got PageHeader (list/detail behavior unchanged).
- Accessibility: axe on 8 redesigned pages at 1280/360 in bn/en - 0 serious/critical violations after fixing landmark-unique, scrollable-region-focusable and an empty table header. No horizontal overflow at 360 (fixed grid min-width/scroll rails). Charts keep summaries, data tables, focusable points and colour+shape/texture encoding.
- Performance: `frontend/docs/design/performance.md` adds before/after. `/admin/orders` 7152 -> 3764 ms (1440) / 3332 (390); `/admin/reconciliation` 5984 -> 2124 (1440) / 1992 (390); API p95 2793 -> 449 ms for orders. Remaining >2.5 s pages and the Bangla-H1/font-swap cause are recorded honestly; public bundles unchanged (373/387/403/372/360 KB). New admin budgets in `check:bundle`.
- Checks actually run: frontend typecheck; full lint (0 errors, 7 pre-existing warnings); Vitest 113 passed/1 skipped (30 files); production `.next-test` build; `check:bundle` green; backend typecheck/lint/secret gate; backend unit 275/275; analytics-panels e2e 4/4; Playwright real-Chrome screenshots at 1280/360 (dashboard, orders, reconciliation, complaints, withdrawals, refunds, commission, settings) and axe; isolated stack stopped; dev :3000/:5000 restored; :3100 off.
- Remaining Phase 2 gaps (honest): settings still client-skeleton-first (server initial data is the next lever); several list pages (sellers/users/products/categories/payments/payouts/stuck-orders/cod-risk/content/review/highlights/banners/announcements/audit/suspended) have PageHeader + retained lists but no new charts (no supporting series in the panels API); detail pages keep their own single h1. Seller panel remains Phase 3.

## 2026-11-22 Seller dashboard Phase 3 - redesign, mobile-first, server seeding

- Frontend only (`redesign/phase2`); no backend endpoint, migration, ledger/payment/commission/release rule changed. The seller panels endpoint added in Phase 1 is reused.
- Inventory ticked in `frontend/docs/design/dashboard-guide.md`: dashboard (application status + action queue + KPI strip + sales trend + status chart + wallet snapshot + release calendar + COD dues gauge + disputes deadlines + top products + ratings + delivery + stock health + shop/quick links), orders (KPI/status chart/DataTable), wallet (composition donut, COD gauge, release calendar, AnimatedTabs), products (stock-health strip + server-seeded list), complaints (disputes strip), reviews (rating strip). Payout accounts/shop/zones/questions/cancellations/apply/analytics keep their existing content (PageHeader already applied in the earlier seller consistency pass).
- Server first paint: `getSellerPanelsServer`, `getSellerOrdersServer`, `getSellerWalletServer`, `getSellerProductsServer` seed the client queries and fall back to the existing loading/error states on failure. Seller orders first page + wallet/list data paint from the server.
- Mobile-first: action/KPI strips are snap rails with a focusable labelled region; buttons use larger targets; 10 seller routes verified at 1280 and 360 with zero horizontal overflow; axe on 6 routes x bn/en x 1280/360 has 0 serious/critical (fixed the same scrollable-region/landmark issues as the admin pass).
- Performance (same Slow 4G + 4x CPU method, 5 runs): seller orders 390 5584 -> 2728 ms, seller earnings 390 4988 -> 2368 ms, dashboard 1992/1876 ms (1440/390, within ~10% of baseline), products 4208/3800 ms, analytics 2272/5396 ms (not rebuilt; isolated dataset/noise documented). Public bundles unchanged; new seller budgets in `check:bundle`.
- Checks actually run: frontend typecheck; full lint 0 errors (6 pre-existing warnings); Vitest 113 passed/1 skipped (30 files); production `.next-test` build; `check:bundle` green (public 373/387/403/372/360 KB; seller 366-372 KB); real-Chrome screenshots at 1280/360 for 10 seller routes; axe; isolated stack stopped; dev :3000/:5000 restored; :3100 off.
- Remaining (honest): seller analytics page not rebuilt (existing charts); product list LCP is list imagery (~3.8-4.2 s); payout/shop/zones/questions/cancellations/apply have no new charts (no supporting series); no seller notifications page exists (shared bell only).

## 2026-11-22 Dashboard server range fix (build blocker)

- `/admin` failed a Next 16 Cache Components production build with "blocking route: new Date()" at `presetBounds` called from the server page. Added `src/server/dashboard-range.ts` (`await connection()` before `presetBounds`), routed admin/seller dashboard/orders/complaints pages and the server analytics strips through it, and removed the clock default from the panels helpers.
- Added `frontend/tests/dashboard-server-range.test.ts` (3/3) so a future page cannot re-introduce the bare server-side call. Production build into `.next-check` passed; `.next-check` deleted; dev `:3000`/`:5000` left running; `:3100` off.

## 2026-11-23 Admin/seller dashboard UI/UX polish (reference-driven)

- Frontend only; no backend endpoint, migration or money rule changed. Reference: live Fernly demo inspected in real Chrome at 1440/390; the attached image was not present in the workspace, so the supplied characteristics + current-panel audit were used.
- Audit (1440/1280/768/390/360): flat card hierarchy, 28 admin cards, 7,327 px admin mobile page, loud marigold sidebar fill with no tablet rail, 5 radii/11 type sizes, heavy chart textures/flattened axes, no recent-orders table. Direction: calm editorial operations console using the existing forest/marigold tokens.
- Implemented: sidebar icon rail at md + cream/forest active surface + 3 px marigold indicator + tooltips; featured GMV/Revenue KPI with icon/drill-down; 2-col mobile KPI/queue grids with icons; server-seeded recent orders on both dashboards; nested AnimatedTabs for secondary analytics and top lists; compact approved-seller status; chart nice-max/rounded/lighter/220 ms entrance; transform-only tab indicator and progress fills; page actions; seller notifications broken-link removed.
- Preservation: every previous metric, queue, chart, filter, table, action and drill-down remains reachable (tabs/data tables/tooltips/detail links); no mock data; seller metrics remain seller-scoped.
- Browser verification: real Chrome 1440/1280/768/390/360; admin 4,016?2,745 px desktop and 7,327?5,018 px mobile; seller 3,119?2,733 and 5,162?4,790; no overflow. axe 0 violations on /admin, /admin/orders, /seller/dashboard, /seller/orders, /seller/earnings at bn/en x 1280/360. Reduced motion: chart animation none, tab/nav transition-property none. Tablet rail 80 px with focus tooltip; 360 drawer labels verified.
- Performance (same method, 5 runs): /admin 3624/3316 ms (flat vs baseline), /admin/orders 3176/3016 (improved), /seller/dashboard 2096/2052 (+5%/+9% for the added content), /seller/orders 2564/2404 (improved); CLS <=0.0013; public bundles unchanged, admin +3-4 KB, seller +1 KB, no new dependency.
- Checks: frontend typecheck, lint 0 errors (6 pre-existing warnings), Vitest 116 passed/1 skipped, production `.next-test` build, check:bundle green, backend unchanged. Test stack stopped; dev :3000/:5000 restored; :3100 off.

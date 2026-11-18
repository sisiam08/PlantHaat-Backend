# PlantHaat — Payments, Admin Settings & Settlement: Master Spec

Read this file fully, then read `progress.md` (the live status, source of truth for what is done), `payments/design.md` (design note with amendments A1–A9 and the owner-decision table) and `frontend/docs/testing/live-log.md`. Do not redo finished work. Continue from the progress file.

---

## 1. Environment and process rules (always)

**Repos and branches**
- Backend: work on branch `feature/payments`. Never push payments, settings-wiring or ledger work to `main`. Merging to main only when the owner says so. (`34f4d12` on main is inert and stays.)
- Frontend: branch `redesign/phase2`.
- Do not touch the owner's unrelated uncommitted changes (e.g. `prisma/seed-demo.ts`, banners, about page). Stage only your own files. Check `git status` before each commit.

**Servers and ports**
- Exactly ONE supervised API on :5000 (`backend/scripts/serve-supervised.mjs`, logs `backend/logs/api.log`). Frontend dev server on :3000. **:3100 must stay OFF.** For performance measurement only, ask the owner first, and switch back to dev afterwards.
- Start long-running processes detached and return immediately (redirect stdin/stdout/stderr, hidden window). Never keep a tool call open on a spawned server. Start in one call, poll `/api/v1/health` in separate short calls. Use a reusable script (`backend/scripts/start-api.ps1`). If any tool call exceeds 60 seconds, tell the owner what it waits for.

**Databases**
- There are at least two databases: dev (neondb) and `planthaat_test`. Every migration must be applied to BOTH via `npm run db:migrate:all` (guarded; prints host and database name, never passwords; refuses non-dev targets). Record `db:status:all` in the progress file. E2E global setup fails fast if the test DB is behind.
- The owner decided: no backup verification and no scratch DB; he manages his data. Migrations are additive (new tables/columns, nullable or defaulted, no drops, no rewrites of existing orders/payments; existing orders read as legacy COD). Write a rollback note per migration.
- `backend/backups/` and `*.dump` stay gitignored; never commit dumps.
- Live UI checks must not leave test values in dev settings (restore immediately or use the test DB).

**Secrets and personal data**
- Never print secrets or full connection strings. The bKash receiving number in the dev settings is the owner's real personal number: keep it, never delete or overwrite it, and show it masked (first 3 and last 2 digits) in chats, logs, docs, commits and test output. Never hard-code it.

**Browser**
- Use the visible (headed) Playwright browser on http://localhost:3000, one persistent window. Announce each step in chat (page, viewport, what is checked), pace actions (about 1.5 s waits, smooth scrolling, visible resizing), log to `frontend/docs/testing/live-log.md`. Lighthouse/bundle work may run headless in separate processes.

**Working style**
- Work in batches. Each batch: code, tests, docs, commit, push. Update `progress.md` after every batch (status, commit hash, test counts, migrations applied to both DBs).
- Post a 5-line status in chat after each batch (done, tests, next, owner needs, branch).
- Do not stop between batches to ask permission. Ask the owner ONE precise question only when a choice changes money behavior or an external blocker cannot be solved.
- If your context is getting long: finish the current batch, commit, write exact resume instructions in the progress file, and say so.
- Report something as done only with evidence (counts, request logs, screenshots, DOM measurements). Never claim an unmeasured improvement.
- Money code rules: existing money convention (integer minor units or Decimal), no floats; every money mutation inside a DB transaction; append-only ledger with unique idempotency keys; row locks for balance changes, releases and withdrawals; server recomputes all amounts and never trusts client totals; concurrency tests are mandatory.

---

## 2. Business model (owner decisions)

- Advance payments: the buyer pays the FULL order total to the PLATFORM's bKash/Nagad number (manual "Send Money", then submits TrxID). No gateway SDK. COD stays and keeps working exactly as today.
- The platform holds the money and pays sellers separately later.
- After delivery there is a return/objection window (default 48h). If no objection arrives, the order's money becomes AVAILABLE in the seller's account and the seller can withdraw it.
- One payment per checkout Order covering all ShopOrders (one TrxID), allocated per ShopOrder.
- Everything configurable lives in admin-managed Settings; the whole app follows what the admin sets. No business value hard-coded.

Defaults (all editable in Settings; marked "needs owner confirmation" in the design note): commission = existing rule (currently 10%); delivery charge goes to the seller; COD dues limit 1000; return window 48h; unpaid payment expiry 12h; pending-verification SLA 24h; late-payment grace 48h; minimum withdrawal 500; payout-profile cooldown 24h; refund method manual bKash/Nagad with TrxID recorded.

---

## 3. Part 5 — Admin-managed settings (foundation)

**Status:** registry, history, re-auth, tests and the Settings UI exist (see progress file). Remaining: UI fixes below, characterization tests, wiring, settings reference, grep guard.

**Foundation (done, keep intact):** registry in code (key, type, default, schema, group, bilingual label/help, isPublic, isSensitive); DB overrides; typed cache with invalidation; append-only history written in the same transaction with row-lock chain (`oldValue[n] == newValue[n-1]`, `sequence` column); admin-only endpoints; public endpoint returns only public keys (test: sensitive keys can never be public); password re-auth token (5 min, single-use, key-scoped, throttled) for sensitive writes.

**Settings (all editable in admin):**
- Payments: COD enabled; Advance enabled; bKash enabled + number; Nagad enabled + number; account type note; payment instructions and warning texts (bn/en); verification time text; unpaid expiry hours; pending-verification SLA hours; late-payment grace hours; optional COD maximum order amount (0 = none).
- Orders and returns: return/objection window hours; allow early release by buyer confirmation; dispute types; photo evidence required; max evidence photos.
- Commission and wallet: default commission %; optional per-shop override on the admin shop page; delivery-charge recipient; COD dues limit; deduct COD commission from available balance.
- Payouts: minimum withdrawal; allowed payout methods; cooldown after payout-profile change; max pending withdrawal requests.
- Support: WhatsApp number, support phone, support email.

**Rules:**
- A provider (bKash/Nagad) defaults OFF and can be enabled only with a valid Bangladesh mobile number; enforce in backend validation and UI. Advance cannot be enabled unless at least one provider is enabled with a number. At least one of COD/Advance must always stay enabled.
- Snapshot, never retro-apply: commission and delivery-charge rule snapshotted on the order at payment time; payment expiry at order creation; payment instructions and receiving number snapshotted on the payment record (a buyer mid-payment keeps the number that was current); releaseAt computed from the window at the moment of delivery.
- Sensitive settings (platform payment numbers, commission, payout rules): re-auth required, history entry, in-app notification to other admins, "last changed by/at" visible. Re-auth token never stored in localStorage.
- **Pending Settings UI fixes:** group related fields (bKash card, Nagad card, Timing card); one-line bilingual help text per field with effect scope; rename "Payment page preview" to "Payment settings summary" until the real component exists (replace with the real preview in Part 3); sticky Save bar with proper singular/plural "N unsaved changes" and Discard; specific inline validation messages; desktop layout verified at 1280 and 360 including re-auth dialog, history viewer and a validation error; Playwright e2e for the UI (non-sensitive change, sensitive change with re-auth, wrong password, enabling Nagad without a number, unsaved guard, reset to default, history entry).
- **Wiring (Batch 3):** first write characterization tests of current behavior (COD availability, delivery and free-delivery rules, commission calculation, the 48h complaint wording and any timers). Then replace every hard-coded business value with a SettingsService read whose default equals today's behavior. List each replacement (file, old value, setting key) in `settings/reference.md` (also every key: type, default, who can change, where used, snapshotted or not). Add a grep guard test that fails if a known business constant reappears. Prove characterization tests pass with defaults and change when a setting changes.

---

## 4. Part 3 — Payments (Advance via bKash/Nagad, or COD)

Ship behind the Settings flag "Advance payment enabled", default OFF, switch the default to ON only when its e2e tests pass.

**Data and state machine**
- PaymentIntent per checkout Order (amountDue computed once server-side by ONE function so partial advance can be added later). PaymentSubmission rows (provider, trxId, senderNumber, optional proof, status, reviewedBy/At, rejectReason, amountReceived). `UNIQUE(provider, trxId)` across ALL submissions including rejected ones. Payment status derived from submissions and amounts.
- States: `UNPAID -> PENDING_VERIFICATION -> PAID`; `PENDING_VERIFICATION -> REJECTED -> (resubmit) PENDING_VERIFICATION`; `UNPAID -> EXPIRED`; refunds tracked by `refundedAmount` (derive PARTIALLY_REFUNDED/REFUNDED).
- **A1** Only UNPAID expires (order cancelled, stock released). PENDING_VERIFICATION never auto-expires; stock hold continues; raise an admin SLA alert after the SLA hours and notify the buyer. Late payment: if an expired UNPAID order gets a TrxID within the grace window, accept it into PENDING_VERIFICATION; on verification reinstate the order if stock allows, otherwise mark REFUND_REQUIRED.
- **A3** Admin enters amountReceived at verification; PAID requires amountReceived == amountDue. Underpaid: stays unpaid with remaining amount shown, buyer may submit another TrxID for the difference. Overpaid: PAID, excess recorded as REFUND_PAYABLE.
- **A4** Cancelling one ShopOrder of a PAID order (buyer before shipment, seller out of stock, admin) creates a refund obligation equal to that ShopOrder's allocated amount only. Admin REFUND_REQUIRED queue: send money back manually, record the refund TrxID, write ledger entries. Same path for accepted disputes, late payments without stock, overpayments.
- Fulfillment gate: seller cannot confirm/ship an ADVANCE order until PAID; COD unchanged. Verification unlocks all ShopOrders of that Order together.
- Validation: conservative TrxID check (alphanumeric, sensible length; do not reject legitimate IDs), Bangladesh mobile validation, rate limits, idempotent submit, buyer-only access, no submit after PAID.

**Endpoints:** GET payment info for an order (amount, provider numbers from snapshot, status, expiry); POST submit payment; admin: list pending, verify (with amountReceived), reject with reason, refund queue actions; audit log and notifications (existing bell) for submitted, verified, rejected, expired, SLA alert.

**Checkout UI:** payment method selector (COD | Advance bKash/Nagad, showing the amount due, only methods enabled in Settings; COD max amount rule). After Place order: COD -> success page; ADVANCE -> payment page.

**Payment page** (route like `/checkout/payment/[orderId]` or `/orders/[id]/pay`), structure modelled on the owner's reference (`frontend/docs/reference/payment-reference.png` if present), using PlantHaat tokens (not the reference's purple, and not the number visible there):
1. optional coupon input + Apply (only if a coupon system exists; do not invent one);
2. "How to send?" toggle: bKash | Nagad;
3. warning callout: "Send Money — not Cash Out. If you cash out, the money will not reach us.";
4. box with the receiving number for the selected provider + Copy button ("Copied" feedback), number large and selectable;
5. 4 numbered steps: send ৳{amount} to the number above; enter your own mobile number in the reference/note; copy and save the TrxID; submit the information below;
6. primary CTA "Payment made, submit information ->" revealing/opening a compact form: sender mobile + TrxID (+ optional screenshot) with inline validation;
7. help line with WhatsApp link (from Settings).
States: unpaid (expiry countdown), pending verification (read-only), paid, rejected (reason, resubmit), expired, underpaid (remaining amount). Buyer-only, refresh/back safe, bilingual, 360px first, 44px targets.
- Orders list/detail: payment badge, "Complete payment" while UNPAID and not expired, payment timeline.
- Admin: "Payments to verify" queue (pending first: order, amount, provider, TrxID, sender number, time, proof) with verify/reject dialogs (AlertDialog; reject needs a reason); REFUND_REQUIRED queue; SLA alerts.
- Seller: payment status per order; shipping disabled until PAID with a clear explanation.
- Replace the Settings "summary" with the real payment-page preview.

---

## 5. Part 4 — Settlement ledger, 48h hold, disputes, withdrawals

**Ledger:** append-only entries (id, account/bucket, seller or platform, order/ShopOrder ref, type, amount, createdAt, createdBy, unique idempotency key, note); corrections are reversing entries. Accounts: PLATFORM_HOLDINGS, SELLER_PENDING, SELLER_AVAILABLE, SELLER_ON_HOLD, SELLER_PAID_OUT, REFUND_PAYABLE, REFUNDS_PAID, PLATFORM_COMMISSION, COD_DUES.
- **A5** Conservation invariant: total received from buyers = seller buckets + refund payable + refunds paid + commission + paid out. Reconciliation view, a test that fails on breach, and an admin alert if the periodic check fails.
- **A6** Commission and per-shop allocation in minor units, round-half-up at ShopOrder level, deterministic remainder (largest ShopOrder); test with awkward numbers.
- Build on the existing seller earnings, payouts, refunds and complaints models; extend, do not duplicate.

**Lifecycle**
1. Payment PAID: platform holds the money; seller sees "paid, awaiting shipment", no balance yet.
2. Seller ships and marks delivered (deliveredAt, actor, optional proof): seller net enters PENDING, `releaseAt = deliveredAt + window` snapshotted.
3. Buyer notified: "You have until <time> to report a problem", with "Report a problem" and optional "Everything is fine" (early release).
4. Catch-up release job: PENDING rows with `releaseAt <= now` -> AVAILABLE, based on stored timestamps (never in-memory timers), runs on startup and every N minutes, idempotent, locked.
5. **A9** The release job and a dispute both take a lock on the ShopOrder row; test 47h59 vs 48h01 and a dispute at 47h59m59s concurrent with the job, run many times.
6. Dispute inside the window (types: not received, damaged/dead on arrival, wrong item, other; description + photo evidence via existing uploads; buyer of that order only; one open dispute per ShopOrder): funds ON_HOLD, admin reviews with an evidence viewer. Outcomes: rejected (back to PENDING/AVAILABLE), accepted full/partial refund (admin records refund TrxID; ledger entries), return where applicable. Reason and audit log for every decision.
7. COD: the platform does not receive the cash. Commission is a receivable against the seller (COD_DUES), deducted from AVAILABLE; withdrawals blocked above the dues limit. **A7** Dues cleared by automatic deduction or by the seller paying manually and the admin recording a DUES_PAYMENT with TrxID. Dues and history visible in the seller wallet.

**Withdrawals:** seller payout profile (bKash/Nagad/bank, number, holder name; change triggers cooldown and notification). Request amount <= AVAILABLE, minimum from Settings, limited pending requests; amount reserved immediately by a ledger entry (no double withdrawal). Admin payout queue: pending requests with seller, amount, destination, balance snapshot; mark paid (transaction reference -> PAID_OUT) or reject with reason (reserve returned). Idempotent, notifications at each step.

**UI**
- Seller Wallet/Earnings: Available, Pending (per-order countdown), On hold, Total withdrawn, COD dues; transactions table with filters; Request withdrawal dialog; payout profile; plain explanation of the window rule; empty/loading/error states; responsive, bilingual, `<Price>` everywhere.
- Buyer: delivered time and live "report a problem until <time>", report form with photo upload, dispute status timeline.
- Admin: Disputes queue, Payout requests queue, Ledger/reconciliation view, Settings (Part 5).
- Notifications: delivered (buyer), funds released (seller), dispute opened/decided, withdrawal requested/paid/rejected.

---

## 6. Tests required

- Backend unit and real-DB integration (test-prefixed data, cleaned up): state machine; TrxID uniqueness (including rejected); idempotent submit; expiry job (UNPAID only); fulfillment gate; server-side totals; amount mismatch paths; partial refunds; ledger invariants and conservation; release job idempotency and overlap safety; 48h boundary; dispute-vs-release race; refund math; withdrawal reservation with parallel requests; COD dues; permissions (buyer/seller/admin cannot access others' data); settings snapshot behavior.
- Playwright e2e (watch the first runs in the visible browser): COD end to end; ADVANCE (place -> payment page -> submit TrxID -> admin verifies -> seller confirms -> shipped -> delivered -> window passes via test clock/setting override -> AVAILABLE -> withdrawal -> admin pays); rejection then resubmission; duplicate TrxID rejected; underpayment/overpayment; expiry releases stock but PENDING_VERIFICATION does not expire; partial refund after single-shop cancellation; dispute path; early confirmation path; admin changes a setting (new payment page shows the new number while an existing awaiting-payment order keeps the old one; disabling COD hides it; return window change affects only new deliveries; commission change affects only new orders); cart quantity-increase scenario flowing into a 2+ shop checkout.
- Keep the existing suites green after every batch: overflow, typography, scroll-restore, messages coverage, cart-quantity, full suite. Report counts.

---

## 7. After payments are done (queued, do not start earlier)

1. Performance: use trustworthy measurement (only prod server and API running, Lighthouse CLI mobile, 5 runs per page, median and min/max, record benchmarkIndex; ask the owner before running a production build on :3000). Bundle analyzer top-10 per route (home, PDP) and acting on it (defer /auth/me, socket, toaster, notifications; lazy cmdk, dialogs, motion features); PDP LCP regression (preload `imagesrcset/imagesizes` must match the rendered img; fetch priority; cold vs warm optimizer); fonts (Inter Latin static 400/600; Hind Bengali 400/600 only on bn; no cross-locale font downloads); home h1 LCP (render-blocking CSS, hydration); before/after table with observed and simulated LCP reconciled.
2. Images: investigate the 2 local category-image 500s; stop using picsum.photos for seed data (local fixtures, remove from `remotePatterns`), `onError` fallback; fix `sizes` on every `next/image`; list products still lacking real photos.
3. Feed requests after Back: after home -> PDP -> Back no refetch storm of already loaded pages (staleTime/refetchOnMount for restored lists), assert request counts in the scroll-restore e2e.
4. Backend latency: remove `includeTotal=true` from rail requests unless the UI shows the total; cache rails; defer `/auth/me` on public pages; EXPLAIN ANALYZE-based proposals into `BACKEND_CHANGE_REQUESTS.md`.
5. Remaining design leftovers: card care chips and low-stock badge once the list DTO provides the fields; fly-to-cart only if everything else is clean.

---

## 8. Final report (when everything is done)

What is done with evidence; the hard-coded values removed; the assumptions table with current default values; known gaps; a step-by-step manual test script the owner can follow himself (COD, Advance, rejection, underpayment, dispute, release, withdrawal, settings changes); and an honest list of what is still open.

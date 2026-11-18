# Payments, settlement, and platform settings - design note

Status (2026-11-18): Parts 5 (settings) and 3 (manual Advance via bKash/Nagad) are implemented on `feature/payments`; Part 4 (settlement ledger, unified hold window, withdrawals/disputes) is still the remaining work. Amendments A1–A9 are approved and part of the contract.

## Current state
- Orders are one `Order` with one `ShopOrder` per seller, created idempotently after server-side repricing.
- COD and manual Advance payments (one payment per checkout Order, allocated per ShopOrder) exist; seller earnings/payouts/refunds/complaints are extended, not replaced.
- Manual mobile-banking verification only. No gateway SDK.

## Multi-shop payment model (Part 3)
- One **PaymentIntent per checkout Order**, covering all ShopOrders. `amountDue` is computed once server-side from the priced Order.
- Each ShopOrder stores its allocated amount, so platform verification unlocks all seller groups together.
- A later partial-advance feature can change the allocator without changing the page/state machine.
- `ADVANCE` means full order total upfront (owner decision). COD bypasses the payment page.

## Payment state machine
`UNPAID → PENDING_VERIFICATION → PAID`
`PENDING_VERIFICATION → REJECTED → PENDING_VERIFICATION` (buyer resubmits)
`UNPAID → EXPIRED` (job cancels order + releases stock)
`PAID → PARTIALLY_REFUNDED → REFUNDED` (refund obligations; never mutate past entries)

- Only UNPAID expires. PENDING_VERIFICATION never auto-expires; the stock hold continues and an admin SLA alert fires after `payment.slaHours`.
- Unique `(provider, trxId)` across all submissions, including rejected. Conservative TrxID/mobile validation.
- Payment numbers/instructions/expiry/support come from settings and are **snapshotted onto the payment record** at order creation.
- Fulfillment gate: ADVANCE seller transition requires `payment.status = PAID` (or PARTIALLY_REFUNDED); COD unchanged.

## Settlement ledger (Part 4)
Append-only, idempotency-keyed entries with buckets `PLATFORM_HOLDINGS`, `SELLER_PENDING`, `SELLER_AVAILABLE`, `SELLER_ON_HOLD`, `SELLER_PAID_OUT`, `REFUND_PAYABLE`, `REFUNDS_PAID`, `PLATFORM_COMMISSION`, `COD_DUES`. Balances derived from entries; reconciliation compares sums.

Lifecycle:
1. Payment PAID → platform receives funds (seller balance unchanged).
2. Delivered → seller net enters PENDING; `releaseAt = deliveredAt + windowHours` snapshotted.
3. Buyer may confirm early or open a dispute; dispute moves the amount to ON_HOLD.
4. Catch-up job releases `PENDING` rows where `releaseAt <= now` to AVAILABLE inside a transaction with row locks/unique keys.
5. Refund → reversing seller entries; withdrawal reserve → PAID_OUT pending request; admin paid/rejected are idempotent.

Delivery charge defaults to the seller (seller delivers); commission uses existing commission rules (default 10% if none). COD commission is a receivable deducted from AVAILABLE, with a configurable dues limit/block. All flagged for owner confirmation.

## Settings (Part 5, first)
Registry keys with default, schema, group, bilingual labels, public/sensitive flags. DB overrides with short-TTL cache and append-only history. Public endpoint exposes only whitelisted keys. Sensitive changes require re-auth + notify other admins.

Groups: Payments, Orders & Returns, Commission & Wallet, Payouts, Support, Security. Snapshot values on Order/Payment/SellerOrder as applicable; never retro-apply.

## Migration plan
1. Back up dev DB (owner waived restore verification; see below).
2. Additive tables/columns only: payment intents/data, settings overrides/history, ledger entries, disputes, withdrawal requests; nullable/defaulted so existing orders remain COD/legacy.
3. Seed settings defaults and a feature flag for advance payments; backfill no money.
4. Implement settings service first, then payment state machine, then ledger/jobs/withdrawals.
5. Tests at each step; no destructive migration.

## Owner decisions assumed (confirm/change)
| Decision | Assumed |
|---|---|
| Advance amount | Full order total |
| Delivery charge | Seller |
| Commission | Existing rules; 10% default if absent |
| COD commission | Receivable against seller, dues limit blocks withdrawal |
| Return window | 48h, snapshotted at delivery |
| Payment expiry | 12h, snapshotted at creation |
| Minimum withdrawal | Setting, default 500৳ |

## Amendments A1–A9 (approved 2026-11-15)

- **A1 Expiry:** only UNPAID payments expire. PENDING_VERIFICATION never auto-expires; stock hold continues and an admin SLA alert fires after `payment.slaHours` (default 24). Late submission within `payment.lateGraceHours` (default 48) is accepted; on verification, reinstate if stock exists, otherwise `REFUND_REQUIRED`.
- **A2 Submissions:** every attempt is a separate `PaymentSubmission` row. `UNIQUE(provider, trxId)` across all submissions, including rejected. Payment status derives from the latest submission + amounts.
- **A3 Amounts:** admin enters `amountReceived`; PAID requires equality with `amountDue`. Underpayment shows remaining amount and allows another submission; overpayment records `REFUND_PAYABLE`.
- **A4 Partial refunds:** cancelling one ShopOrder of a PAID ADVANCE order creates a refund obligation for that ShopOrder allocation (items + delivery). Payment keeps PAID with refundedAmount; status derives PARTIALLY_REFUNDED/REFUNDED. Manual refund queue records refund TrxID.
- **A5 Accounts:** PLATFORM_HOLDINGS, SELLER_PENDING, SELLER_AVAILABLE, SELLER_ON_HOLD, SELLER_PAID_OUT, REFUND_PAYABLE, REFUNDS_PAID, PLATFORM_REVENUE_COMMISSION, COD_DUES. Reconciliation test + admin alert on breach.
- **A6 Rounding:** minor units, round-half-up at ShopOrder level; remainder deterministically to largest ShopOrder. Tests with awkward values.
- **A7 COD dues:** cleared by available-balance deduction or admin-recorded DUES_PAYMENT with TrxID; visible in seller wallet.
- **A8 Defaults:** existing `commission.default` is **10%** in code today (not 0, not 15); show it in Settings. Minimum withdrawal 500; COD dues limit 1000; pending SLA 24h; late grace 48h; refund method manual bKash/Nagad with TrxID. All owner-confirmable.
- **A9 Release race:** release job locks the ShopOrder row inside a transaction; disputes lock the same row. Tests 47h59 vs 48h01 and concurrent dispute at 47h59m59s.

## Restore / backup record
Owner decision (2026-11-15): no scratch-DB restore verification; the owner manages his data. Migrations are additive and each has a rollback note.

## Owner decisions (all editable in Settings, all need confirmation)
| Decision | Default | Why |
|---|---:|---|
| Commission | existing rule; 10% in current `commission.default` | Found in code; not inventing a new rate |
| Delivery charge recipient | Seller | Seller performs delivery |
| COD dues limit | 1000৳ | Explicit platform-risk cap; withdrawals blocked above it |
| Return/objection window | 48h | Owner decision |
| Payment expiry | 12h | Owner decision / task default |
| Payment pending SLA | 24h | A8 |
| Late-payment grace | 48h | A8 |
| Minimum withdrawal | 500৳ | A8 |
| Payout profile cooldown | 24h | Safe default |
| Refund method | Manual bKash/Nagad + TrxID | No gateway |

## Backup record (2026-11-15)

Backup created:
```powershell
pg_dump "postgresql://.../neondb?sslmode=require" -Fc -f backend/backups/dev-20261115-060854.dump
```
File: `backend/backups/dev-20261115-060854.dump` (221,586 bytes). The file stays in `backend/backups/` and is gitignored.

Restore verification was attempted in a temporary local PostgreSQL 18 cluster but failed with Windows exception `0xC0000142`; the owner then explicitly waived this verification, so it is not a blocker for migrations.

## Part 3 implementation notes
- `PaymentIntent.providerSnapshot` stores the provider numbers/instructions/account note/verification text/expiry/SLA/grace at order creation. Changing settings later never changes an existing payment.
- Partial refunds use `RefundObligation`; the intent remains PAID with `refundedAmount` and derives PARTIALLY_REFUNDED/REFUNDED.
- Overpayment is recorded as REFUND_PAYABLE for the excess; underpayment returns the submission to REJECTED and exposes remainingAmount.
- Late payment follows A1: grace window only, reinstate when stock can be held again, otherwise REFUND_REQUIRED.
- **Payment proof (2026-11-16):** the buyer uploads through `POST /uploads/images` with `purpose=payment` (5 MB max; JPEG/PNG/WebP/HEIC/HEIF, re-encoded to WebP and stripped). A submission may send the returned storage key (`payments/<buyerId>/<file>.webp`) or a URL whose path ends in that key; the server resolves it through `UploadedAsset` (same owner, purpose `payment`) and stores the canonical stored URL. External hosts, `data:`/`javascript:`/other schemes, path traversal and another buyer's upload are rejected with `PAYMENT_PROOF_INVALID`. Admin screens render only the stored URL.

## Part 4 prerequisite - one window setting (design decision, no code yet)
The app currently reads **two** hold windows:
- `return.windowHours` (default 48) drives the buyer complaint/return window (`complaints.service.ts`) and the customer-facing copy.
- `payout.holdHours` (default 48) drives `LedgerEntry.availableAt` in `ledger.service.ts` (positive entries unlock at `deliveredAt + holdHours`).

Part 4 must use **one source of truth for the money hold**. Recommended:
1. `return.windowHours` is the single setting: the buyer's objection window and the seller-funds hold start at `deliveredAt` and end at the same instant (`releaseAt = deliveredAt + return.windowHours`). This keeps the promise "available after the return window".
2. `payout.holdHours` becomes a deprecated alias: the registry keeps the key (so old admin UIs/API readers do not break) but reads/writes delegate to `return.windowHours`, and the Settings UI shows one field with a "legacy alias" note. If a migration is preferred, backfill `payout.holdHours = return.windowHours` once, then hide/retire the key.
3. New ledger rows compute `availableAt` from the unified window at delivery time (snapshotted), so changing the setting later affects only new deliveries. Existing rows keep their stored `availableAt`.
4. Add a characterization test: with both keys set differently, the release time follows `return.windowHours`; a setting change affects only new deliveries.
5. `LedgerEntry` stays the single balance source. Part 4 adds the missing platform/refund buckets and idempotency keys to the existing `LedgerEntry` model, not a second ledger.

### Existing earnings/dues/payout code to extend (not duplicate)
- `LedgerEntry` (type, amount, sellerProfileId, shopOrderId/payoutId/refundId, `availableAt`) already implements the positive-entry hold and is the base for PENDING/AVAILABLE.
- `PayoutsService.createPayout` reserves the available balance by writing a negative `PAYOUT` ledger row inside one transaction; `recordDuesPayment` writes a positive `DUES_PAYMENT`; `recordAdjustment` writes `ADJUSTMENT`. Part 4 should add the missing buckets (ON_HOLD, REFUND_PAYABLE/PAID, PLATFORM_COMMISSION, COD_DUES) around these rows, not replace them.
- `Refund` + `RefundObligation` already exist; Part 4 should link `Refund` to ledger reversal entries with unique idempotency keys (today the advance refund queue records the obligation + TrxID, but does not yet post ledger entries - this is the stated Part 4 gap).
- **Baseline failure to resolve first:** `test/earnings.e2e-spec.ts` has a skipped scenario ("dues payment 422") that uses `GET /seller/earnings` with a body and expects `201`; before extending payouts, re-diagnose that test: the request helper/expectation is wrong independently of the dues write, and the 422 path must be reproduced against the current `recordDuesPayment`/`createPayout` guards. Fix the test semantics (do not weaken the assertion) and add a real dues-limit characterization case.

---

## Part 4 implementation (2026-11-18) � final ledger design

### Source of truth and compatibility

`LedgerEntry` remains the single ledger. Part 4 added nullable `account`, `releaseAt`, `batchId`,
`idempotencyKey` (unique), `orderId/paymentId/disputeId/withdrawalId`, and made
`sellerProfileId` nullable for platform-only entries. Existing rows keep `account = NULL` and are
still projected by the legacy pending/available calculation, so old delivered/paid orders do not
change balance. New settlement events always write account entries.

`payout.holdHours` is a deprecated alias: `SettingsService.get/getAll` read
`return.windowHours`, and `SettingsService.update` rewrites `payout.holdHours` to
`return.windowHours`. The ledger reads only `return.windowHours`.

Existing endpoints kept working: `GET /seller/earnings`, `GET/POST/PATCH /admin/payouts`,
`/admin/sellers/:id/{ledger,balance,dues-payments,adjustments}`, refunds and complaints. New Part 4
endpoints are additive (see `api.md`). `Payout` is reused for seller withdrawal requests
(`requestedById`, `balanceSnapshot`, `idempotencyKey`, `rejectionReason`), so the admin payout queue
and the withdrawal queue share one auditable record.

### Accounts and sign convention

Amounts are deltas to one account bucket (Decimal 12,2, no floats). A business event is one
`postBatch()` call with a deterministic `eventKey`; every row gets `idempotencyKey =
"<eventKey>:<index>"`, so replaying an event posts nothing (`createMany skipDuplicates`).

| Account | Meaning |
|---|---|
| `BUYER_RECEIPTS` | cumulative cash actually received from buyers (advance only) |
| `PLATFORM_HOLDINGS` | advance cash still held by the platform |
| `SELLER_PENDING` | seller net waiting for the return window |
| `SELLER_AVAILABLE` | withdrawable seller balance |
| `SELLER_ON_HOLD` | seller funds locked by an open dispute |
| `SELLER_WITHDRAWAL_RESERVED` | amount reserved by a pending withdrawal |
| `SELLER_PAID_OUT` | cumulative seller payouts |
| `REFUND_PAYABLE` | refund obligation not paid yet |
| `REFUNDS_PAID` | cumulative refunds paid |
| `PLATFORM_COMMISSION` | commission recognised / retained |
| `COD_DUES` | COD commission receivable (negative = seller owes) |

### Posting table

| Event | Entries (signed deltas) | Idempotency key |
|---|---|---|
| Advance payment verified PAID | `BUYER_RECEIPTS +received`, `PLATFORM_HOLDINGS +received` | `payment_receipt:<intentId>` |
| Advance delivered | `PLATFORM_HOLDINGS -total`, `SELLER_PENDING +net`, `PLATFORM_COMMISSION +commission` | `delivery:<shopOrderId>` |
| Release (window closed / early) | `SELLER_PENDING -net`, `SELLER_AVAILABLE +net` | `release:<shopOrderId>` |
| Dispute opened | source (`PENDING` or `AVAILABLE`) `-amount`, `SELLER_ON_HOLD +amount` | `dispute_hold:<complaintId>` |
| Dispute rejected / return to seller | `SELLER_ON_HOLD -amount`, `SELLER_PENDING` or `SELLER_AVAILABLE +amount` | `dispute_release:<complaintId>:<to>` |
| Refund accepted | `REFUND_PAYABLE +amount`, seller source `-sellerShare`, `PLATFORM_COMMISSION -commissionShare` | `refund_payable:<refundId>` |
| Refund paid | `REFUND_PAYABLE -amount`, `REFUNDS_PAID +amount` | `refund_paid:<refundId>` |
| Part 3 obligation completed (overpay/cancel/late no-stock) | `PLATFORM_HOLDINGS -amount`, `REFUNDS_PAID +amount` | `refund_obligation_paid:<obligationId>` |
| Withdrawal requested | `SELLER_AVAILABLE -amount`, `SELLER_WITHDRAWAL_RESERVED +amount` | `withdrawal_reserve:<payoutId>` |
| Withdrawal paid | reserved `-amount`, `SELLER_PAID_OUT +amount` | `withdrawal_paid:<payoutId>` |
| Withdrawal rejected | reserved `-amount`, `SELLER_AVAILABLE +amount` | `withdrawal_rejected:<payoutId>` |
| COD delivered | `COD_DUES -commission` (receivable) | `cod_dues:<shopOrderId>` |
| COD auto-deduction | `SELLER_AVAILABLE -amount`, `PLATFORM_COMMISSION +amount`, `COD_DUES +amount` | `cod_deduct:<seller>:<order>:<dues>:<available>` |
| Manual COD dues payment | `COD_DUES +amount` (outside advance conservation) | `cod_dues_payment:<seller>:<reference>` |
| Admin adjustment | `PLATFORM_HOLDINGS -amount`, `SELLER_AVAILABLE +amount` (signed) | `adjustment:<seller>:<uuid>` |

Advance conservation (A5):
`BUYER_RECEIPTS = PLATFORM_HOLDINGS + SELLER_PENDING + SELLER_AVAILABLE + SELLER_ON_HOLD +
SELLER_WITHDRAWAL_RESERVED + REFUND_PAYABLE + PLATFORM_COMMISSION + SELLER_PAID_OUT + REFUNDS_PAID`.
COD is excluded from buyer receipts; `COD_DUES` is tracked separately because the seller/courier
already holds the cash.

### State machines

- Shop order settlement: `NOT_DELIVERED -> DELIVERED` creates `releaseAt = deliveredAt + window`
  and `SELLER_PENDING`; `PENDING -> AVAILABLE` on release; `PENDING/AVAILABLE -> ON_HOLD` on an
  accepted dispute; `ON_HOLD -> PENDING|AVAILABLE` on reject/return; `ON_HOLD -> REFUND_PAYABLE ->
  REFUNDS_PAID` on refund. `ShopOrder.fundsReleasedAt` is the release marker.
- Withdrawal (`Payout`): `PENDING -> PAID` or `PENDING -> REJECTED`; replays of the same transition
  return the stored payout. `SELLER_WITHDRAWAL_RESERVED` prevents double spending.
- Dispute (`Complaint`): `OPEN -> SELLER_RESPONDED -> (admin) REJECTED|RESOLVED_REFUND|CLOSED`.
  `decision` (`DisputeDecision`) is the money decision; a decided dispute cannot be decided again.

### Locking and jobs

- `SettlementScheduler` runs on bootstrap and every 5 minutes. It selects delivered advance orders
  with `releaseAt <= now`, `fundsReleasedAt = null`, no open dispute, then locks
  `SELECT ... FROM "ShopOrder" WHERE id = ? FOR UPDATE` inside one transaction, re-checks, posts the
  release and stamps `fundsReleasedAt`. A process-level flag prevents overlapping runs.
- Dispute creation and dispute decisions lock the same `ShopOrder` row before moving funds (A9).
  The race test opens a dispute at the window while the release job runs; funds always end in exactly
  one bucket.
- Withdrawal requests lock the seller's `SellerProfile` row before reading balances, so parallel
  requests cannot both pass the available check.

### Rounding (A6)

Commission is rounded per line (ROUND_HALF_UP, 2 dp) and summed; the per-ShopOrder allocation equals
the ShopOrder total, and the intent `amountDue` equals the sum of allocations. Multi-shop allocations
with `.33/.34` prices are covered by `test/settlement.e2e-spec.ts`.

### Legacy and migration

Migration `20261118120000_p4_settlement_ledger` is additive. Existing rows keep `account = NULL`;
no opening entries or balance rewrites are written. If an ADVANCE order was verified before this
release and delivered after it, delivery posts the missing receipt idempotently
(`payment_receipt:<intentId>`) before the delivery batch. Orders delivered before Part 4 are not
picked up by the release job because they have no `releaseAt`; their history stays as-is
(legacy-settled). Rollback SQL is included in the migration file.

### Decisions taken autonomously

1. Reused `Payout` for seller withdrawals and `Complaint` for disputes instead of new tables.
2. A refund decision requires the admin to record the refund TrxID to post `REFUNDS_PAID`; without
   one, a `REQUESTED` refund and `REFUND_PAYABLE` are created and the seller funds stay on hold.
3. A rejected/returned dispute goes back to `PENDING` when the original release time is still in the
   future, otherwise straight to `AVAILABLE`.
4. COD dues payments are not mixed into advance conservation (no platform cash); automatic deduction
   from available books the retained cash as platform commission.
5. The release job skips legacy delivered orders without `releaseAt` rather than guessing a date.

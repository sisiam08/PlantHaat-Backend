# Payments, settlement, and platform settings — design note

Status: proposed, **no migrations/code yet**. This note precedes Part 5 → Part 3 → Part 4 implementation.

## Current state
- Orders are one `Order` with one `ShopOrder` per seller, created idempotently after server-side repricing.
- Payments currently follow COD; seller earnings/payouts/refunds/complaints already exist and must be extended, not replaced.
- Manual mobile-banking verification only. No gateway SDK.

## Multi-shop payment model (Part 3)
- One **PaymentIntent per checkout Order**, covering all ShopOrders. `amountDue` is computed once server-side from the priced Order.
- Each ShopOrder stores its allocated amount, so platform verification unlocks all seller groups together.
- A later partial-advance feature can change the allocator without changing the page/state machine.
- `ADVANCE` means full order total upfront (owner decision). COD bypasses the payment page.

## Payment state machine
`UNPAID → PENDING_VERIFICATION → PAID`
`PENDING_VERIFICATION → REJECTED → PENDING_VERIFICATION` (buyer resubmits)
`UNPAID/PENDING_VERIFICATION → EXPIRED` (job cancels order + releases stock)
`PAID → REFUNDED` (admin refund path; ledger entries, never mutation)

- Unique `(provider, trxId)`; conservative TrxID/mobile validation.
- Payment numbers/instructions/expiry/support come from settings and are **snapshotted onto the payment record** at order creation.
- Fulfillment gate: ADVANCE seller transition requires `payment.status = PAID`; COD unchanged.

## Settlement ledger (Part 4)
Append-only, idempotency-keyed entries with buckets `PENDING`, `AVAILABLE`, `ON_HOLD`, `PAID_OUT` plus platform entries. Balances derived from entries; reconciliation job compares sums.

Lifecycle:
1. Payment PAID → platform receives funds (seller balance unchanged).
2. Delivered → seller net enters PENDING; `releaseAt = deliveredAt + windowHours` snapshotted.
3. Buyer may confirm early or open a dispute; dispute moves amount to ON_HOLD.
4. Catch-up job releases `PENDING` rows where `releaseAt <= now` to AVAILABLE inside a transaction with row locks/unique keys.
5. Refund → reversed seller entries; withdrawal reserve → PAID_OUT pending request; admin paid/rejected are idempotent.

Delivery charge defaults to the seller (seller delivers); commission uses existing commission rules (default 0% if none). COD commission is a receivable deducted from AVAILABLE, with a configurable dues limit/block. All flagged for owner confirmation.

## Settings (Part 5, first)
Registry keys with default, schema, group, bilingual labels, public/sensitive flags. DB overrides with short-TTL cache and append-only history. Public endpoint exposes only whitelisted keys. Sensitive changes require re-auth + notify other admins.

Groups: Payments, Orders & Returns, Commission & Wallet, Payouts, Support. Snapshot values on Order/Payment/SellerOrder as applicable; never retro-apply.

## Migration plan
1. Back up dev DB.
2. Additive tables/columns only: payment intents/data, settings overrides/history, ledger entries, disputes, withdrawal requests; nullable/defaulted so existing orders remain COD/legacy.
3. Seed settings defaults and a feature flag for advance payments; backfill no money.
4. Implement settings service first, then payment state machine, then ledger/jobs/withdrawals.
5. Tests at each step; no destructive migration.

## Owner decisions assumed (confirm/change)
| Decision | Assumed |
|---|---|
| Advance amount | Full order total |
| Delivery charge | Seller |
| Commission | Existing rules; 15% default if absent |
| COD commission | Receivable against seller, dues limit blocks withdrawal |
| Return window | 48h, snapshotted at delivery |
| Payment expiry | 12h, snapshotted at creation |
| Minimum withdrawal | Setting, default 0৳ |
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
_Pending verification before first migration._

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
File: `backend/backups/dev-20261115-060854.dump` (221,586 bytes).

Restore verification attempted in a temporary local PostgreSQL 18 cluster:
```powershell
initdb -D C:\Users\Lenovo\AppData\Local\Temp\opencode\pg-scratch -U postgres -A trust --no-locale
pg_ctl -D C:\Users\Lenovo\AppData\Local\Temp\opencode\pg-scratch -o "-p 55432" -l server.log -w start
createdb -h localhost -p 55432 -U postgres scratch_verify
pg_restore -h localhost -p 55432 -U postgres -d scratch_verify --no-owner --no-privileges backend/backups/dev-20261115-060854.dump
```
The temporary server crashed during/after startup with Windows exception `0xC0000142` (DLL initialization failure); restore/count verification did **not** complete.

**Blocker:** no migration until a scratch DB is available for verified restore.

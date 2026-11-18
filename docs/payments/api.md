# Advance payments API (Part 3)

All routes are under `/api/v1`; responses use `{ success, data }`. All mutations require `Origin`. ADVANCE is available only when `payment.advance.enabled=true` and at least one provider is enabled with a valid number.

## States

`UNPAID -> PENDING_VERIFICATION -> PAID`  
`PENDING_VERIFICATION -> REJECTED -> PENDING_VERIFICATION`  
`UNPAID -> EXPIRED` (expiry job cancels orders and releases stock)  
`PAID -> PARTIALLY_REFUNDED -> REFUNDED` (refund obligations)

Only `UNPAID` expires. `PENDING_VERIFICATION` never expires; it raises an SLA alert after `payment.slaHours`. A late submission is accepted until `expiresAt + payment.lateGraceHours`; verification reinstates a cancelled order when stock is available, otherwise creates a `REFUND_REQUIRED` obligation.

## Checkout

`POST /checkout` with `paymentMethod: "ADVANCE"` and `Idempotency-Key`.
- Server recomputes all amounts.
- Creates one `PaymentIntent` with server-computed `amountDue`, one allocation per `ShopOrder`, and a snapshot of provider numbers, instructions, warning, account note, verification text and expiry.
- Stock is held and the order starts `paymentStatus: PENDING`.
- `PAYMENT_METHOD_NOT_AVAILABLE` if effective advance is off.

## Buyer

### `GET /advance-payments/orders/:orderId`

```json
{
  "id": "intent-id",
  "orderId": "order-id",
  "orderNumber": "PH-...",
  "status": "UNPAID",
  "amountDue": "1970",
  "paidAmount": "0",
  "remainingAmount": "1970",
  "currency": "BDT",
  "expiresAt": "2026-11-16T16:00:00.000Z",
  "paidAt": null,
  "refundedAmount": "0",
  "instructions": {
    "providers": [{ "provider": "BKASH", "number": "01700000000" }],
    "instructions": "Send the exact order total...",
    "warningText": "Keep the receipt...",
    "accountNote": "Personal",
    "verificationText": "Verification usually takes a few hours.",
    "expiryHours": 12,
    "slaHours": 24,
    "lateGraceHours": 48,
    "capturedAt": "2026-11-16T04:00:00.000Z"
  },
  "submissions": []
}
```

### `POST /advance-payments/orders/:orderId/submissions`

```json
{ "provider": "BKASH", "trxId": "9F7K2M1Q", "senderNumber": "01712345678", "proofUrl": "/uploads/payments/x.webp" }
```

**Proof upload (buyer):** `POST /uploads/images` (multipart `file`, `purpose=payment`) returns `{ key, url }` (envelope). Max 5 MB; JPEG/PNG/WebP/HEIC/HEIF only; the server re-encodes to WebP and strips EXIF. The returned key looks like `payments/<buyerId>/<uuid>.webp`.

`proofUrl` may be:
- that storage key, or
- a URL whose path ends with that exact key (e.g. the `url` returned by the upload).

The server checks the key prefix against the authenticated buyer, then requires an `UploadedAsset` row with the same `publicId`, `ownerId` and `purpose="payment"`, and stores the canonical stored URL. External hosts, `data:`/`javascript:`/other schemes, path traversal and another buyer's upload are rejected with `400 PAYMENT_PROOF_INVALID`.

`201` on first submit, `200`-shape idempotent response for the same pending TrxID, `409 PAYMENT_SUBMISSION_DUPLICATE` for a rejected/other-intent TrxID, `400` for invalid TrxID/mobile/proof or closed window, `429` after too many submissions.

## Admin (`ADMIN` role)

- `GET /admin/advance-payments?filter=pending|sla` — intents + submissions + `underSla`.
- `POST /admin/advance-payments/:id/verify` — `{ "amountReceived": 1970 }`.
  - exact/total -> `{ status: "PAID", remainingAmount: "0", overpaidAmount: "0" }`
  - underpaid -> `{ status: "UNDERPAID", remainingAmount: "60" }` and the intent returns to `REJECTED`
  - overpaid -> `PAID` + `REFUND_PAYABLE` for the excess
  - late cancelled order -> `PAID` with `reinstated: true`, or `PAID_REFUND_REQUIRED`
- `POST /admin/advance-payments/:id/reject` — `{ "reason": "TrxID not found" }`
- `GET /admin/advance-refunds` — obligations (`REFUND_REQUIRED` / `REFUND_PAYABLE`)
- `POST /admin/advance-refunds/:id/complete` — `{ "refundTrxId": "BKASHREF1234" }`; intent becomes `PARTIALLY_REFUNDED` or `REFUNDED`.

## Seller (`SELLER` role)

`GET /seller/orders/:shopOrderId/advance-payment` — read-only `{ status, amountDue, paidAt, refundedAmount }`. Seller transitions to `CONFIRMED/PACKED/SHIPPED` return `PAYMENT_REQUIRED` until the intent is `PAID` or `PARTIALLY_REFUNDED`.

## Error codes

`PAYMENT_NOT_FOUND`, `PAYMENT_REQUIRED`, `PAYMENT_EXPIRED`, `PAYMENT_ALREADY_PAID`, `PAYMENT_INVALID_STATE`, `PAYMENT_SUBMISSION_DUPLICATE`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_PROOF_INVALID`, `PAYMENT_METHOD_NOT_AVAILABLE`, `TOO_MANY_REQUESTS`, `FORBIDDEN`/`NOT_FOUND` for permissions.

## Jobs

`PaymentsScheduler` runs on startup and every 5 minutes: `expireUnpaid()` and `alertSla()`. Both are idempotent, use stored timestamps, row locks and a process-level overlap guard.

---

# Part 4 settlement API (2026-11-18)

All routes are under `/api/v1` and use the standard `{ success, data }` envelope. Mutations require
an `Origin` header. Money values are decimal strings in BDT (`"960.00"`), never floats. Seller/admin
roles are enforced server-side; a buyer cannot read another buyer's order or dispute.

## Seller wallet

### `GET /seller/wallet`

```json
{
  "balances": {
    "available": "960.00",
    "pending": "0.00",
    "onHold": "0.00",
    "withdrawalReserved": "600.00",
    "totalWithdrawn": "600.00",
    "codDues": "100.00",
    "net": "960.00"
  },
  "pendingOrders": [
    { "shopOrderId": "so_1", "amount": "960.00", "releaseAt": "2026-11-20T10:00:00.000Z" }
  ],
  "payoutProfile": {
    "method": "BKASH",
    "accountMasked": "017*****78",
    "accountName": "Rahim Uddin",
    "updatedAt": "2026-11-18T10:00:00.000Z",
    "cooldownUntil": "2026-11-19T10:00:00.000Z"
  },
  "settings": {
    "minimumAmount": 500,
    "methods": ["BKASH", "NAGAD", "BANK"],
    "maxPendingRequests": 3,
    "codDuesLimit": 1000,
    "processingText": "Payouts are processed within 2 business days."
  }
}
```

`payoutProfile` is `null` until the seller saves one. `pendingOrders` is the per-order countdown feed;
`releaseAt` is snapshotted and never changes when the setting changes later.

### `GET /seller/wallet/transactions?page=1&limit=20&type=SELLER_RELEASE`

Paginated raw ledger rows (`data`, `meta`). Use `account` + `type` for the seller-facing labels;
legacy rows have `account: null`.

### `GET /seller/wallet/payout-profile`

`200` with `{ method, accountMasked, accountName, updatedAt }` or `null`.

### `PUT /seller/wallet/payout-profile`

```json
{ "method": "BKASH", "accountNumber": "01712345678", "accountName": "Rahim Uddin" }
```

`200` on success. bKash/Nagad require a valid BD mobile; bank requires 6�20 digits. The account is
encrypted at rest and only the mask is returned. A change inside `payout.cooldownHours` returns
`422 PAYOUT_PROFILE_COOLDOWN` and sends a notification. A method outside `payout.methods` returns
`422 PAYOUT_METHOD_NOT_ALLOWED`.

### `GET /seller/wallet/withdrawals?status=PENDING&page=1&limit=20`

Paginated seller requests, newest first. Row shape:

```json
{
  "id": "payout_1",
  "payoutNumber": "PO-000123",
  "amount": "600.00",
  "status": "PENDING",
  "method": "BKASH",
  "accountMasked": "017*****78",
  "reference": null,
  "rejectionReason": null,
  "balanceSnapshot": "960.00",
  "createdAt": "2026-11-18T10:00:00.000Z",
  "processedAt": null
}
```

### `POST /seller/wallet/withdrawals`

Header `Idempotency-Key` is strongly recommended (same key returns the existing request).

```json
{ "amount": 600, "method": "BKASH" }
```

`201` with the withdrawal row. Errors:
`422 PAYOUT_BELOW_MINIMUM`, `422 PAYOUT_EXCEEDS_AVAILABLE`, `422 PAYOUT_TOO_MANY_PENDING`,
`422 PAYOUT_COD_DUES_BLOCKED`, `422 PAYOUT_PROFILE_REQUIRED`, `422 PAYOUT_METHOD_NOT_ALLOWED`.
The amount is reserved immediately (`SELLER_AVAILABLE -> SELLER_WITHDRAWAL_RESERVED`), so parallel
requests can never overdraw.

## Buyer: delivery confirmation and disputes

### `POST /orders/shop-orders/:id/confirm-receipt`

Buyer-only, delivered order, no open dispute, `return.earlyRelease=true`. Sets `releaseAt = now` and
runs the release job immediately. `200 { "released": true }`; `400` if not delivered / early release
disabled; `409 COMPLAINT_NOT_ALLOWED` if a dispute is open.

### `POST /complaints` (existing endpoint, Part 4 rules)

```json
{
  "shopOrderId": "so_1",
  "type": "DAMAGED_PLANT",
  "description": "The leaves were broken on arrival",
  "attachments": ["/uploads/disputes/evidence.webp"]
}
```

Part 4 adds: buyer-only delivered order, inside `return.windowHours`, one open dispute per ShopOrder
(`409 COMPLAINT_NOT_ALLOWED`), photo required when `return.photoRequired`, at most
`return.maxEvidencePhotos` photos, and `sellerResponseDueAt = now + return.disputeSellerHours`.
Creating a dispute moves the seller funds to `SELLER_ON_HOLD` and notifies the seller/admins.
Types map to the existing enum (`DAMAGED_PLANT`, `WRONG_ITEM`, `NOT_AS_DESCRIBED`, `NOT_DELIVERED`,
`LATE_DELIVERY`, `OTHER`). Attachment uploads use `POST /uploads/images`.

### `POST /complaints/:id/comments` and seller comments

Unchanged. A seller comment sets `SELLER_RESPONDED` and `sellerRespondedAt`; after
`sellerResponseDueAt` or after a decision it returns `400 COMPLAINT_NOT_ALLOWED`.

## Admin: disputes

### `GET /admin/complaints?status=OPEN`

Existing queue; each complaint now includes `decision`, `sellerResponseDueAt`, `sellerRespondedAt`,
`fundsHeldAt`, `decidedAt`, `refundAmount`, attachments and comments.

### `POST /admin/complaints/:id/decision`

```json
{
  "decision": "REFUND_PARTIAL",
  "reason": "Two of five plants were damaged",
  "refundAmount": 300,
  "refundTrxId": "BKASHREF1234"
}
```

- `REJECTED` / `RETURN_TO_SELLER`: releases `SELLER_ON_HOLD` back to `SELLER_PENDING` (future
  release) or `SELLER_AVAILABLE` (window already passed). Complaints become `REJECTED` / `CLOSED`.
- `REFUND_FULL`: refund amount = ShopOrder total; `REFUND_FULL` decision.
- `REFUND_PARTIAL`: `refundAmount` is required and must be = ShopOrder total.
- With `refundTrxId`: creates a `PROCESSED` refund, posts `REFUND_PAYABLE -> REFUNDS_PAID`, returns
  `200` with the complaint. Without it: creates a `REQUESTED` refund and keeps `REFUND_PAYABLE`; the
  existing `POST /admin/refunds/:id/process` completes it later.
- Idempotent: repeating the same decision returns the stored result; a different decision on a
  decided dispute is rejected (`409 COMPLAINT_NOT_ALLOWED`). Every decision is audited with the
  reason. A COD order has no held platform funds; the legacy refund/commission reversal path applies.

Error codes: `400 VALIDATION_FAILED`, `404 NOT_FOUND`, `409 COMPLAINT_NOT_ALLOWED`.

## Admin: withdrawals and payouts

### `GET /admin/withdrawals?status=PENDING`

Payout queue: the withdrawal row plus `seller { id, businessName, name }` and
`balanceSnapshot`. Only seller-initiated rows (`requestedById != null`) are returned.

### `POST /admin/withdrawals/:id/pay`

```json
{ "reference": "BKASH-889912" }
```

`200`; `PENDING/PROCESSING -> PAID`, posts reserved `-> SELLER_PAID_OUT`, notifies the seller.
Idempotent for an already-paid row. `409 WITHDRAWAL_INVALID_STATUS` for rejected rows.

### `POST /admin/withdrawals/:id/reject`

```json
{ "reason": "Account number does not match the holder name" }
```

`200`; `PENDING/PROCESSING -> REJECTED`, returns the reserve to `SELLER_AVAILABLE`, notifies the
seller. Replays return the stored row.

### COD dues

`POST /admin/sellers/:id/dues-payments` now records `COD_DUES` in the account ledger. Body:
`{ "amount": 100, "method": "BKASH", "reference": "TRX123", "note": "..." }`. `200 { balance }`.
Dues appear in the wallet (`balances.codDues`). Withdrawals are blocked while dues exceed
`wallet.codDuesLimit`; when `wallet.codCommissionDeduct=true`, dues are also deducted automatically
from `SELLER_AVAILABLE` as they accrue and on release.

## Admin: ledger and reconciliation

### `GET /admin/reconciliation?from=...&to=...`

Existing order/shop/refund checks plus the A5 settlement block:

```json
{
  "checked": 42,
  "violations": [],
  "settlement": {
    "receipts": "786.67",
    "buckets": "786.67",
    "difference": "0.00",
    "balanced": true,
    "codDues": "100.00"
  }
}
```

A breach adds `SETTLEMENT_CONSERVATION_BREACH` to `violations`; the admin UI should alert on any
violation. `GET /admin/sellers/:id/balance` returns pending/available plus the Part 4 buckets
(`onHold`, `withdrawalReserved`, `totalWithdrawn`, `codDues`).

## Jobs

`SettlementScheduler` runs on bootstrap and every 5 minutes: releases due `SELLER_PENDING` rows for
delivered advance orders with `releaseAt <= now`, no open dispute and `fundsReleasedAt = null`,
locking each ShopOrder row. Catch-up safe; idempotent; notifies the seller.

## UI brief (next session)

Build these screens against the contract above. Reuse existing design tokens/components; no new
token system.

1. **Seller Wallet** (`/seller/earnings` or a new `/seller/wallet`): four summary cards (Available,
   Pending with per-order countdown, On hold, Total withdrawn) + COD dues row; a plain-language
   window explanation; transactions table with account/type filter; loading/empty/error states.
2. **Withdrawal dialog**: amount (min from wallet settings), method select from `settings.methods`,
   destination mask, available/dues context, inline errors for min/exceeds/pending/dues; success
   toast and the request appears in the list.
3. **Payout profile**: method + number + holder name, masked display, cooldown notice, save +
   notification; never show the full number back.
4. **Buyer report-a-problem flow**: from a delivered order show `releaseAt` / "report until" and an
   "Everything is fine" early-release action; dispute form with type, description, photo upload;
   dispute timeline with status, seller response, decision and refund reference.
5. **Admin disputes queue**: open/under-review list, evidence viewer, seller-response deadline,
   decision dialog (reject/refund full/partial/return) with required reason and optional refund
   TrxID; refund amount validation against the order total.
6. **Admin payout queue**: pending requests with seller, amount, method + masked destination, balance
   snapshot, pay dialog (reference) and reject dialog (reason).
7. **Admin ledger/reconciliation**: settlement summary (receipts, buckets, difference, COD dues),
   violation list with alert; per-seller balance/ledger drill-down.

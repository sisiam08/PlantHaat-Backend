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

`201` on first submit, `200`-shape idempotent response for the same pending TrxID, `409 PAYMENT_SUBMISSION_DUPLICATE` for a rejected/other-intent TrxID, `400` for invalid TrxID/mobile or closed window, `429` after too many submissions.

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

`PAYMENT_NOT_FOUND`, `PAYMENT_REQUIRED`, `PAYMENT_EXPIRED`, `PAYMENT_ALREADY_PAID`, `PAYMENT_INVALID_STATE`, `PAYMENT_SUBMISSION_DUPLICATE`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_METHOD_NOT_AVAILABLE`, `TOO_MANY_REQUESTS`, `FORBIDDEN`/`NOT_FOUND` for permissions.

## Jobs

`PaymentsScheduler` runs on startup and every 5 minutes: `expireUnpaid()` and `alertSla()`. Both are idempotent, use stored timestamps, row locks and a process-level overlap guard.

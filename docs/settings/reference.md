# Settings reference

> Last verified against code: 2026-11-18 (`feature/payments`). Every value is admin-managed; defaults are the fallback when no DB override exists.

| Setting | Old hard-coded behavior | File(s) | Old value | Where wired now |
|---|---|---|---|---|
| `payment.cod.enabled` | COD always available | `backend/src/modules/orders/orders.service.ts`, `frontend/src/features/checkout/components/checkout-client.tsx` | `true` | COD checkout is rejected when false; checkout disables COD |
| `payment.advance.enabled` | No advance flow | `backend/src/modules/settings/settings-registry.ts`, `orders.service.ts`, `frontend/src/features/checkout/components/checkout-client.tsx` | `false` | Part 3 is live: effective only when this is true **and** at least one provider is enabled with a valid BD number. Checkout shows Advance and redirects to `/checkout/payment/[orderId]` |
| `payment.bkash.*` / `payment.nagad.*` (enabled + number) | Provider defaults true | settings registry + admin UI + payment intent | `true` | Defaults false; enabling requires a valid BD number; numbers are snapshotted on the payment intent and masked in history/UI |
| `payment.expiryHours` / `payment.slaHours` / `payment.lateGraceHours` | No expiry/SLA logic | `payments.scheduler.ts`, payments service | 12 / 24 / 48 | UNPAID expiry, pending-verification SLA alert and late-payment grace |
| `payment.instructions` / `warningText` / `accountNote` / `verificationText` | Copy lived in UI | payments service + settings UI | mixed | Public copy snapshotted onto each new payment intent |
| `order.codMaxAmount` | No COD limit | `backend/src/modules/orders/orders.service.ts`, checkout UI | `0` (no limit) | Server compares the server-computed grand total (items + delivery); 0 = no limit |
| `support.whatsapp` | Footer/contact used only `NEXT_PUBLIC_SUPPORT_*` | `frontend/src/components/layout/site-footer.tsx`, `frontend/src/app/(public)/contact/page.tsx` | env values | Footer/contact read the setting first, env fallback |
| `support.phone` | Footer/contact used `NEXT_PUBLIC_SUPPORT_PHONE` | same as above | env value | Footer/contact read the setting first |
| `support.email` | Footer/contact used `NEXT_PUBLIC_SUPPORT_EMAIL` | same as above | env value | Footer/contact read the setting first |
| `return.windowHours` | Complaints read missing `complaint.windowHours`; UI said "48 hours" | `backend/src/modules/complaints/complaints.service.ts`, `frontend/src/features/catalog/components/trust-strip.tsx`, PDP | `48` | Complaint window, home trust strip and PDP wording all use the setting |
| `commission.default` | Last-resort commission was the setting default 10 | `backend/src/modules/commissions/commissions.service.ts` | `10` | Used only when no seller/category/global commission rule matches |
| `payout.holdHours` | Hard-coded 48h hold | `backend/src/modules/ledger/ledger.service.ts` | `48` | `LedgerEntry.availableAt` uses this setting (Part 4 will unify it with `return.windowHours`) |
| `settings` cache tag | No public-settings cache tag | `frontend/src/server/public-settings.ts`, `frontend/src/server/cache-tags.ts` | n/a | Admin PATCH `/admin/settings` invalidates `settings`; 60s TTL is the safety net |

Still not wired (Part 4): payout methods, wallet/COD dues and the single release/return window. Return early-release and photo-required keys exist in the registry but the buyer/seller UI does not enforce them yet.

## Guards

- Backend: `src/modules/settings/settings-wiring.spec.ts` fails if the removed `complaint.windowHours` key returns or COD/commission settings are bypassed.
- Frontend: `src/lib/business-constants.test.ts` fails if "48 hours", "48-hour" or "৪৮ ঘণ্টা" is hard-coded in messages or customer pages.

## Save batching and re-auth (2026-11-16)

- One Save is one PATCH with all changed keys, applied in one transaction and validated against the merged result.
- Re-auth token scope = the sorted set of sensitive keys in that save; it is short-lived, single-use and rejects any added key.
- History writes one row per changed key with a shared batchId; sensitive history values are masked.
- Validation failures return per-key details under error.details, rendered inline; the form keeps its state.

## Operational defaults restored (2026-11-16)

| Key | Default |
|---|---:|
| checkout.maxQtyPerItem | 20 |
| order.sellerConfirmTimeoutHours | 48 |
| review.windowDays | 14 |
| product.autoApprove | true |
| payout.holdHours | 48 |
| codRisk.watchAfter / blockAfter / windowDays / restrictCap | 2 / 4 / 90 / 2000 |
| stuck.confirmedHours / packedHours / shippedGraceDays / reminderHours / maxReminders | 48 / 48 / 2 / 24 / 3 |
| payment.instructions / warningText | public text snapshotted on the intent |

## Security & Sessions (auth) — 2026-11-17

Group `security` (admin → Settings → Security & Sessions; not public). Wired in
`backend/src/modules/auth/auth.service.ts`; read live with the 30 s settings cache and applied to
new sessions/tokens.

| Key | Default | Notes |
|---|---:|---|
| `security.access.ttlMinutes` | 15 | JWT `exp`; the `ph_at` cookie itself lives for the role's sliding lifetime |
| `security.refresh.customer.days` | 30 | customer sliding refresh lifetime |
| `security.refresh.customer.maxDays` | 90 | customer absolute cap |
| `security.refresh.seller.days` | 14 | seller sliding refresh lifetime |
| `security.refresh.seller.maxDays` | 60 | seller absolute cap |
| `security.refresh.admin.days` | 7 | admin sliding refresh lifetime |
| `security.refresh.admin.maxDays` | 30 | admin absolute cap |
| `security.refresh.graceSeconds` | 30 | accepted duplicate-refresh window for parallel requests/tabs |

Validation rejects an absolute cap shorter than the sliding lifetime, non-positive lifetimes and a
grace outside 0–300 s. Details and test steps: `auth/sessions.md`.

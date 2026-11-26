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

## Part 4 settlement, wallet and disputes � 2026-11-18

All keys below are in the registry, admin-editable, `wired: true`, and covered by
`src/modules/settings/settings-wiring.spec.ts`. Money values are read at the moment of the
delivery/dispute/withdrawal and snapshotted onto the affected rows; changing them never
retro-applies.

| Key | Default | Sensitive | Used by |
|---|---:|:---:|---|
| `return.windowHours` | 48 | no | Single money-hold source: buyer dispute window **and** seller release time. Snapshotted to `ShopOrder.releaseAt` at delivery. |
| `return.earlyRelease` | true | no | `POST /orders/shop-orders/:id/confirm-receipt` (buyer early release). |
| `return.photoRequired` | true | no | Delivered-order disputes require at least one photo. |
| `return.maxEvidencePhotos` | 5 | no | Max attachments per dispute (1�20). |
| `return.disputeSellerHours` | 48 | no | Seller response deadline (`Complaint.sellerResponseDueAt`), snapshotted per dispute. |
| `wallet.codDuesLimit` | 1000 | yes | Withdrawal is blocked while `codDues >` limit. |
| `wallet.codCommissionDeduct` | true | yes | Auto-deduct COD commission from `SELLER_AVAILABLE`. |
| `wallet.deliveryChargeRecipient` | seller | yes | Documented owner decision; the current split keeps the delivery charge in `sellerNetAmount`. |
| `payout.minimumAmount` | 500 | yes | Minimum seller withdrawal. |
| `payout.methods` | `["BKASH","NAGAD","BANK"]` | yes | Allowed withdrawal methods; `ROCKET` is not exposed in Part 4. |
| `payout.cooldownHours` | 24 | yes | Payout-profile change cooldown + notification. |
| `payout.maxPendingRequests` | 3 | yes | Max simultaneous `PENDING`/`PROCESSING` seller withdrawals. |
| `payout.processingText` | public text | no | Copy shown in the seller wallet. |
| `payout.holdHours` | 48 | no | **Deprecated alias** for `return.windowHours` (read and write delegate). Kept so old admin clients do not break. |

Guards: `src/modules/settings/settings-wiring.spec.ts` fails if the ledger stops reading
`return.windowHours`, if the hold becomes a hard-coded constant, or if wallet/dispute limits stop
reading their keys. The dev settings values were not changed by this work.

## Part 4 UI wiring (2026-11-19)

The seller wallet reads `return.windowHours` (via the public setting on the server page), the payout
profile/withdrawal limits read `payout.minimumAmount`, `payout.methods`, `payout.cooldownHours`,
`payout.maxPendingRequests`, `payout.processingText`, `wallet.codDuesLimit` and
`wallet.codCommissionDeduct`; the dispute panel reads `return.earlyRelease`; complaint creation uses
`return.photoRequired`, `return.maxEvidencePhotos` and `return.disputeSellerHours`; admin queues read
the same contracts. Settings UI needs no custom fields: the registry drives the new keys with their
bilingual help text and existing re-auth rules.

## Home hero and Highlights keys (2026-11-19)

Group `home`, registry-driven, bilingual labels/help and `wired: true` (public where the storefront reads them).

| Key | Type | Default | Public | Used by |
|---|---|---:|---:|---|
| `home.hero.headline` | json {bn,en} | "????? ?? ????? ??? ?????" / "Fill your home with green" | yes | Home hero H1; admin Settings ? Home |
| `home.hero.subheadline` | json {bn,en} | current one-line promise | yes | Home hero subheadline |
| `home.hero.chips` | json[] | old chip defaults (historical) | no (unwired) | Deprecated/removed from the marketplace hero; kept for settings history only. The Settings UI no longer renders it. |
| `home.hero.image` | json | empty | yes | Optional static hero image (desktop/mobile, alt, focal); when set it replaces the real-plant scene on the right, no WebGL. Uploaded assets attach in the settings transaction. |
| `home.highlights.enabled` | boolean | true | yes | Whole Highlights section on/off; off = no section, heading, gap or skeleton |
| `home.highlights.autoplay` | boolean | false | yes | Autoplay (tablet/desktop only; paused on hover/focus/touch; reduced motion wins) |
| `home.highlights.intervalSeconds` | number | 6 | yes | Autoplay interval, 4�12 s |
| `home.highlights.maxSlides` | number | 6 | no | Maximum active slides sent to the home page, 1�10 |
| `home.highlights.title` | json {bn,en} | ??????? / Highlights | yes | Section heading; empty in both locales hides it |

Validation: text lengths (60/140/40), chip count and safe links, hero image URL scheme and focal 0�100, interval 4�12, maxSlides 1�10. Dev settings were not changed except these registry defaults.

## 2026-11-21 admin consolidation notes

- `commission.default` is the **fallback** only. The effective default is the newest active GLOBAL
  `CommissionRule`; edit it on `/admin/commission-rules`. Settings → Wallet shows the effective value
  (new `GET /admin/commission-rules/effective`) and the fallback read-only.
- `payout.holdHours` is a deprecated alias of `return.windowHours` (single money hold). It is hidden
  from the Settings UI (`wired:false`) and kept for old clients/history.
- `wallet.deliveryChargeRecipient` is retired (`wired:false`); the delivery charge stays with the
  seller. Kept for history.
- Highlights on/off, autoplay and interval are edited only on `/admin/highlights`; Settings → Home
  shows a read-only summary. `home.highlights.maxSlides` and `home.highlights.title` remain in
  Settings because they have no duplicate editor.
- `home.hero.chips` remains retired (`wired:false`, not public).

## 2026-11-21 evidence and delivery proof

- `order.deliveryProofRequired` (boolean, default **false**, group orders, wired): when ON, a seller/admin must attach 1-3 delivery photos before marking a ShopOrder DELIVERED. Enforced in the transition transaction; changing it applies to new transitions only.
- Seller dispute-response photos reuse `return.maxEvidencePhotos` (default 5); the response is accepted only before `sellerResponseDueAt` and before a decision, and each URL must belong to the seller's own `UploadedAsset` (`ownerId`).
- New tables: `ShopOrderDeliveryProof` and `ComplaintCommentAttachment` are additive and registered in `UPLOAD_SCALAR_REFERENCES`; every URL is ATTACHED in the same transaction as the status/comment write.


### 2026-11-25 Rocket and Upay (manual advance only)

- `payment.rocket.enabled/number` and `payment.upay.enabled/number` were added; providers are included in the frozen intent snapshot and submission DTO. There is still no gateway SDK or webhook: PAID is reached only by admin verification of sender number + TrxID + amount. New providers default off with empty numbers; the enabled flag requires a valid BD receiving number. bKash/Nagad behavior is unchanged.

## Courier delivery quotes (2026-11-26)

Group `delivery`, registry-driven, `wired: true`. The live switch is **off by default** because Steadfast's
public quote endpoint is undocumented and permission is still pending.

| Key | Default | Notes |
|---|---:|---|
| `delivery.quote.live.enabled` | `false` | Calls `steadfast.com.bd/pricing/quote` (server-side only, 1 req/s, 3 s timeout, 5-failure/5-minute circuit breaker). Keep off until the owner confirms permission. |
| `delivery.fallback.insideDhaka` | `0` | Used only when no override, fresh/stale cache or live quote exists. `0` means **unset** (quote unavailable, never a fake free charge). Applied when both Steadfast ids are 1 (Dhaka City ? Dhaka City). |
| `delivery.fallback.outsideDhaka` | `0` | Same rule for every other pair. |
| `delivery.quote.cacheFreshHours` | `24` | Fresh cache is reused without a network call. |
| `delivery.quote.staleDays` | `30` | Stale cache is usable and always preferred over the fallback. |

Limitation: `SystemSetting` stores a JSON number, so `null`/NULL cannot represent "unset".
`0` is the sentinel for an unset fallback (a real zero-taka fallback is not supported); checkout is
blocked with `NO_RATE` instead of charging zero. Both fallbacks must be non-negative integers.

Source order: admin override ? fresh cache ? live (only when the switch is on) ? stale cache ? admin fallback.
Never call Steadfast from the browser. The seller-entered Inside/Outside charge is kept for history but is no
longer used to price a quote; the courier rate plus the per-product seller extra is the customer price.

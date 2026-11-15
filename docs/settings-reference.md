# Settings reference

| Setting | Old hard-coded behavior | File(s) | Old value | Where wired now |
|---|---|---|---|---|
| `payment.cod.enabled` | COD always available | `backend/src/modules/orders/orders.service.ts`, `frontend/src/features/checkout/components/checkout-client.tsx` | `true` | COD checkout is rejected when false; checkout disables COD |
| `order.codMaxAmount` | No COD limit | `backend/src/modules/orders/orders.service.ts`, checkout UI | `0` (no limit) | Server compares the server-computed grand total (items + delivery); 0 = no limit |
| `payment.advance.enabled` | No advance flow | `backend/src/modules/settings/settings-registry.ts` | `false` | Stored false; effective advance stays false until Part 3 |
| provider enabled/number | Provider defaults true | settings registry + admin UI | `true` | Defaults false; enabling requires a valid BD number |
| `support.whatsapp` | Footer/contact used only `NEXT_PUBLIC_SUPPORT_*` | `frontend/src/components/layout/site-footer.tsx`, `frontend/src/app/(public)/contact/page.tsx` | env values | Footer/contact read the setting first, env fallback |
| `support.phone` | Footer/contact used `NEXT_PUBLIC_SUPPORT_PHONE` | same as above | env value | Footer/contact read the setting first |
| `support.email` | Footer/contact used `NEXT_PUBLIC_SUPPORT_EMAIL` | same as above | env value | Footer/contact read the setting first |
| `return.windowHours` | Complaints read missing `complaint.windowHours`; UI said “48 hours” | `backend/src/modules/complaints/complaints.service.ts`, `frontend/src/features/catalog/components/trust-strip.tsx`, PDP | `48` | Complaint window, home trust strip and PDP wording all use the setting |
| `commission.default` | Last-resort commission was the setting default 10 | `backend/src/modules/commissions/commissions.service.ts` | `10` | Used only when no seller/category/global commission rule matches |
| `settings` cache tag | No public-settings cache tag | `frontend/src/server/public-settings.ts`, `frontend/src/server/cache-tags.ts` | n/a | Admin PATCH `/admin/settings` invalidates `settings`; 60s TTL is the safety net |

Still hard-coded / not wired: payout hold hours, payout methods, wallet COD dues, payment expiry/SLA/late-grace behaviour, return early-release/photo flags.

## Guards

- Backend: `src/modules/settings/settings-wiring.spec.ts` fails if the removed `complaint.windowHours` key returns or COD/commission settings are bypassed.
- Frontend: `src/lib/business-constants.test.ts` fails if “48 hours”, “48-hour” or “৪৮ ঘণ্টা” is hard-coded in messages or customer pages.

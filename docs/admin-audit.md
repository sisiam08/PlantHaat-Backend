# Admin panel audit (2026-11-20)

Scope: every admin route in `frontend/src/app/(admin)/admin`, its nav entry, client component, API
calls and the models/settings behind them. Checked by reading the route/nav/API source, opening the
pages in the production test stack at 1280 and 360, and the existing admin/payments/Part 4 suites.
Permissions are unchanged: `(admin)/admin/layout.tsx` still calls `requireSession(["ADMIN"])` and every
`/admin/*` API is `@Roles(Role.ADMIN)`.

## Inventory

| Page | What it edits/reads | Endpoint(s) | Model / Settings | Canonical owner |
|---|---|---|---|---|
| `/admin` | overview counters and recent activity | `admin/dashboard`, analytics | orders, payments, users | overview |
| `/admin/sellers`, `/admin/sellers/[id]` | seller approval, limits, shop links | `admin/sellers*` | `SellerProfile`, `User` | sellers list |
| `/admin/users`, `/admin/users/[id]` | customer/seller accounts | `admin/users*` | `User` | users list |
| `/admin/shops` | shop list/status | `admin/shops*` | `Shop` | shops list |
| `/admin/suspended-sellers` | suspended seller queue | `admin/sellers?status=SUSPENDED` | `SellerProfile.status` | sellers list (filtered view) |
| `/admin/products` | moderation/approval | `admin/products*` | `Product` | products |
| `/admin/categories` | category CRUD | `admin/categories*` | `Category` | categories (home bento reads it) |
| `/admin/orders`, `/admin/orders/[id]` | order status/refunds/support | `admin/orders*` | `Order`, `ShopOrder` | orders |
| `/admin/stuck-orders` | stuck-order queue | `admin/orders/stuck` | `Order` + `stuck.*` settings thresholds | stuck-orders (settings has the thresholds) |
| `/admin/cod-risk` | COD risk profiles/actions | `admin/cod-risk*` | `CodRiskProfile` + `codRisk.*` settings | cod-risk (settings read-only thresholds) |
| `/admin/refunds` | legacy payment refund queue | `admin/refunds*` | `Refund`, `Payment` | refunds queue (separate from advance) |
| `/admin/payouts` | manual payout history + status | `admin/payouts*` | `Payout` | payouts (manual), withdrawals (seller requests) |
| `/admin/withdrawals` | seller withdrawal queue | `admin/withdrawals*` | `Payout` (`requestedById`) | withdrawals |
| `/admin/commission-rules` | rules + effective default | `admin/commission-rules*`, `.../effective` | `CommissionRule`, `commission.default` | **commission rules** |
| `/admin/payments` | payment rows | `admin/payments*` | `Payment` | payments (legacy/COD/online) |
| `/admin/advance-payments` | advance verification queue | `payments/admin*` | `PaymentIntent`, `PaymentSubmission` | advance-payments |
| `/admin/advance-refunds` | advance refund obligations | `payments/admin/refunds` | `PaymentIntent`, ledger | advance-refunds |
| `/admin/reconciliation` | ledger reconciliation | `admin/reconciliation*` | `LedgerEntry` | reconciliation |
| `/admin/complaints`, `/admin/complaints/[id]` | complaints and disputes | `admin/complaints*` | `Complaint` (`decision`, hold fields) | complaints (one model for disputes) |
| `/admin/content-reports` | question/answer/reply reports | `admin/content-reports*` | `ContentReport` | content-reports |
| `/admin/review-reports` | review reports | `admin/review-reports*` | `ReviewReport` | review-reports |
| `/admin/highlights` | slides, section on/off, autoplay, interval | `admin/banners?placement=HOME_HIGHLIGHTS` | `Banner`, `home.highlights.*` | **Highlights** |
| `/admin/banners` | non-managed placements | `admin/banners*` | `Banner` (other placements) | Banners, excluding hero/highlights |
| `/admin/homepage-sections` | read-only section list | `admin/homepage-sections` | `HomepageSection` (code-defined) | code |
| `/admin/announcements` | site announcements | `admin/announcements*` | `Announcement` | announcements |
| `/admin/audit-logs` | audit log view | `admin/audit-logs` | `AuditLog` | audit logs |
| `/admin/settings` | registry values, history, re-auth | `admin/settings*` | all settings | settings registry |

## Duplicates found

| # | Finding | Locations | Evidence | Decision | Status |
|---|---|---|---|---|---|
| 1 | Default commission edited twice | Settings → Wallet (`commission.default`), Commission rules GLOBAL rule | Calculation resolves SELLER → CATEGORY → parent → GLOBAL → `commission.default`; both editors change the default | Canonical: **Commission rules**. Settings shows a read-only value + link; `/effective` endpoint returns the exact resolved value | Implemented |
| 2 | Highlights on/off + autoplay + interval edited twice | Settings → Home highlights fields, `/admin/highlights` | Both write `home.highlights.*`; the Highlights page owns slides | Canonical: **Highlights**. Settings shows a read-only summary + link; `maxSlides`/title stay in Settings (not duplicated) | Implemented |
| 3 | Banners page could create/edit hero/highlights placements | `/admin/banners` free-text placement | The page already says hero/highlights live elsewhere, yet `HOME_HERO`/`HOME_HIGHLIGHTS` were selectable; hero banners are dead (hero uses settings) | Banners hides managed rows and disables saving those placements with links to Settings → Home / Highlights | Implemented (UI guard; API unchanged) |
| 4 | Payout hold vs return window | Settings → Payouts `payout.holdHours`, Settings → Orders `return.windowHours` | `payout.holdHours` is a deprecated alias of the single hold; both were editable | Canonical: **Orders → return window**. `payout.holdHours` retired/hidden; alias kept so old clients work | Implemented |
| 5 | Delivery-charge recipient setting unused | Settings → Wallet `wallet.deliveryChargeRecipient` | No code reads it; Part 4 fixes the charge to the seller | Retire: `wired:false`, hidden from the Settings UI, kept for history | Implemented |
| 6 | Two payout screens | `/admin/payouts`, `/admin/withdrawals` | Both read `Payout`; payouts creates manual rows, withdrawals handles seller-requested rows | Keep both as distinct queues; cross-link in docs/nav; no data/behavior change (money rule) | Documented |
| 7 | Two refund queues | `/admin/refunds`, `/admin/advance-refunds` | Different models: payment refunds vs advance refund obligations/ledger | Keep both; advance queue is the Part 3 source, refunds the legacy payment queue | Documented |
| 8 | Payments vs advance payments | `/admin/payments`, `/admin/advance-payments` | `Payment` vs `PaymentIntent`/`PaymentSubmission` | Keep both; different states and actions | Documented |
| 9 | Complaints vs disputes | `/admin/complaints`, detail | One `Complaint` model with `decision` + hold fields; no separate dispute page | Keep one page; disputes are the same queue | No change |
| 10 | Review reports vs content reports | `/admin/review-reports`, `/admin/content-reports` | Different target tables (`ReviewReport` vs `ContentReport`) | Keep both | No change |
| 11 | Seller list vs suspended sellers | `/admin/sellers`, `/admin/suspended-sellers` | Suspended is a filtered seller view with its own actions | Keep; consider merging as a status filter in a later UI pass | Documented |
| 12 | Hero chips key | `home.hero.chips` | Deprecated after the hero rewrite; `wired:false`, not shown | Keep for history (already retired) | Done earlier |
| 13 | Support contacts | Settings; footer/contact pages | Footer/contact read `support.*` public settings | Settings is the only editor | No change |
| 14 | Categories vs home tiles | `/admin/categories`; home `CategoryBento` | Bento reads categories; no tile editor | Categories canonical | No change |
| 15 | `homepage-sections` | `/admin/homepage-sections` | Code-defined; the page is a read-only reference | Keep read-only notice | No change |

## What was left, and why

- **Money paths** (payouts/withdrawals, refunds/advance-refunds, payments/advance-payments) were not
  merged. They use different models/states and the Part 3/4 tests assert their behavior; changing the
  screens could hide obligations. They are documented with one owner each.
- **Commission calculation** was not moved. The rules page already owns scopes and the resolver;
  only the duplicate default editor was read-only-ized. A test asserts the displayed effective default
  equals `resolveRatePercent` for the no-rule case.
- **Banners API** still accepts any placement (backward compatibility for existing clients/scripts);
  only the UI blocks managed placements. Old hero rows remain in the DB and are hidden, not deleted.
- **Unwired settings** are hidden from the editor (`wired:false`) rather than deleted, so history and
  old clients keep working.

## Tests

- Backend: `origin.guard.spec`, `auth.controller.spec`, `commissions.service.spec` (effective default
  = calculation), `settings-registry.spec`, `settings-wiring.spec`.
- Frontend: `tests/admin-route-manifest.test.ts` (every nav href resolves to a page, no duplicate
  hrefs/labels), `tests/auth-cookies.test.ts`, `session-*` and `highlights-*` e2e.
- Admin e2e after consolidation: `/admin/commission-rules` edit → `/admin/settings` read-only value
  updates; `/admin/highlights` autoplay change reflected in the Settings summary; `/admin/banners`
  hides highlights and blocks the placement. Axe on `/admin/settings`, `/admin/commission-rules`,
  `/admin/highlights`; checked at 1280 and 360 (no horizontal overflow).
- Existing admin/settings/payments/Part 4 suites are run serially against the isolated stack.

## Seller-panel overlaps (listed, not restyled)

- `/seller/earnings` (wallet, ledger, withdrawal form) and `/seller/payout-accounts` (destination) are separate screens for the same money flow; the destination change cooldown is enforced server-side. Keep both but cross-link them; no data change was made.
- `/seller/orders`, `/seller/cancellation-requests` and `/seller/complaints` show three views of the same `ShopOrder` lifecycle with different filters. They are role-specific queues, not duplicate editors.
- `/seller/products` + `/seller/products/new` + `/seller/products/[id]` are one CRUD flow; editing and creating share the same form component. No duplication found.
- `/seller/shop` and `/seller/delivery-zones` are separate models (shop profile vs delivery zones), both needed.
- Admin/seller overlap: order status actions exist in admin orders and seller orders; each is permission-scoped. Complaint decisions are admin-only, seller replies only. Payouts are admin-only; sellers see their own ledger.
- Safe future consolidation: move the withdrawal form into a dedicated seller "Withdrawals" tab next to payout accounts, and add a shared seller money summary header. Not implemented in this pass to avoid moving money UI without a design review.

# Seller panel audit (2026-11-21)

Scope: every seller route in `frontend/src/app/(seller)/seller`, the standalone `/seller/apply`,
the seller storefront read view, their nav entries and the client components behind them. Checked in
production Chrome at 1280x900 and 360x800, bn and en, with `seller1@planthaat.test` (approved), plus
DOM checks for h1 count, horizontal overflow, raw enums, unnamed buttons, and axe. No business,
money or permission rule was changed.

## Inventory

| Page | Purpose / canonical owner | State |
|---|---|---|
| `/seller/dashboard` | overview, application status, quick links | shared shell/header |
| `/seller/products` | product list; owner of product status/filter/paging | shared shell/header; EmptyState/QueryError/AlertDialog |
| `/seller/products/new` | create product (same form as edit) | shared shell/header |
| `/seller/products/[id]` | edit product, variants, images, stock | shared shell/header |
| `/seller/orders` | order queue; owner of seller order transitions | shared shell/header; EmptyState/QueryError |
| `/seller/orders/[id]` | order detail, delivery/proof actions | shared PageHeader; canonical detail |
| `/seller/earnings` | seller wallet/ledger/withdrawals; canonical withdrawal UI | shared shell/header; payout-profile editor removed |
| `/seller/payout-accounts` | canonical payout destination editor | shared shell/header |
| `/seller/complaints` | complaint queue (responses) | shared shell/header; EmptyState/QueryError |
| `/seller/complaints/[id]` | complaint conversation/response | shared PageHeader; canonical detail |
| `/seller/reviews` | reply/report reviews | shared shell/header; EmptyState/QueryError |
| `/seller/questions` | answer customer questions | shared shell/header; EmptyState/QueryError |
| `/seller/shop` | post-approval shop profile editor | shared shell/header; no duplicate page title |
| `/seller/delivery-zones` | delivery zones and charges | shared shell/header; EmptyState/QueryError/AlertDialog |
| `/seller/analytics` | analytics dashboard | shared shell/header |
| `/seller/cancellation-requests` | customer cancellation queue | shared shell/header; EmptyState/QueryError |
| `/seller/apply` | customer/seller application wizard (outside seller shell) | shared PageContainer/PageHeader + back-to-home |
| `/shops/[slug]` | public storefront read view | customer shell, not a seller editor |

Screenshots were reviewed as four contact sheets (bn/en x 1280/360), covering all 17 routes. No page
had horizontal overflow at 360; all seller-shell pages now have exactly one `h1`, owned by
`PageHeader` (the shell breadcrumb is no longer a heading).

## Findings, decisions and status

| # | Finding | Locations / evidence | Decision | Status |
|---|---|---|---|---|
| 1 | Every seller page hand-rolled `<main>` and `<h1>` with three different widths and 20/24px titles. | All 15 seller-shell pages; contact sheets showed inconsistent title sizes/containers. | Use `PageContainer` (reading/form/narrow) + `PageHeader`; shell breadcrumb changed from `h1` to a span. | Fixed |
| 2 | Destructive actions used `window.confirm` (products) or no confirmation (zones, payout accounts). | `products-list.tsx`, `delivery-zones-client.tsx`, `payout-accounts-client.tsx`; native confirm was not styled, zone/account delete was immediate. | Shared AlertDialog with explicit title/body, Cancel and destructive action; no money rules touched. | Fixed |
| 3 | Lists used plain “could not load”/“empty” text instead of shared feedback. | Products, orders, complaints, reviews, questions, cancellations, delivery zones; screenshots showed bare text. | `QueryError` with retry for failures, `EmptyState` for empty; loading skeletons kept. | Fixed |
| 4 | Payout destination editable in two places. | `/seller/earnings` had a third “Payout profile” tab while `/seller/payout-accounts` is the canonical editor; both write the same payout profile. | Removed the earnings tab/editor; earnings now links to the canonical payout-accounts page with a summary. | Fixed (no money change) |
| 5 | Dead duplicate earnings component. | `src/features/seller/components/earnings-client.tsx` exported `EarningsClient` with no importer; the page imports `WalletClient`. | Deleted the unused file. | Fixed |
| 6 | Approved sellers saw “Apply” in seller nav and could open `/seller/apply` again. | `DashboardShell` nav; approved seller screenshot showed Apply under Shop. | Hide Apply for `sellerStatus === APPROVED`; direct URL still shows the approved notice + dashboard link. | Fixed |
| 7 | Application page had no way back and no site header. | `/seller/apply` standalone route; screenshot showed only content. | Added a `PageHeader` back link to home; route stays outside the seller shell so customers can apply. | Fixed |
| 8 | Shop page title repeated in `PageHeader` and card title. | `/seller/shop` screenshot showed “Shop” twice. | Card title is now “Shop details”; page title remains the canonical one. | Fixed |
| 9 | Wallet page h1 said “Wallet” while metadata said “Earnings”. | `/seller/earnings`; nav label is Wallet. | Metadata now uses the same `part4.wallet.title`; route keeps `/seller/earnings` for compatibility. | Fixed |
| 10 | Detail pages used 20px ad-hoc headings and no shared back action. | `/seller/orders/[id]`, `/seller/complaints/[id]` screenshots. | Both now use `PageHeader` with status/actions and back links. | Fixed |
| 11 | Shop settings vs onboarding wizard shop fields. | `/seller/apply` step 3 and `/seller/shop` both show shop name/address/logo/banner. | Keep: onboarding is pre-approval; `/seller/shop` is the post-approval canonical editor. Approved sellers cannot edit via the wizard. | Documented, no merge |
| 12 | Earnings/withdrawals vs payout accounts. | `/seller/earnings` (withdraw + ledger) and `/seller/payout-accounts` (destination) use the same money flow. | Keep both distinct money screens and cross-link; withdrawal logic was not moved. | Documented, no merge |
| 13 | Orders, cancellation requests and complaints overlap. | Three queues over `ShopOrder` lifecycle with different actions/filters. | Keep; each is a different queue/permission scope, not a duplicate editor. | Documented |
| 14 | Product list/new/edit vs variants editor. | One `ProductForm`/`ProductEditor` and one list; variants live in the form. | Keep; no duplicate editor found. | No change |
| 15 | Seller notifications / messages / support pages. | No dedicated seller page; shared bell and footer/contact links. | Keep; messaging is not implemented and must not be invented. | No change |
| 16 | Long route titles truncate in the 360 shell header. | `Delivery zones`, `Payout accounts`, `Cancellation requests` shell breadcrumbs. | Accepted: the full `PageHeader` h1 is directly below; no overflow at 360. | Documented |

## Duplicate/overlap table (summary)

| Value/list | Appears in | Canonical decision |
|---|---|---|
| Payout destination | Earnings profile tab, Payout accounts page | **Payout accounts**; earnings links to it (fixed) |
| Wallet/earnings view | Unused `EarningsClient`, live `WalletClient` | **WalletClient**; dead file deleted (fixed) |
| Shop profile | Apply wizard step 3, Shop page | Wizard only before approval; **Shop page** after approval (documented) |
| Withdrawal | Earnings (request + history), payout accounts (destination) | Keep separate; cross-link (documented) |
| Seller order lifecycle | Orders, cancellations, complaints | Keep three queues; different actions (documented) |
| Product editor | Products list/new/edit | One form; no duplicate (verified) |
| Storefront | Shop page (edit), `/shops/[slug]` (read) | Edit vs public read; different surfaces (documented) |
| Seller application | `/seller/apply` and nav Apply | Nav hidden for approved; page remains for DRAFT/REJECTED/history (fixed) |

No backend endpoint or money rule was changed. Existing payout/withdrawal endpoints remain for
compatibility; only the duplicated seller-side editor was removed.

## Verification plan / status

- Production build, serial: seller route sweep + axe at bn/en and 1280/360, design-conformance,
  overflow, typography, scroll-restore, access-control, typecheck, full lint. Results are recorded in
  `progress.md`.
- No page currently has a seller-facing notifications page, so the shared bell was smoke-checked but
  not added to the seller route list.

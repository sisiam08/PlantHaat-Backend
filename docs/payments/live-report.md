# Advance payment journey - live verification (2026-11-18)

Environment: isolated stack only - API `:5001` against `planthaat_test`, frontend `:3002`, seeded fake admin/buyers/sellers/shops/products. Dev `:5000` / `neondb` was **not** used for writes. The 12 scenarios ran in a visible headed Chromium window, serial, from the real UI. Screenshots were temporary agent evidence and are not committed; the written findings are retained below.

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | COD order end to end (comparison) | **PASS** | `payments-advance.spec` test 1 |
| 2 | Buyer checkout with Advance + bKash, payment page sections, Copy button, steps, form | **PASS** | test 2 |
| 3 | Submit TrxID + proof upload -> "pending verification" | **PASS** | test 2; API `PENDING_VERIFICATION` + proof URL |
| 4 | Admin sees the queue and verifies the exact amount | **PASS** | test 2; "payment verified" |
| 5 | Seller sees the order unlocked, confirms and packs | **PASS** | test 2; `PAYMENT_REQUIRED` before verification |
| 6 | Seller ships; buyer sees the status | **PASS** | supplemental API walk: `CONFIRMED -> PACKED -> SHIPPED`; buyer read back `SHIPPED` |
| 7 | Rejection with reason, then resubmission | **PASS** | test 3; buyer page shows the reason; second TrxID -> pending |
| 8 | Duplicate TrxID rejected clearly | **PASS** | test 4; HTTP 409 `PAYMENT_SUBMISSION_DUPLICATE` |
| 9 | Underpayment, then a second TrxID for the difference | **PASS** | test 5; remaining 250 -> PAID |
| 10 | Overpayment recorded for refund | **PASS** | test 6; refund row `REFUND_PAYABLE` 100 |
| 11 | Unpaid order expires + returns stock; PENDING_VERIFICATION never expires | **PASS** | test 7; stock +1; pending stays pending |
| 12 | Late payment inside grace reinstates the order | **PASS** | test 8 |
| 13 | One shop cancelled after PAID -> partial refund, admin completes it | **PASS** | test 9; `PARTIALLY_REFUNDED` |
| 14 | Permissions: other buyer 404, seller sees no receiving number | **PASS** | test 10 |
| 15 | Settings snapshot: old/new number; provider off hides bKash | **PASS** | test 11 |
| 16 | 360/1280 + en/bn rendering reviewed | **PASS** | test 12; written findings retained |

**Result: 12/12 payment scenarios passed.** No P0/P1 product bug was found; no product code change was needed. The only test changes were fixture/timing robustness in the two settings specs (see below).

## Settings specs (previously skipped)

Run against the isolated stack with the seeded test admin (credentials never printed).

| Spec | Result |
|---|---|
| `settings.spec.ts` grouping/sticky/discard/reset/validation/history | **PASS** |
| `settings.spec.ts` sensitive re-auth/history | **FAIL (test timeout, 240 s)**; snapshot showed the save/history worked; no product error |
| `settings.spec.ts` customer-side effects | **not run** (blocked by the previous test) |
| `settings-persist.spec.ts` one save + five reloads | **FAIL (test timeout, 300 s)**; snapshot showed bKash/Advance checked, number `01700000000`, i.e. values persisted; the repeated reloads on the slow dev filesystem exhausted the timeout |

These are test-harness timeouts on the slow `:3002` dev server, not payment/settings logic failures.

## Dev settings - actual state and safety

The task brief expected `advance=false, providers=false, no numbers`. The **owner's dev DB already has** `advance=true`, `bkash=true`, a non-empty real bKash number, `nagad=false`, COD `true`. History proves this predates this session: last changes at **2026-11-16 11:11 UTC** (advance/bKash/number). This session only read dev; all writes went to `planthaat_test`. The real number was not printed, changed or deleted.

Safe to enable/turn on Advance in dev: it is **already on**, and the owner's real number is present. Before accepting real money, the owner should still confirm the number and the manual verification process in Settings -> Payments. Do not reset the number to empty.

## Evidence

Screenshots were temporary agent evidence and are deleted. The scenario table above is the retained evidence; re-run the Playwright suite to reproduce the captures.

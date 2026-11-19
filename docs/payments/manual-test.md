# Advance payments — manual test script (owner)

This script assumes: backend `.env` points at the dev database, the API runs on `:5000`, the frontend on `:3000`, and the demo data is seeded. Never put the test numbers from `backend/.env.test` into the dev database.

## Before you enable Advance in dev (checklist)
1. In Admin → Settings → Payments, enter your **real** bKash number (and Nagad if you use it). Save once; the app asks for your password again because numbers are sensitive.
2. Enable the provider(s) you entered. A provider cannot be enabled until its number is a valid BD mobile number.
3. Enable **Advance payment**. Advance stays unavailable at checkout until at least one provider is enabled with a valid number, so do this last.
4. Check the warning/instruction/verification texts are what you want customers to read. They are snapshotted onto each new payment, so editing later does not change orders already placed.
5. Keep **Cash on delivery** enabled so the shop keeps working while you test.

Do not enable Advance in dev until you are ready for real buyers to see the option.

## English
1. **COD still works.** Add a product to the cart → Checkout → keep “Cash on delivery” → Place order. You should land on the order page with no payment box.
2. **Place an Advance order.** Add a product → Checkout → choose “Advance payment” → Place order. You are redirected to the payment page.
3. **Payment page.** Check the amount due, the bKash/Nagad toggle, the “Send Money — not Cash Out” warning, and the receiving number. Press “Copy number” and confirm it says “Copied”.
4. **Submit.** Press “Payment made, submit information”, enter your mobile number and the TrxID (uppercase/spaces are normalised), optionally attach a screenshot (JPEG/PNG/WebP, max 5 MB), then Submit. The page switches to “Pending verification”; the order shows a “Payment pending” badge.
5. **Admin verify.** Admin → Payments to verify. The row shows the order, buyer, amount, provider, TrxID, sender number, time and proof. Press Verify, enter the exact amount received, confirm. The queue clears and the buyer page shows “Payment complete”.
6. **Seller unlock.** Seller → Orders shows the advance badge. Before verification Confirm/Ship are disabled with a reason; after verification the seller can confirm/pack/ship.
7. **Reject path.** Submit a payment with a wrong TrxID, then in admin press Reject and type a reason. The buyer page shows the reason and lets them submit new information.
8. **Underpayment.** Verify with an amount lower than due. The buyer sees “Amount still due” and can submit another TrxID for the difference; verify that one too.
9. **Overpayment.** Verify with more than due. The payment becomes PAID and the difference appears in Admin → Advance refunds as “Refund payable”.
10. **Expiry.** An unpaid order expires after the configured hours: the order is cancelled and stock returns. A payment already submitted stays “Pending verification” and never expires; the admin queue highlights the SLA breach after the SLA hours. A TrxID submitted inside the late grace window is accepted; verifying it reinstates the order if stock exists, otherwise it becomes a refund obligation.
11. **Partial refund.** Place a multi-shop Advance order, verify it, then cancel one shop’s order before shipping. Admin → Advance refunds shows an obligation for that shop only; send the money back, enter the refund TrxID, complete it. The payment becomes “Partially refunded”.
12. **Number change.** Change the bKash number in Settings and place a new order: the new payment page shows the new number. An order placed before the change keeps the old number (snapshot).
13. **Provider off.** Disable bKash: new checkout/payment pages no longer offer bKash; existing orders keep their snapshot.

## বাংলা
১. **ক্যাশ অন ডেলিভারি আগের মতোই কাজ করে।** পণ্য কার্টে নিন → চেকআউট → “ক্যাশ অন ডেলিভারি” রেখে অর্ডার করুন। অর্ডার পেজে কোনো পেমেন্ট বক্স থাকবে না।
২. **অগ্রিম অর্ডার।** পণ্য কার্টে নিন → চেকআউট → “অগ্রিম পেমেন্ট” বেছে নিন → অর্ডার করুন। পেমেন্ট পেজে চলে যাবেন।
৩. **পেমেন্ট পেজ।** প্রদেয় টাকা, বিকাশ/নগদ টগল, “Send Money — Cash Out নয়” সতর্কতা ও নম্বর দেখুন। “নম্বর কপি করুন” চেপে “কপি হয়েছে” দেখুন।
৪. **তথ্য জমা।** “পেমেন্ট করেছি, তথ্য জমা দিন” চাপুন, নিজের মোবাইল নম্বর ও TrxID দিন (স্পেস/ছোট হাতের অক্ষর স্বয়ংক্রিয়ভাবে ঠিক হবে)। চাইলে স্ক্রিনশট (JPEG/PNG/WebP, সর্বোচ্চ ৫ MB) যুক্ত করুন, তারপর জমা দিন। পেজ “যাচাইয়ের অপেক্ষায়” দেখাবে।
৫. **অ্যাডমিন যাচাই।** অ্যাডমিন → যাচাইয়ের অপেক্ষায় পেমেন্ট। সারিতে অর্ডার, ক্রেতা, টাকা, প্রোভাইডার, TrxID, প্রেরকের নম্বর, সময় ও প্রমাণ থাকবে। “যাচাই করুন” চেপে ঠিক যে টাকা পেয়েছেন সেটি লিখে নিশ্চিত করুন। ক্রেতার পেজে “পেমেন্ট সম্পন্ন” দেখাবে।
৬. **সেলার আনলক।** সেলার → অর্ডারে অগ্রিম ব্যাজ থাকবে। যাচাইয়ের আগে Confirm/Ship বন্ধ থাকবে কারণসহ; যাচাইয়ের পর সেলার কনফার্ম/প্যাক/শিপ করতে পারবে।
৭. **বাতিল পথ।** ভুল TrxID দিয়ে জমা দিন; অ্যাডমিন “বাতিল করুন” চেপে কারণ লিখুন। ক্রেতা কারণ দেখে নতুন তথ্য জমা দিতে পারবে।
৮. **কম পেমেন্ট।** প্রদেয়ের চেয়ে কম টাকা যাচাই করুন। ক্রেতা “এখনও টাকা বাকি” দেখবে এবং বাকিটুকুর জন্য নতুন TrxID জমা দিতে পারবে।
৯. **বেশি পেমেন্ট।** প্রদেয়ের চেয়ে বেশি যাচাই করলে পেমেন্ট PAID হবে এবং অতিরিক্ত টাকা অ্যাডমিন → অগ্রিম রিফান্ডে “রিফান্ড প্রদেয়” হিসেবে দেখাবে।
১০. **সময় শেষ।** নির্ধারিত সময়ে অপরিশোধিত অর্ডার বাতিল হবে ও স্টক ফিরে যাবে। ইতিমধ্যে জমা দেওয়া পেমেন্টের মেয়াদ শেষ হয় না; SLA সময় পার হলে অ্যাডমিন সারিতে সতর্কতা দেখাবে। গ্রেস সময়ের মধ্যে TrxID দিলে গ্রহণ হবে; স্টক থাকলে অর্ডার ফিরে আসবে, না থাকলে রিফান্ড প্রয়োজন হবে।
১১. **আংশিক রিফান্ড।** একাধিক দোকানের অগ্রিম অর্ডার যাচাই করে শিপিংয়ের আগে একটি দোকানের অর্ডার বাতিল করুন। শুধু সেই দোকানের টাকা অ্যাডমিন → অগ্রিম রিফান্ডে আসবে; টাকা ফেরত পাঠিয়ে রিফান্ড TrxID লিখে সম্পূর্ণ করুন। পেমেন্ট “আংশিক ফেরত” হবে।
১২. **নম্বর পরিবর্তন।** সেটিংসে বিকাশ নম্বর বদলে নতুন অর্ডার করুন: নতুন পেমেন্ট পেজে নতুন নম্বর দেখাবে। আগের অর্ডার পুরোনো নম্বরই রাখবে।
১৩. **প্রোভাইডার বন্ধ।** বিকাশ বন্ধ করলে নতুন চেকআউট/পেমেন্ট পেজে বিকাশ থাকবে না; আগের অর্ডার আগের তথ্যই রাখবে।

## Isolated test stack (developer)
- `backend/scripts/test-stack.ps1 -Action start` seeds `planthaat_test` (fake admin/buyers/sellers/products; Advance ON; bKash `01700000000`, Nagad `01800000000`) and starts API `:5001` + frontend `:3002`.
- `-Action stop` stops both; `-Action seed` reseeds.
- Playwright: `PAYMENTS_TEST_BASE_URL=http://localhost:3002 PAYMENTS_TEST_API_URL=http://127.0.0.1:5001 npx playwright test e2e/payments-advance.spec.ts --project=desktop-chromium`.
- Expiry tests force `expiresAt` into the past and run the real expiry job via `backend/scripts/test-expire-intent.ts` (test database only).

---

# Part 4 manual test script (run after the UI session)

Use the isolated stack or dev app. Do not change the owner's dev settings except through the
Settings UI for the steps marked optional, and restore them afterwards.

## Advance -> hold -> release -> withdrawal

1. As a seller, open Wallet. Confirm Available, Pending, On hold, Total withdrawn and COD dues show.
2. As a customer, place an ADVANCE order with one shop. Pay by bKash/Nagad and submit the TrxID.
3. As admin, verify the payment with the exact amount. Seller wallet still shows no Available.
4. As the seller, confirm -> pack -> ship -> deliver the order. The wallet Pending grows by the
   seller net; the order shows a "report a problem until <time>" deadline and the wallet shows the
   same release date.
5. Optional: before the deadline, as the buyer press "Everything is fine". The seller funds move to
   Available immediately and a "Funds released" notification appears.
6. Otherwise wait until the window passes (or use a short `return.windowHours` in Settings for the
   test, then restore 48). The release job runs on startup/every 5 minutes; Pending moves to
   Available.
7. As the seller, open Request withdrawal. Enter less than Available and more than the minimum.
   Confirm Available drops and Reserved/Withdrawal pending appears.
8. As admin, open the payout queue and mark it paid with a TrxID. Total withdrawn increases; the
   seller gets a notification. Reject another request and confirm the amount returns to Available.

## Dispute

1. Deliver another ADVANCE order. Before the window closes, as the buyer open a dispute with a photo.
2. Confirm the seller wallet shows On hold (not Available) and the seller gets a notification.
3. As the seller, respond within the response window; the complaint shows the response.
4. As admin, try a partial refund above the order total (must fail), then a valid partial/full refund
   with a refund TrxID. Confirm the order shows the refund and the seller's held funds are gone.
5. Open one more dispute and reject it. Confirm the funds return to Pending (if the window is still
   open) or Available (if it already passed).

## COD dues

1. Deliver a COD order. Seller wallet shows COD dues equal to the commission; Available does not
   change and the platform has no buyer receipt for it.
2. Set `wallet.codDuesLimit` below the dues. A withdrawal request is blocked with
   `PAYOUT_COD_DUES_BLOCKED`; restore the setting.
3. As admin, record a dues payment with a TrxID. COD dues return to 0 and the wallet history shows it.
4. With `wallet.codCommissionDeduct` on and some Available balance, deliver a COD order and confirm
   the dues are deducted automatically from Available.

## Reconciliation

1. As admin, open the ledger/reconciliation view. `balanced` must be true and `difference` `0.00`.
2. If it is not, do not pay out; capture the response (receipts/buckets/COD dues) for the backend
   owner. A `SETTLEMENT_CONSERVATION_BREACH` violation must be treated as a P1.

## Permission checks

1. A customer cannot open the seller wallet or admin withdrawal/dispute endpoints (403).
2. A seller cannot open the admin queues or decide a dispute (403).
3. Another seller cannot see this seller's wallet, transactions or withdrawal rows.

## Part 4 owner UI check (use NEW orders only)

Orders delivered before Part 4 are legacy-settled and have no return window; create new test orders.

1. Seller ? Wallet: check Available, Pending (with release date), On hold, Total withdrawn and COD
   dues. Open Transactions and Payout profile.
2. Place and pay a new Advance order; deliver it as the seller. Buyer ? Orders ? the order shows
   �Problem window is open� with a deadline and two actions.
3. Press �Everything is fine� ? confirm. Seller Wallet moves the amount from Pending to Available.
   Otherwise wait for the window; the release job runs every 5 minutes.
4. Request a withdrawal (at least the minimum). Admin ? Withdrawals ? Mark paid with a TrxID. Seller
   Wallet shows Total withdrawn; reject another request and confirm the amount returns to Available.
5. Buyer reports a problem with a photo. Seller ? Complaints responds. Admin ? Disputes opens the
   order/evidence and chooses reject, full refund, partial refund or return. A refund needs the
   refund TrxID before it is finished.
6. COD: deliver a COD order; Wallet shows COD dues. If dues exceed the limit, withdrawal is blocked;
   Admin ? seller ? dues payment with TrxID clears it.
7. Admin ? Reconciliation: run the check; `Balanced` must be green. Do not pay out on a breach.

## Part 4 closing checks (UI)

1. **Reject a dispute:** deliver an ADVANCE order, buyer reports a problem with a photo, seller
   responds, admin opens the dispute and chooses Reject with a reason. Seller Wallet moves the amount
   back to Pending (or Available if the window passed); buyer and seller timelines show the decision.
2. **Reject a withdrawal:** seller requests a withdrawal; admin opens Withdrawals, rejects with a
   reason. Seller Wallet shows the amount back in Available and the rejected request with the reason.
3. **Payout details:** admin opens Withdrawals, presses �Show payout details�, enters the admin
   password, copies the full destination, then closes it. It disappears automatically after about
   60 seconds. It is never shown in the list or audit log.
4. **Validation:** try a below-minimum amount, more than Available, a fourth pending request (limit),
   a payout-account change inside the cooldown, an invalid mobile number, and a withdrawal while COD
   dues exceed the limit. Each must show a specific message; the COD message must say how to fix it.
5. **Double submit:** click Request withdrawal twice quickly; only one request is created.
6. **Multi-shop refund:** cancel one shop of a paid ADVANCE order, complete the refund in Admin ?
   Advance refunds with a TrxID, and confirm the buyer sees the partially-refunded payment state.
7. **Reconciliation:** Balanced state is green. In the TEST database only, run
   `node --import tsx scripts/part4-breach-test.ts insert`, open Admin ? Reconciliation, confirm the
   breach banner/table, then restore with the printed id. Never run this on the dev database.
8. **Permissions:** a buyer/seller typing an admin URL directly is blocked; another seller cannot see
   this seller�s wallet.

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

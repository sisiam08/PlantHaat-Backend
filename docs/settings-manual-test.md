# Settings manual test (owner)

Open http://localhost:3000 with an admin account, then **Admin → Settings**. Save each change, open a customer page in a normal/incognito window, and restore the setting afterwards.

## 1. COD maximum amount / ক্যাশ অন ডেলিভারির সর্বোচ্চ সীমা

**English**
1. Open **Orders** and set **COD maximum amount** to `1`. Save.
2. Log in as `customer5@planthaat.test` / `CustomerDemo1` and use the 3-shop demo cart.
3. Open `/checkout`. Payment should say “Cash on delivery is available for orders up to ৳1” and Place order should stay disabled.
4. Try the same checkout from the API/another tab; it must be rejected.
5. Set it back to `0` (no limit) and save.

**বাংলা**
1. **Orders** ট্যাবে **COD maximum amount** = `1` দিন এবং সংরক্ষণ করুন।
2. `customer5@planthaat.test` / `CustomerDemo1` দিয়ে ৩ দোকানের ডেমো কার্ট নিন।
3. `/checkout` খুলুন। “Cash on delivery is available for orders up to ৳1” দেখাবে এবং Place order বন্ধ থাকবে।
4. একই চেকআউট API থেকে করলে তা প্রত্যাখ্যাত হবে।
5. আবার `0` (সীমা নেই) দিয়ে সংরক্ষণ করুন।

## 2. Support WhatsApp / সহায়তার হোয়াটসঅ্যাপ

**English**
1. Open **Support** and set **WhatsApp number** to `01712345678`. Save.
2. Open the customer home page and footer. The footer must show WhatsApp with a `wa.me` link.
3. Open `/contact`; a WhatsApp card must appear.
4. Clear the number and save to restore.

**বাংলা**
1. **Support** ট্যাবে **WhatsApp number** = `01712345678` দিয়ে সংরক্ষণ করুন।
2. গ্রাহক হোম পেজের ফুটার খুলুন। ফুটারে WhatsApp ও `wa.me` লিংক দেখা যাবে।
3. `/contact` খুলুন; WhatsApp কার্ড দেখা যাবে।
4. নম্বর মুছে দিয়ে সংরক্ষণ করুন।

## 3. Return/objection window / ফেরত বা অভিযোগের সময়সীমা

**English**
1. Open **Orders**, set **Return/objection window** to `24` hours. Save.
2. Home trust strip must say “24-hour complaint window”.
3. Open a product page; the Returns tab must say “within 24 hours of delivery”.
4. Set it back to `48` and save.

**বাংলা**
1. **Orders** ট্যাবে **Return/objection window** = `24` ঘণ্টা দিয়ে সংরক্ষণ করুন।
2. হোম পেজের ট্রাস্ট স্ট্রিপে “24-hour complaint window” দেখাবে।
3. যেকোনো পণ্যের পেজের Returns ট্যাবে “within 24 hours of delivery” দেখাবে।
4. আবার `48` করে সংরক্ষণ করুন।

## 4. Default commission / ডিফল্ট কমিশন

**English**
1. Open **Wallet** and change **Default commission** to `12`. Save; confirm with your admin password.
2. Place a new COD order with no seller/category/global commission rule.
3. Admin/seller order detail must show commission at 12% of the item total.
4. Restore the previous percentage with re-auth.

**বাংলা**
1. **Wallet** ট্যাবে **Default commission** = `12` দিন। সংরক্ষণে অ্যাডমিন পাসওয়ার্ড দিন।
2. কোনো seller/category/global কমিশন রুল ছাড়া নতুন COD অর্ডার করুন।
3. অ্যাডমিন/সেলার অর্ডার ডিটেইলে আইটেমমূল্যের ১২% কমিশন দেখাবে।
4. আগের শতাংশ পুনরায় re-auth দিয়ে ফিরিয়ে দিন।

## 5. Unsaved changes / অসংরক্ষিত পরিবর্তন

**English**
1. Change any field without saving. The sticky bar must show “1 unsaved change”.
2. **Discard** must restore the saved value.
3. Reloading/closing the tab must warn about unsaved changes.

**বাংলা**
1. কোনো ঘর পরিবর্তন করুন কিন্তু সংরক্ষণ করবেন না। নিচের বার “১টি অসংরক্ষিত পরিবর্তন” দেখাবে।
2. **Discard** চাপলে আগের মান ফিরে আসবে।
3. ট্যাব রিলোড/বন্ধ করলে অসংরক্ষিত পরিবর্তনের সতর্কতা আসবে।

## 6. Sensitive changes & history / সংবেদনশীল পরিবর্তন ও ইতিহাস

**English**
1. Change **Default commission** or **bKash receiving number**. Save; the re-auth dialog appears.
2. A wrong password must be rejected inline; the correct password saves.
3. The Recent settings history must show the key, time, old value and new value.

**বাংলা**
1. **Default commission** বা **bKash receiving number** বদলে সংরক্ষণ করুন; re-auth ডায়ালগ আসবে।
2. ভুল পাসওয়ার্ড ইনলাইন প্রত্যাখ্যাত হবে; সঠিক পাসওয়ার্ডে সংরক্ষণ হবে।
3. Recent settings history-তে কী, সময়, আগের ও নতুন মান দেখা যাবে।

## Restore checklist / ফেরানোর তালিকা

- `order.codMaxAmount = 0`
- `support.whatsapp = ""`
- `return.windowHours = 48`
- previous `commission.default`
- provider numbers and payment methods unchanged

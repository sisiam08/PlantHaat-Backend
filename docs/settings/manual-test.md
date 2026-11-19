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

## 7. Advance + bKash persistence (corrected) / অ্যাডভান্স ও বিকাশ সংরক্ষণ

**English**
1. enter the bKash receiving number, tick bKash enabled, tick Advance payment enabled.
2. Press Save once, enter your admin password once, and wait for "Saved. Customers will see this on new page loads".
3. Reload five times; the number and both toggles must stay.
4. Clear the number and press Save; the form must show an inline number error and must not report success. Restore the values afterwards.

## 8. Home hero settings

1. Open **Admin → Settings → Home**. Change the English headline and add/reorder a chip; Save.
2. Open the home page in a new tab. The new headline and chip order appear without a deploy. Click a
   chip; it must open `/products` with the matching filter (for example `isIndoor=true`).
3. Upload an optional hero image (1200×900), set alt text and focal point, Save. The hero shows the
   image with the chosen crop; remove it and Save to return to the real product cards.
4. Clear the headline and Save; the server should reject the empty bilingual value. Restore it.

## 9. Home Highlights

1. Open **Admin → Home → Highlights**. The master switch is on; the list shows slides (or the empty
   state). Turn it off, open the home page in a new tab: no Highlights heading, no box and no gap.
   Turn it back on.
2. Add a slide: upload a desktop image (1920×640 works best) and an optional mobile image
   (960×640), add Bangla/English alt text, overlay headline and a button with an external
   `https://` link. Save; the page says customers will see it within seconds.
3. Open the home page at 1440 and 390. The desktop and mobile crops differ, the overlay/button are
   readable, and the button opens the external link in a new tab.
4. Schedule the slide to start tomorrow. It disappears from the public list today (status
   Scheduled); remove the schedule and it returns. Use the up/down buttons or drag to reorder.
5. Duplicate the slide (creates a hidden copy), then delete it. Delete the test slide at the end.
6. Try a `javascript:` link and a custom button with white text on yellow; both must be rejected with
   an inline/server message. Try a square image; it should save with an aspect-ratio warning.
7. Turn the master switch off again if the owner does not want the section live. The dev settings
   should be left exactly as the owner wants them.

**বাংলা**
1. bKash receiving number দিন, bKash enabled ও Advance payment enabled টিক দিন।
2. একবার Save চেপে একবার অ্যাডমিন পাসওয়ার্ড দিন; "Saved. Customers will see this on new page loads" দেখা পর্যন্ত অপেক্ষা করুন।
3. পাঁচবার রিলোড করুন; নম্বর ও দুটি টগল একই থাকতে হবে।
4. নম্বর মুছে Save চাপলে ইনলাইন নম্বর ত্রুটি দেখাবে, সফল বার্তা দেখাবে না। পরে মান ফিরিয়ে দিন।

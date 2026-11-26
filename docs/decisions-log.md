# Decisions log
- 2026-11-19 - Upload lifecycle follow-up: every persistence flow now calls `attachAssetsInTransaction` inside the entity transaction; the orphan cron checks a central registry (scalar + JSON + private-key columns), relinks referenced assets, skips private/foreign-prefix assets, uses a configurable 7-day grace (`upload.orphanGraceDays`, min 1 day), supports dry-run and logs scanned/deleted/relinked/skipped counts. Registry completeness, persistence guard, cron unit tests and Part 3/4 e2e assertions cover the rule.
- 2026-11-19 - Environment separation: `CLOUDINARY_FOLDER` (planthaat/dev|test|prod) is the canonical prefix; production boot fails without a /prod folder. Smoke runs in its own temporary folder and deletes it; migration/reconciliation/cron only touch the current prefix. Existing planthaat/... assets were not moved.
- 2026-11-19 - Secrets hygiene: Cloudinary credentials were present in `.env.example` history at `35675ba`; the working tree is sanitized and `npm run lint` now runs a secret-pattern gate. No history rewrite; rotation is documented in `docs/security/secret-rotation.md`. Home banners now reference the existing WebP files; a Vitest guard checks every static banner path.

- 2026-11-19 - Cloudinary is the default persistent image store. Root cause of local `/uploads` URLs: the dev `.env` explicitly set `STORAGE_DRIVER=local`, and `seed-demo.ts` hard-coded local/S3 instead of the shared driver resolver. Fix: `STORAGE_DRIVER=cloudinary` in dev, seed uses `resolveStorageDriver`, and a warning is logged whenever a non-test process selects local. `auto` is kept for offline onboarding but production still refuses local. Rationale: no silent fallback when Cloudinary fails (storage errors propagate) and no accidental local selection.
- 2026-11-19 - `UploadedAsset` rows must be marked ATTACHED by every entity that persists an upload URL (product image, category, shop logo/banner, avatar, banner, review photo, complaint attachment, payment proof). Without this the hourly orphan cron deleted images after 24 h. Deletion is best-effort and guarded by reference checks (order-item snapshots and duplicate product-image URLs). Legacy local files are migrated, not deleted, so rollback is possible.


- 2026-11-17 � Customer consistency: use one PageHeader h1 at 24/30 bold and PageContainer width tiers (wide/reading/form/narrow) instead of four h1 scales and per-page containers. Rationale: one scannable title and consistent edges without forcing forms into a 7xl column.
- 2026-11-17 � SiteShell owns the only `<main id="main">`; customer pages use PageContainer/div inside it. Rationale: nested main landmarks are invalid and broke the skip link/axe.
- 2026-11-17 � Auth pages get a real h1 in AuthCard and 44px auth links; marigold remains the single submit CTA. Rationale: WCAG one-h1, target size, one primary action.
- 2026-11-17 � Empty/query failures use EmptyState/QueryError with a real retry; not-found uses �Back to home�. Rationale: actionable, non-blaming states and consistent language.
- 2026-11-17 � Home hub keeps the icon fallback for seed category images in development only; production never substitutes a real upload. Rationale: the owner�s 11 category files are byte-identical placeholders, and fabricating photos is not allowed.
- 2026-11-17 � Home product rails are plants-only/in-stock, curated to 8, and deduplicated across adjacent rails; the final all-catalogue feed is labelled All products. Rationale: the old dedupe hid New arrivals and the feed contains tools/pots as well as plants.
- 2026-11-17 � Auth forms use `method="post"` as a native fallback. Rationale: a click before hydration submitted email/password into the URL via the default GET form; POST prevents credential leakage even when JS is not ready. Client validation/submit remains unchanged.
- 2026-11-17 � Authenticated screenshots that resolved to `/login` are invalid evidence; do not treat them as pass. Re-run after confirming `/api/v1/auth/me` and the target page URL.
- 2026-11-17 - Auth root cause: the previous authenticated batch clicked Submit before React hydrated, so the native `method="post"` form navigated to `/login` and the screenshots were of a signed-out page, not an expired session. Fix: every auth form is `inert` and its Submit disabled until hydration (useHydrated via useSyncExternalStore); normal client submit is unchanged.
- 2026-11-17 - Keep one date formatter implementation: `formatLatinDateTime(value, locale)` (Latin digits, Asia/Dhaka, localized month words); `formatDateTime` is a deprecated alias. Rationale: two implementations disagreed and dates must stay copy-safe.
- 2026-11-17 - Hide a home product rail when fewer than 4 unique in-stock plants remain after dedupe (`HOME_RAIL_MIN`). Rationale: sparse rails look broken and padding with repeats is forbidden; Low light now disappears while Pet safe stays.
- 2026-11-17 - Shared card surface for shop/cart/filter/info cards: `rounded-xl` (feature cards `rounded-2xl`), `border-border/60`, `shadow-[var(--shadow-soft)]`; info-card headings are `text-lg font-semibold`. Rationale: one visual language without flattening different actions.
- 2026-11-17 - Checkout with an empty cart shows the shared empty state with a Browse plants action instead of a zero-total form. Rationale: the form was unusable and implied a valid order.
- 2026-11-17 - Order detail maps the raw `paymentMethod` enum to the localized checkout label (Cash on delivery / Advance payment). Rationale: no raw enums in customer copy.
- 2026-11-17 - Accessibility fixes from the axe gate: auth layout owns `<main id="main">`, seller apply has a main landmark, product gallery carousel has an accessible label, payment page keeps its h1 in loading/error states, header Log in/Register are 44px, catalog sort trigger uses the new `SelectTrigger size="lg"`, checkout summary scroll area is keyboard focusable.
- 2026-11-17 - Lighthouse CLI is not installed and installing it would violate the no-new-dependency rule, so STEP 5 uses Chromium PerformanceObserver metrics on the production build (documented in `frontend/docs/design/performance.md`); benchmarkIndex is not reported.
- 2026-11-17 - Settings persistence and advance-payment Playwright suites were not run in this pass: they require the isolated `:5001`/`:3002` stack and an admin password, and running them against dev would mutate real settings/payment rows. Logged as skipped, not green.
- 2026-11-17 - Commit/push scope: frontend commits `ecea1d4` and `a773226` were pushed to `redesign/phase2`; the backend grace change is committed as `ce99157` on `feature/payments` but not pushed, because the requested push target was the frontend branch only. Owner-uncommitted files in both repos were left untouched.
- 2026-11-18 - Perf method: use Playwright + CDP (`Network.emulateNetworkConditions` Slow 4G, `Emulation.setCPUThrottlingRate` 4) with a fixed-loop CPU calibration instead of installing Lighthouse; no project dependency added. Compare current working tree with a real build of `c3a0255` (pre-`f100858`) on the same machine/session. Rationale: the previous 1.07 s number was unthrottled and not comparable.
- 2026-11-18 - Home LCP is +212 ms vs pre-consistency (2304 vs 2092 ms) while catalog/PDP/checkout improved. Keep the approved merchandising sections; the delta is within the 2.5 s target and no low-risk lever is missing (single font preload per locale and responsive `sizes` already verified). Reverting would undo approved UX for ~0.2 s.
- 2026-11-18 - Advance verification ran only on the isolated `:5001`/`:3002` stack with fake seed. Dev writes are prohibited here; the owner's dev DB already has advance ON + bKash ON + a real number (last changed 2026-11-16 11:11 UTC), so it was not reset to the brief's assumed "all off" state. Never delete/overwrite the real number.
- 2026-11-18 - Settings spec fixture: the isolated payment seed has Nagad already enabled with a fake number, so the old spec's "enable Nagad without a number must 400" assertion is fixture-dependent. It now asserts the guard only when the fixture has no number; group/history test unchanged. Timeouts on the slow isolated dev server are recorded, not hidden.
- 2026-11-18 · Docs: move all documentation into backend/docs and frontend/docs; one canonical file per topic; merge duplicate audits/progress/perf/typography docs; delete agent screenshots, raw measurement dumps and temporary scripts; frontend test screenshots now go to the gitignored .artifacts/. Undo archive is the workspace _cleanup-archive (outside both repos).

- 2026-11-18 - Money-path CLS: keep the client data flow but server-render the cart summary, checkout addresses/public settings and a delivery-neutral cart preview, then refresh the district quote in place. Rationale: avoids a second auth/session model, no money logic moves, and CLS drops below 0.02 while checkout LCP falls under 2 s in the final run. The district-scoped cart call (up to 2.8 s in the dev API) stays off the critical path; Place order is disabled while the preview is shown.
- 2026-11-18 - Inter is `font-display: optional` with a metric-matched Arial fallback (Next-computed size-adjust/ascent/descent). Rationale: late font swap was repainting the LCP text; the fallback keeps the same line boxes (CLS stayed <=0.01). Hind keeps `swap` because the Bangla preload lands before first paint.
- 2026-11-18 - Card focus rings move from `:focus-within` to `:focus-visible`/`:has(a:focus-visible)` with inset rings, shared in `lib/focus-ring.ts`. Rationale: `:focus-within` fires on mouse/touch and after Back, which produced the owner-reported green border; the inset ring is inside overflow rails.
- 2026-11-18 - Password fields use one `PasswordInput` and FormField delegates `type="password"` to it; a Vitest guard fails on raw password inputs. The toggle is a real button with preventDefault on pointerdown so focus/caret stay in the field.
- 2026-11-18 - Settings Playwright runs only on a production isolated stack (test-stack.ps1 builds `:5001` and a `.next-test` frontend on `:3002`); fixtures are the test-stack seed (admin@teststack.local) and the specs derive values from the current snapshot to avoid no-op saves. Never against dev.
- 2026-11-18 - Public settings `cacheLife.revalidate` reduced 60 s -> 1 s. Rationale: the admin UI promises "customers will see this on new page loads"; a saved return window/WhatsApp was stale for up to a minute on prerendered pages. Tag invalidation is still the primary path.
- 2026-11-18 - Revoked-session expectation: logout-all clears both cookies, so `auth-required` is the correct proxy reason; the test accepts both reasons. Product unchanged.
- 2026-11-18 - Remaining checkout LCP cost is the render path (149 KB CSS, 26 chunks, non-preloaded Bangla logo face), not the API. Documented in performance.md as the next program; no bundling/font-policy change was made in this pass.

- 2026-11-18 - Card focus (owner follow-up): the inset wrapper ring was removed. Chrome on Windows can match :focus-visible after a mouse click/Back (bfcache focus restoration / Windows focus-ring settings), and an inset box-shadow paints under the image, producing a green frame on the text area only. Cards now use a shared `::after` overlay (inset 0, 2px, border-radius inherit, pointer-events none, z-index 15) painted above the artwork, shown only when `html[data-input-modality="keyboard"]` (set by InputModality: keydown=keyboard, pointerdown=pointer) AND the card contains a :focus-visible anchor (or is the anchor). Tests run on both bundled Chromium and real Chrome; pointer clicks, hover, active, tap and Back stay clean. No money/business logic touched.

- 2026-11-18 - Wishlist hydration fix: the delegated CardActionsLayer sets data-saved/aria-pressed on server-rendered hearts, and it could run before a streamed rail hydrated, which React reported as an attribute mismatch. The button now omits those props (with suppressHydrationWarning for the intentionally mutated attributes), renders two server-side sr-only labels switched by CSS on data-saved, and the layer only sets data-saved/aria-pressed. Added e2e/wishlist-hydration.spec.ts (saved heart shows true + "Remove from wishlist" with no hydration console error). WishlistClient also skips malformed infinite-query pages defensively. The reported WishlistClient TypeError did not reproduce on a warm server; it matched a transient stale dev chunk after the HMR churn, and the defensive guard prevents it from crashing if a page payload is malformed.

## 2026-11-18 Part 4 settlement decisions

- **One hold setting:** `return.windowHours` drives both the buyer dispute window and the seller
  money release. `payout.holdHours` stays in the registry as a deprecated alias (reads and writes
  delegate) so old admin clients do not break; no data migration was needed.
- **Ledger extension, not a second ledger:** Part 4 adds accounts/idempotency/business refs to
  `LedgerEntry`. Pre-Part-4 rows keep `account = NULL` and the old projection, so existing delivered
  or paid orders do not suddenly change balance. New events use balanced account batches with
  deterministic idempotency keys.
- **Legacy-settled:** orders delivered before the migration have no `releaseAt`, so the release job
  ignores them; no opening entries or guessed dates are written.
- **Reuse:** seller withdrawals reuse `Payout` (`requestedById`, `balanceSnapshot`, unique
  `idempotencyKey`, `REJECTED` status); disputes reuse `Complaint` (`decision`, response deadline,
  hold fields). Existing endpoints stay valid; new endpoints are additive.
- **Refund recording:** an admin decision with a refund TrxID posts `REFUNDS_PAID` immediately;
  without one it creates a `REQUESTED` refund and keeps `REFUND_PAYABLE`, leaving the existing
  refund-processing endpoint to complete it.
- **Reject/return timing:** held funds go back to `SELLER_PENDING` if the original release time is
  still in the future, otherwise straight to `SELLER_AVAILABLE`.
- **COD:** the platform never receives COD cash, so `COD_DUES` is outside the advance conservation
  equation. Auto-deduction from available books the retained amount as platform commission; manual
  dues payments only clear the receivable.
- **Withdrawal concurrency:** use a `SellerProfile` row lock (`SELECT ... FOR UPDATE`) before reading
  balances, plus reservation ledger rows and a unique idempotency key; parallel tests prove available
  is never overdrawn.
- **Defaults used (unchanged):** return window 48h, early release on, photo required, max 5 photos,
  seller response 48h, minimum withdrawal 500, max 3 pending, cooldown 24h, COD dues limit 1000,
  methods BKASH/NAGAD/BANK, commission 10% fallback.

## 2026-11-19 Part 4 UI decisions

- Reused the existing earnings route as the wallet (`/seller/earnings`) and reused `Payout`-backed
  `/admin/withdrawals` rather than adding a parallel payouts model.
- The payout destination stays masked in admin because the API never returns the full account
  number; no fake �reveal� was added.
- Early release is shown only when the public `return.earlyRelease` setting is on and the window is
  still open; the confirm dialog names the loss of the remaining dispute window.
- Legacy delivered orders (no `releaseAt`) show �legacy-settled� and keep the existing report link;
  no release date is invented.
- Shared header mobile spacing/logo sizing was tightened instead of hiding navigation controls, to
  fix the 360 px overflow without breaking the 44 px target on the remaining controls.

## 2026-11-19 Part 4 closing decisions

- Payout destination reveal reuses the existing settings re-auth service with a per-withdrawal scope
  (`withdrawal.destination:<id>`) instead of creating a second password system. The endpoint is
  admin-only, 5/min, no-store, single-use and audited without the value.
- The admin UI cannot reveal a destination from a list; it must open one request, re-authenticate and
  the value auto-hides after 60 seconds. The value is never put in React Query or local storage.
- A second dispute decision is a conflict, not an idempotent success: stale tabs must refresh and see
  the current decision rather than silently posting twice.
- Dispute seller/age/amount filtering is server-side (shop/seller name contains, age hours, order
  total range) so pagination stays correct.
- Legacy rows are labeled rather than backfilled: �Settled before the new wallet system�.
- The breach fixture is a guarded, documented test-only script (planthaat_test + approved host), and
  must be restored immediately.

## 2026-11-19 Home hero (Part A)

- Hero is utility-first: search + category scope + chips (all linking to existing filters) and a
  slim trust row, because Baymard's homepage research says users start with search/navigation, not
  campaign art.
- The decorative 2.5D composition was removed; the visual is either the admin's optional image or
  two real popular products. Real catalogue content makes the page read as a marketplace and also
  removes the placeholder-art / parallax JS from the LCP path.
- Hero text is shorter and smaller (desktop ~380 px, capped ~420 px) so the first product strip
  appears in the first mobile screen; display size no longer dominates the fold.
- Hero settings live in the existing Settings registry (`home.hero.*`, group `home`, public where
  needed) instead of a new CMS page: admin control is deliberately limited and the copy is cached
  with the existing `settings` tag.
- The optional hero image is stored as a public settings object (url, mobile url, alt, focal point)
  and attached through `UploadsService.attachAssetsInTransaction` in the same settings transaction;
  replaced assets are deleted only if no longer referenced.
- The standalone trust band was removed rather than duplicated under the hero, so the promise is
  made once per screen.
- The hero search is a native GET form, but the Next 16 Cache Components/streaming shell reveals streamed sections with inline JS. A browser with JavaScript fully disabled never un-hides those segments; this is app-wide, not hero-specific. The form therefore works when client JS fails after HTML is present, and the e2e asserts its native GET semantics rather than claiming full no-JS rendering.

## 2026-11-19 Home Highlights (Part B)

- Extended the existing `Banner` table/placement model instead of adding a parallel slider table;
  all new columns are additive and nullable/defaulted (`20261119120000_home_highlights_banner_fields`).
- Desktop/tablet uses a 3:1 aspect box (source 1920x640) and mobile 3:2 (source 960x640), with a
  480 px desktop cap. The heights intentionally differ: a 3:1 crop on a phone would be a thin strip,
  while a 3:2 crop on desktop would be too tall and hurt the below-the-fold rhythm.
- Autoplay is off by default and, when enabled, runs only at >= 768 px. Baymard/WCAG evidence says
  touch users cannot hover to pause and auto-rotating content is often ignored; reduced motion
  always wins, and touch pauses permanently for that visit.
- A single slide (or the whole feature off) renders no carousel JavaScript. With 2+ slides the Embla
  engine is dynamically imported only when the section is near the viewport; non-selected slide
  images are not rendered until selected, so off-screen slides are not downloaded.
- The backend owns a 15 s in-process cache of active rows and reads settings on every call. The
  frontend deliberately does not add a second `"use cache"` layer: admin saves and schedule
  boundaries then show on the next home request (the earlier double cache left the static home shell
  stale after a direct data change).
- Create/update returns validation warnings for off-aspect/small images instead of blocking; unsafe
  links, malformed colors/HTML text, end-before-start schedules and unreadable custom button colors
  are still rejected server-side. Overlay contrast blocks only at maximum scrim; button text blocks
  below 3:1.
- Highlights images must be owned uploads. The validator accepts Cloudinary https, same-site
  `/uploads/...` and the local test API origin (`http://localhost:<port>/uploads/...`) so the
  isolated test stack exercises the same attach/cleanup path.
- The import script uploads the owner's existing static banner files through the normal pipeline
  and tags rows with `[seed:home-highlights]`; a documented guarded removal script deletes only
  those rows/assets. It was run once on dev (3 slides), not on the test DB or production.

## 2026-11-20 Real-plant hero scene

- Restored only the owner-preferred left side from `f100858` (the commit before the `08443b8` marketplace hero), keeping Highlights, Settings ? Home, tokens and the server-rendered GET search. Removed the category select, chips, hero product cards and hero trust row.
- `home.hero.chips` is now `wired:false`, `isPublic:false` and absent from the Settings UI (kept in the registry for history). `home.hero.image` still works, but now replaces the plant scene statically with no WebGL.
- Scene uses the four owner cutouts (monstera, palm, snake, calathea) on an 11/10 desktop stage and 3/2 below `lg`, no border/card/background. Final values are the supplied composition table after the asset fix: heights 66/94/48/50, left 3/30/24/62, bottoms 4/1/0/0, pot centers 27.5/37.7/60.1/80.2%.
- The asset builder first resizes the visible plant, then pads 6%; the earlier order (pad then resize) corrupted the aspect ratios and made the table impossible. It uses the native sharp already in `backend/node_modules` when the frontend WASM copy is incomplete; no package.json change.
- Static `<img>` markup is the default. WebGL is an enhancement only: after idle/visibility, one canvas, premultiplied alpha, DPR <=1.5 (1 low-power), 45/30 fps cap, off-screen/hidden pause, adaptive fallback, reduced-motion/save-data/no-WebGL static.
- Performance trade-off: the palm is now the LCP candidate (preloaded, 287/383/480/639w variants). Mobile LCP is 2904/3124 ms vs the old 2832/3044 (~2-3% later); desktop 3452/3716 vs 2968/3140 (~15% later), CLS 0, JS 332 KB. The owner explicitly asked for the real scene; if strict desktop non-regression is required, cut/scale the palm or make the scene static-only.
- `hero-source/` is in the workspace root, outside both git repos; the owner's modified `.gitignore` was not touched. The generated WebP/JSON/TS are committed; source photos are not.

## 2026-11-20 Hero fixes (sway, stage, clipped edge, AVIF)

- Sway quality now samples **raw rAF tick deltas before the draw cap**, ignores >250 ms gaps and the first 3 s, drops DPR after sustained >28 ms for 3 s, and uses cached clip rects/ResizeObserver plus StrictMode-safe cleanup. The static fallback is 150 ms sustained for 5 s, not the suggested 40 ms/3 s: on this low-end 4x-CPU test the raw tick is 70-100 ms and 10-17 fps still animates; freezing contradicted the "still webgl after 15 s" acceptance test. 60 s real-Chrome logs on dev and prod stayed webgl with increasing frames.
- The plants/shadows now sit in a fixed 11:10 inner box; the outer stage fits it by height on phones (300 px) and tablets (420 px), centered. This keeps pot-center/stage-height ratios within 0.14% across 360-1440 instead of the 3/2 percentage distortion. A -mt-12 on the mobile scene lifts the pot bases above the fixed bottom nav.
- The asset builder now checks the outer 1% alpha bands for every plant and feathers clipped left/right/top edges by 4%. The bottom band is the pot base and is deliberately not feathered. Palm counts left 22/right 27/top 57/bottom 348; 2x cream crops show no visible hard vertical cut after feathering, so the supplied palm is acceptable. If the owner wants tips beyond the original canvas, supply an uncropped cutout with >=3% transparent margin on all sides and rerun the script.
- AVIF is the primary `<picture>` source with WebP fallback for all four plants; palm visible height is 600 px (padded 672, <=680). AVIF q50 is below the suggested 55-60 because q55/58 were not smaller than WebP on this alpha-heavy source; visual edge/alpha crops were checked. The palm preload uses AVIF imagesrcset/imagesizes. Desktop scene AVIF is 136.7 KB; mobile palm 19 KB.
- Performance: mobile LCP 2632/3040 ms (better/flat vs 2832/3044), desktop 3116-3208/3384-3904 ms vs 2968/3140, CLS 0, JS 332-358 KB. Desktop en is ~5% over, bn ~8-24% over in this noisy low-end environment; the remaining cost is render delay (the palm paints after the hero text), so the 5% goal is documented rather than cutting the owner-requested palm. If strict desktop non-regression is required, cut/scale the palm or make the scene static-only.

## 2026-11-20 Task A - hero trust row copy

- Restored the compact 3-item trust row under the hero links (the owner asked for it by name; `22f872d` had removed it): "Pay when it arrives" (only when `payment.cod.enabled` is true), "Verified nurseries", "Problem? Tell us within {hours} hours".
- `hours` comes from the public `return.windowHours` (never a constant) and is preformatted with `formatCount` so both locales keep Latin digits. Hours are kept as hours even for 24/48/72: no day conversion was invented. If the key is missing/invalid the complaint item is omitted rather than falling back to a magic number.
- New pure module `frontend/src/features/catalog/hero-trust.ts` plus unit tests and an extended `business-constants` guard; e2e asserts the row follows the live public setting in en and bn. Messages `trustCod`/`trustPackaging`/`trustComplaint` were replaced by `trustPay`/`trustVerified`/`trustProblem` (the old keys were unused).

## 2026-11-20 Task B - Highlights autoplay

- Root cause (real Chrome, admin ON, 3 slides, desktop 1440): the carousel called `EmblaCarousel(track, ...)`. Embla treats its argument as the root/viewport and `root.children[0]` as the container, so it measured the first slide wrapper as the whole track: `scrollSnapList()` returned 1 snap and `embla-carousel-autoplay` silently returned from `init` (`scrollSnapList().length <= 1`), leaving `isPlaying() === false` forever. The index stayed 0 for 20 s. Secondary causes: autoplay was gated to `(min-width: 768px)` and the whole engine was skipped under reduced motion.
- Fix: pass the overflow-hidden root; autoplay runs at every width; the engine stays mounted under reduced motion but the plugin is not created; the component owns pause/resume (hover, keyboard `:focus-visible`, pointer interaction, hidden tab, manual pause) and the visible pause control is authoritative. Pointer focus no longer counts as keyboard focus, so a swipe restarts the timer. A manual pause survives mouseleave/focusout.
- Evidence/tests: production build on :3002 with the :5001 test API and real Chrome, serial `highlights-autoplay.spec.ts` 8/8 (desktop/mobile advance, hover, focus, swipe, hidden tab, reduced motion, admin toggle off/on within 1.5 s); admin UI spec 1/1. Settings are read live and the admin toggle reached the home page inside the 1.5 s wait (no stale public-settings TTL involved; `/home/highlights` reads settings on every call).



## 2026-11-20 Task C - sessions

- C1 design confirmed: the access cookie (role sliding lifetime) deliberately outlives the 15-minute JWT; the session ends only at the refresh lifetime/revocation (password change, logout everywhere, suspension, reuse detection). Added the bilingual "How sessions end" notice and the access-token line to Settings → Security & Sessions; security setting labels/help are now bilingual. Canonical: `docs/auth/sessions.md`.
- C2 root causes (real Chrome, test stack with 10 s access TTL): (1) `localhost` shares cookies across ports, so the API's `ph_rt` on `/api/v1/auth` and the web's `ph_rt` on `/` could both be sent; Context `cookie-parser` takes the first (API-path) token while Next takes the last. Fixed by giving the web origin distinct names (`ph_web_at`/`ph_web_rt`), reading `ph_at`/`ph_rt` only as a migration fallback and clearing both legacy paths on every write. (2) The Server Component `getSession()` silently refreshed and rotated the refresh token but cannot write the rotated cookie; the browser stayed on the stale token, got grace replies, then `REFRESH_TOKEN_REUSED` at ~85 s (logged). Removed rotation from Server Components; the proxy, gateway and browser client (all able to set cookies) own refresh. (3) On any refresh error the backend cleared cookies, including 429 throttle/5xx; now only 401/403 clear. (4) A BFF mutation with a missing access cookie was rejected by the OriginGuard as 403; a valid `X-BFF-Key` now passes to the JWT guard (401), and the client retries a mutation 403 `ORIGIN_NOT_ALLOWED` after one refresh.
- C2 evidence: `frontend/scripts/session-soak.mjs` (real Chrome; logs refreshes/401/redirect/dialog and cookie name/path/expiry/hash, never values). Before: `ph_web_rt` stayed at one hash for 60 s then `REFRESH_TOKEN_REUSED`. After: 2-minute accelerated soak clean (0 auth failures, 0 login redirects, 0 dialogs, 8 navigations, 26 API calls); `session-refresh.spec.ts` 8/8 and `session-cookie-collision.spec.ts` 2/2.
- C3: dead sessions no longer redirect. A failed auth refresh opens an inline login modal on the current page (public pages allow dismiss); protected navigations are rewritten to `/session-expired` at the SAME URL (dialog open) and re-render the real page after login. Same-account keeps state/cart/scroll and asks the user to retry the action; a different account or a server page does a full reload and clears query caches; BroadcastChannel + a same-tab local event sync tabs. No tokens move to JS storage and cookie attributes are unchanged. Tests: `session-expired.spec.ts` 8/8 (in-page action/wrong password/state kept, protected URL, Escape/Back, account switch, two tabs, customer/seller/admin, axe/keyboard, bn/en).

## 2026-11-20 Task D - admin audit and consolidation

- Full inventory and duplicate table: `docs/admin-audit.md`. Every admin nav href resolves; there are no duplicate hrefs/labels or orphan top-level pages (`admin-route-manifest` 5/5).
- Commission default: canonical editor is `/admin/commission-rules` (GLOBAL rule). Settings shows the **effective** default (new `GET /admin/commission-rules/effective`, same resolver as checkout) plus the fallback value, read-only with a link. `commission.default` stays as the documented fallback and is now `wired:true`. Test asserts the displayed effective value equals `resolveRatePercent` when no scoped rule matches.
- Highlights: canonical editor is `/admin/highlights` for on/off, autoplay and interval. Settings → Home shows those three read-only with a link; `maxSlides` and the section title remain in Settings because they have no duplicate editor. The Banners page hides `HOME_HERO`/`HOME_HIGHLIGHTS` rows and blocks those placements (the API stays backward compatible).
- Retired duplicate editors: `payout.holdHours` (alias of `return.windowHours`) and `wallet.deliveryChargeRecipient` (unused) are `wired:false` and hidden from Settings; the alias remains for old clients/history.
- Money-risk overlaps were documented, not merged: payouts vs withdrawals (same `Payout` model, manual vs requested queues), refunds vs advance-refunds (`Payment` vs `PaymentIntent`/ledger), payments vs advance-payments, complaints/disputes (one `Complaint` model), review vs content reports.
- Tests: `admin-consolidation.spec.ts` 4/4, `settings.spec.ts` 3/3, `admin-highlights*.spec.ts` 2/2, route manifest 5/5. Shared contrast fixes: inactive tab text and the "Active" settings chip now pass WCAG AA; the Highlights focal-point button/hex input/link select have accessible names. No permissions or money behavior changed.

## 2026-11-21 dev/prod safety and uploads

- Non-production visibility: a server `DevRibbon` (hidden when `NODE_ENV=production`) is on admin, seller, checkout and the payment page; the payment page also shows an inline test-environment alert. Dev keeps its stored values untouched.
- Production env validation: in `NODE_ENV=production` the schema now rejects localhost/non-https APP/API/CORS origins, `.local` mail, weak/default JWT/encryption/admin credentials, dev test admin emails, plus the existing Cloudinary `/prod` folder and storage-driver checks. Nine env tests (11 with the baseline) pass. The production settings baseline script (`scripts/prod-settings-baseline.ts`) is dry-run by default, requires https API + admin creds, empties both provider numbers, turns Advance/providers OFF and COD ON, and never prints a number. It was not run against any production database.
- Upload tracking backfill: idempotent `scripts/backfill-uploaded-assets.ts` (dry-run default, ATTACHED-only). Run on dev: 109 rows created (98 ProductImage + 11 Category); reconciliation now shows 118 DB URL rows and only 3 untracked (one broken local avatar file, two external picsum URLs). The broken avatar renders the existing Radix initials fallback; no record deleted.
- Abuse limits: added per-minute throttles to payment submission (30), image upload (30), seller document upload (10), withdrawal request (20), complaint creation (20) and checkout (20), with a reflection test (`test/rate-limits.e2e-spec.ts`, 6/6). Admin auth lockout and auth/refresh/realtime/search limits already existed.
- Secrets: `npm run secrets:check` passes on the working tree. Git history still contains the Cloudinary API secret in `.env.example` at `35675ba` (removed in `d9b49aa`); rotation remains an OWNER ACTION. No secret value is copied to docs.

## 2026-11-21 merge readiness, pre-launch and quality

- Both feature branches are ahead of `main` with `main` as an ancestor; `git merge --ff-only` is the safe merge. `git merge-tree --write-tree main <feature>` produced 0 conflicts (backend tree 330efa17b8…, frontend tree 97b8fac12b…). Nothing was pushed to main. `docs/MERGE-PLAN.md` records migrations (6 additive), env keys, rollout, rollback and owner-uncommitted files.
- `docs/pre-launch.md` records production env rules (enforced by the schema), health/readiness, job inventory, backup/restore rehearsal on the test DB, email/SMS scope (SMTP for auth mail only; no SMS), payment operations, CSP/realtime and OWNER ACTIONS. Policy pages now show a visible "DRAFT POLICY - REVIEW WITH A LAWYER BEFORE LAUNCH" note; no legal claim was invented.
- Quality: removed the unused-variable warnings (BASE/addresses/priceLabel/ADMIN_*/added); the two React Compiler warnings are react-hook-form `watch()` skips, documented rather than risky refactors. A native JS-disabled check confirmed the hero search is a GET `/products` form and `/products?q=aloe` still server-renders cards. The Date.now prerender warning did not reproduce.
- Performance remains the open item: no code was changed, so the documented 2026-11-20 medians stay authoritative; a fresh CDP run was not performed in this pass.

## 2026-11-21 seller panel and padding decision

- The one-row header keeps a 12 px gutter below `sm` (needed for logo/search/bell/cart/avatar at 360) while content uses 16 px; the e2e now asserts 12 at 390 and 16 at 1280. Measured and passed 4/4 after the correction; no visual regression.
- Seller payout methods: new destinations now offer only the canonical `payout.methods` set (BKASH/NAGAD/BANK); ROCKET was selectable but not usable by withdrawals. Existing rows still render. Seller overlap list is in `admin-audit.md`.
- Performance spot check (no code change): home LCP median 2656 ms/3240 ms at 390/1440, CLS 0.0001, script transfer 401 KB; P1-1 remains open because no median improved and the full matrix/levers were not run.

## 2026-11-21 Task 1 - dispute response photos and delivery proof

- Cause/gap: the models already had `ShopOrder.deliveryProofUrl` and customer `ComplaintAttachment`, but there was no seller response-photo storage, no multi-photo delivery proof, no UI upload path and no attach-lifecycle coverage. False earlier claim corrected: tests force local storage, so the Cloudinary proof script had not actually exercised Cloudinary until `resolveStorageDriver` was changed to honour an explicit `STORAGE_DRIVER=cloudinary` in a test process (default remains local).
- Additive migration `20261121120000_delivery_proof_and_response_photos` adds `ShopOrderDeliveryProof` (1-3 photos; first also copied to `ShopOrder.deliveryProofUrl`) and `ComplaintCommentAttachment` (seller response photos; max from `return.maxEvidencePhotos`). Applied to dev and `planthaat_test` via `db:migrate:all`.
- Delivery proof: TransitionOrderDto carries `deliveryProofUrls` (max 3); service validates ownership (`UploadedAsset.ownerId` for sellers), the new `order.deliveryProofRequired` flag, writes rows + `attachAssetsInTransaction` in the DELIVERED transaction. Buyer order page and admin dispute view render the proofs; seller sees them on their order page.
- Response photos: seller comment DTO accepts up to 20 (service enforces the configured max); validated owner/deadline/decision, stored as comment attachments in the same transaction as the status update; included in buyer, seller and admin timelines. No ledger/release/commission math changed.
- Tests: backend `settlement.e2e-spec` new delivery/response cases 2/2 (ownership, required flag, max, deadline, ATTACHED, buyer/admin visibility); `storage.module` 5/5 (explicit test opt-in); upload registry/persistence guards 5/5. Real Chrome e2e `evidence-proof-ui.spec` 1/1: seller uploads delivery proof + response photo via the real UI, buyer/admin views, 1280/360, axe clean, no overflow. Cloudinary proof script re-run after the storage fix: 1/1 through `planthaat/teststack`. `uploads:smoke` passed with the rotated credentials (public 200, private unsigned 404, signed 200, deleted 404).

## 2026-11-21 header/navigation decisions

- **One language control.** The header owns the only `En | বাং` toggle; the seller/admin dashboard header has the same component once. Footer, account menu, mobile menu and auth/settings pages carry no language control. Switching writes the locale cookie and performs one document reload rather than a client `router.refresh()`: it is deterministic across cached/prerendered routes, keeps path/query/hash, and a `sessionStorage` scroll value plus native restoration keeps the reader's place. The reload is a UX trade-off accepted for reliability.
- **Guest chrome.** Guest header shows logo/search/toggle/cart/text "Log in"; Register is only on the login/register pages. Mobile bottom nav hides Account for guests but keeps Orders (opens login). This preserves a familiar path to order tracking without exposing a private profile tab.
- **Auth hint cookie.** `ph_has_session=1` is a client-only layout hint, not a session or permission source. It is written after a successful `/auth/me`/login and cleared on logout/session-expired; API authorization is unchanged. Header controls render a neutral reserved-size placeholder while `/auth/me` is pending, so a signed-in user never sees "Log in" flash.
- **Notifications panel.** Bell is a `button` with `aria-expanded`/`aria-controls`; desktop uses a Radix popover and mobile a Radix dialog bottom sheet. The URL is unchanged. Rows reuse the `/notifications` href/type logic through `notification-content.ts`. Unread badge caps at `9+`; the aria label still exposes the real count. Opening triggers a refresh; polling runs at 30s while open and realtime invalidation uses the existing `["notifications"]` prefix. No notification is mutated by simply opening the panel.
- **Owner files.** All owner-uncommitted backend/frontend files were preserved, not staged or reverted. A checksummed archive (`_owner-files-archive/planthaat-item4-2026-11-21.zip`) holds copies and diffs so the owner can finish them before the merge.

## 2026-11-21 performance decisions

- **Measure before changing.** The production baseline was captured before any code edit on the same Slow 4G/4x-CPU harness; raw runs are temporary `.artifacts/` evidence only. Kept changes must improve at least one route median and must not add JS chunks/bytes.
- **Hero preload in the shell.** The palm is the home LCP. Its preload moved from the hero subtree (HTML byte ~286k) to an early static `HeroPreload` (~byte 302), removing the dependency on settings/highlights streaming. The admin hero-image override still renders; in that rare case the palm preload is a small unused fetch, accepted for the default scene.
- **Taka/label font subset.** English pages downloaded full Hind 400+600 for the taka sign and the `বাং` toggle label. A 3 KB font subset (U+09F3, U+0982, U+09AC, U+09BE) generated offline with fontTools is now first for those glyphs in `--font-sans`/`--font-heading`/`--font-bangla`; English total fonts 195 KB -> 51.6 KB and no full Hind is requested. Bangla still uses Hind; no dependency was added to the app.
- **Catalog first-four priority.** Only the first four cards (two mobile rows / first desktop row) are priority; this improved catalog 390 by 18-29%. Desktop 1440 remains Cloudinary-variant sensitive, so no additional priority was added.
- **Session split reverted.** Dynamic-importing the session-expired dialog/form was expected to remove RHF/zod but Next fetched the extra chunk on load: JS +11 KB and one extra chunk, no LCP change. Reverted, and recorded so it is not retried without a chunk-avoidance design.
- **No auth/realtime/toaster deferral.** Realtime already no-ops for guests and lazy-loads socket.io; `/auth/me` is the no-flash header source. Deferring the toaster/auth only moves code after hydration without measured wins and risks missing early user feedback.
- **Budget guard.** `check:bundle` enforces gzip per-route limits from the build manifests; home/CLS coverage was added to the existing CLS spec. No new dependencies. `/products` API p50 356 ms is not changed without EXPLAIN-backed index evidence.

## 2026-11-21 seller panel decisions

- **One page shell.** Every seller route uses `PageContainer` + `PageHeader`; the shell breadcrumb is non-heading text. Detail pages keep the same header with back links. This removes the previous mix of 20px/24px ad-hoc headings and guarantees one `h1`.
- **Payout destination canonical editor.** `/seller/payout-accounts` is the only editor. The earnings page keeps withdrawal/ledger/balance and links to it; the duplicate Payout profile tab and unused `EarningsClient` were removed. Withdrawal money logic was not moved.
- **Approved sellers do not apply twice.** The Apply nav item is hidden for `sellerStatus=APPROVED`; `/seller/apply` still handles DRAFT/REJECTED/history and shows the approved notice with a dashboard link. The standalone route gets a back-to-home link.
- **Destructive confirmation.** Product, delivery-zone and payout-account deletes use `AlertDialog` with a consequence sentence; the native `window.confirm` and immediate deletes were removed.
- **Feedback and lists.** Shared `EmptyState`/`QueryError` replace bare empty/error paragraphs; skeletons and existing status/Price/FormField components remain authoritative.
- **Kept separations.** Shop vs onboarding, earnings/withdrawals vs payout accounts, the three order lifecycle queues, and the product/variant editor are intentionally separate; they are recorded in `seller-audit.md` rather than merged. No endpoint, permission, money rule or migration changed.

## 2026-11-22 performance regression decisions

- **Replay images for attribution.** The old report could not separate code from Cloudinary TTFB. All bisect/final runs record image responses once and replay them locally; document TTFB and LCP-resource TTFB remain separate metrics. This is the method for the new guard as well.
- **Do not revert the font/priority commit on an unreproducible number.** The font/priority commit showed a catalog 1440 anomaly in its worktree, but the current tip with the same public font/priority code measured 2460/2508 ms vs the pre-commit 3064/2768. PDP/cart/checkout also returned to pre-regression ranges when image timing was controlled. No font or priority revert was kept; the earlier regression was not proven as a code cause.
- **Cart preload kept.** Cart bn LCP is the first cart-line image. The server now `preload()`s that image from the server-rendered cart and the first line is priority; cart 390 median is 2408 bn / 2172 en with CLS unchanged. This is a presentation-only change; no cart/price logic changed.
- **Guard thresholds.** The Playwright guard uses target + 10% margin where the owner target is exact (cart/checkout 2.75 s vs 2.5 s), 3.3 s for PDP/catalog desktop and 3.8 s for home. A later regression fails the serial suite; the margin is documented rather than silently weakening the target.
- **Remaining known limit.** PDP desktop LCP is render-delay bound (image load 368 ms, render delay ~2.2 s), so it is near but not below the old 2408 ms en median; Bangla fonts remain 198 KB. No dependency, backend or money change was made.

## 2026-11-22 Admin/seller dashboard Phase 1

- **Phase selection.** The instruction names no phase on the final line, so Phase 1 (the additive foundation) was chosen; Phases 2-4 depend on its kit/API and cannot be started safely without it.
- **Hand-built SVG, not Recharts.** Recharts is installed but unimported: SVG primitives are smaller, fully keyboard/live-region accessible and avoid a vendor bundle on private routes. Public routes cannot import them (bundle + isolation guards).
- **One time model.** Today/7d/30d/90d/custom, inclusive Asia/Dhaka calendar days (fixed +06:00), previous equal-length period, series capped at <= 90 points (weekly beyond 90 days, monthly beyond 2 years). Prisma stores 	imestamp UTC, so SQL converts AT TIME ZONE 'UTC' then AT TIME ZONE 'Asia/Dhaka'; the test asserts the 20:00Z -> next-Dhaka-day boundary.
- **Read-only aggregates.** New GET /admin/analytics/panels and /seller/analytics/panels reuse existing models/services (including LedgerService.balances for wallet buckets) and never write. A 30 s in-process cache is skipped under NODE_ENV=test; no tags because Phase 1 has no mutation hooks (30 s staleness is documented).
- **Consistency over new indexes.** Tests assert series totals equal the existing overview/table totals and conservation equals the A5 formula. No migration or index was added: existing (status, createdAt), (shopId, status, createdAt) and order indexes cover the ranges; an index requires EXPLAIN ANALYZE evidence first.
- **Charts can lose no information.** Every chart has a summary and a data-table toggle; KPIs link to the underlying list/detail. The Phase 1 page inventory in rontend/docs/FRONTEND_DESIGN.md §6.8.4 is the retention checklist for Phases 2-4.
- **Animated tabs.** ARIA tabs + measured transform/width indicator, lazy panels kept after first visit, URL query sync via useSyncExternalStore + history.replaceState (no navigation), reduced-motion instant switch. Panels are force-mounted after first visit so state is preserved.
- **Preview route.** /dev/dashboard-kit returns 404 when NODE_ENV=production and is disallowed in robots; Next still compiles the route, so "excluded from production" means never served and never imported by public routes.
- **Synthetic data safety.** db:seed:dashboard-kit loads .env.test itself, refuses anything but planthaat_test, is idempotent (marker shop) and has a marker-based cleanup. It is not run against dev; dev settings/data were untouched.
- **Phase 1 close-out QA (2026-11-22).** Re-viewing the kit at 1280/360 in real Chrome changed three implementation choices: charts measure their container instead of using a fixed viewBox (fixed viewBoxes halved axis text on phones and clipped ranking labels); x ticks are evenly rounded indices so the last two labels never collide; horizontal rankings get a dynamic label gutter with ellipsis (the exact value remains in the tooltip and data table). The Bengali development ribbon and five seller/admin strings were literal `?` in `bn.json`, and the admin reconciliation counter rendered `?` when no count exists; these were fixed in the same QA pass because they are visible defects on the pages being inventoried, not new features. Baselines for the pre-redesign dashboard routes are in `frontend/docs/design/performance.md`.

## 2026-11-22 Admin/seller dashboard Phase 2

- **Additive order-list projection.** `GET /admin/orders?view=summary` returns only list fields (identity/status/total/item count/shop/order payment fields); the detail endpoint keeps the full include. Rationale: the admin list was loading status history, payments and delivery proofs for every row (API p95 2.8 s); omitting the parameter preserves every existing caller.
- **Server first paint.** Orders (summary + panels) and the dashboard/health strips fetch on the server and seed TanStack Query. Failures fall back to the existing client loading/error path, so there is still one source of truth and no blank screens.
- **No new indexes or migrations.** The existing `(shopId,status,createdAt)`/order indexes cover the new summary query; an index still requires EXPLAIN ANALYZE evidence on `planthaat_test`.
- **Reconciliation composition uses the panels source.** The bucket donut/ranking are computed from the same all-time ledger aggregates as the A5 conservation total, so the chart total equals the settlement total; reserved/paid-out amounts that the DTO does not expose are shown as "Other" rather than guessed per bucket.
- **Charts are still hand-built SVG.** No dependency was added; `recharts` remains unimported. Every chart has a text summary, a data table/CSV and keyboard focus, and uses colour + shape/texture.
- **Shared strip, not per-page copies.** One `AnalyticsStrip` (period + KPIs + one chart) is reused on refunds/withdrawals/complaints/commission-rules; its numbers match the dashboard because both call the same read-only panels endpoint for the same instants.
- **Performance target honesty.** The Phase 2 target (`<=2.5 s` every admin page) is not fully met on the synthetic rich-data stack; the measured before/after, the LCP element (Bengali H1 after the Hind swap, or client-rendered settings/list content) and the remaining levers are recorded in `frontend/docs/design/performance.md` rather than claimed as met.
- **Page headers.** Admin list pages use `PageContainer` + `PageHeader`; detail components keep their own single `h1` (they already have one and their action headers are part of the detail layout). Settings uses `AnimatedTabs` with URL-synced groups; the unsaved guard, re-auth and history are unchanged.

## 2026-11-22 Seller dashboard Phase 3

- **Reuse the Phase 1 kit and seller panels endpoint.** No second analytics API and no new dependency; every chart has a summary, data table/CSV, keyboard focus and colour+shape/texture encoding.
- **Server-seed the slow seller surfaces.** Seller orders (first page + panels), wallet and products are fetched on the server and seed TanStack Query; failures fall back to the existing client states. This is what moved seller orders 390 from 5.6 s to 2.7 s and wallet from 5.0 s to 2.4 s.
- **Keep legacy counters.** Pending/stuck orders, unanswered questions, low-stock variants, unread notifications, application status, shop summary and quick links remain reachable on the dashboard; the new widgets are additive.
- **Action queue = real statuses.** Each tile links to the already-filtered seller list (`?status=PENDING`, `/seller/questions`, `/seller/products`, `/seller/notifications`); no counters are invented.
- **Wallet composition honesty.** The donut shows available+pending+on-hold as the balance; COD dues are a separate receivable shown with a gauge against the configured limit, not mixed into the donut total. Amounts use `<Price>`/`formatBdt`.
- **Mobile-first strips.** Horizontal snap rails with a focusable labelled region, larger targets and no page overflow at 360; tables become cards below `md`.
- **Known limits recorded, not hidden.** Products LCP is product-list imagery, analytics was not rebuilt, and the remaining pages without supporting series keep their existing layout rather than adding fake charts.

## 2026-11-22 Dashboard server range fix

- **Root cause:** with `cacheComponents: true`, Next 16 tried to prerender the `/admin` shell and rejected `new Date()` inside `presetBounds` ("blocking route"). Server pages passed a dashboard range straight into the panels prefetch, so the clock was read before any dynamic access.
- **Fix:** Server Components now use `resolveDashboardRange()` (`src/server/dashboard-range.ts`), which calls `await connection()` before `presetBounds`; the panels helpers no longer default-evaluate a range. Client components keep `presetBounds` for their local fallback, but the server always supplies `initialRange`, so the fallback is never executed during SSR.
- **Guard:** `tests/dashboard-server-range.test.ts` fails if an admin/seller `page.tsx` or a server analytics helper calls `presetBounds`, and asserts `connection()` precedes the clock read in the server helper.

## 2026-11-23 dashboard UI/UX polish

- **Audit before edits.** The live Fernly reference and current panels were inspected in real Chrome at 1440/1280/768/390/360; the attached image was unavailable, so the brief's characteristics plus measured evidence were used. Findings and the design direction are recorded in `frontend/docs/design/dashboard-guide.md` �7.
- **No new dependency.** The existing hand-built SVG kit and Tailwind/Radix motion are reused; `recharts` remains unimported. Motion is CSS-only (220 ms opacity chart entrance, 200 ms transform tab indicator, 300 ms scaleX progress, 200 ms sidebar colour).
- **Tablet rail instead of a drawer at 768.** The sidebar becomes an 80 px icon rail at md with focus/hover tooltips and an 80 px offset; the drawer is <md. This keeps persistent context on tablets without a second navigation model.
- **Mobile KPI 2-col grid, not a hidden swipe rail.** The previous swipe strip hid metrics; the new 2-col grid is discoverable and the page is shortened elsewhere by nested tabs. This is a deliberate reversal of the earlier swipe-strip choice for this dashboard.
- **Details on demand.** Secondary analytics and top lists moved into nested tabs (URL-synced), reducing admin mobile from 7,327 to 5,018 px while keeping every chart/table one click away; recent orders are server-seeded real rows.
- **Approved sellers get a compact status line.** The full card remains for DRAFT/PENDING/REJECTED/SUSPENDED with its notice/CTA; no status information is removed.
- **One broken link removed.** The seller "Unread notifications" tile pointed at a non-existent `/seller/notifications` (404); it is now a non-link tile and the shared bell remains the surface.
- **Performance trade-off recorded.** Seller dashboard LCP is +5%/+9% due to the added featured KPI/queue/recent orders; admin/orders and seller/orders improved. Public routes and bundles are unchanged.

## 2026-11-23 dashboard completion and streaming fix

- **Reference image available.** `frontend/docs/reference/dashboard-reference.png` was reviewed. Adopted compact card rhythm, donut+legend, horizontal progress and circular rating gauges; deliberately did not copy its pastel palette, 14 px radii, always-icon sidebar, concentric level rings or decorative diagonal bars (no real metric / PlantHaat token rules). Differences logged in `dashboard-guide.md`.
- **LCP root cause was the data await, not the font.** The H1 was blocked until the panels + recent-orders prefetch resolved (DOM ~4.2 s, font already loaded). Pages now stream `PageHeader` and suspend the data section with sized skeletons; the range resolves inside the child. Result: admin 2.32/2.11 s, admin orders 2.17/2.05, complaints 2.15/1.95, seller dashboard 2.26/2.06, seller orders 2.16/2.34 (1440/390, 7-run medians). Orders KPI prices were reduced from 30 px to 20 px to stop a late price becoming LCP.
- **No new dependency.** Motion remains CSS-only; chart entrance is opacity-only; tab indicator is transform-only; progress uses scaleX; reduced motion is instant.
- **Remaining list pages.** Visuals were added only where an aggregate series exists (products inventory, sellers/users growth, advance verification, refunds). Other list/detail pages keep their tables, filters, forms and actions; the checklist is ticked with that note rather than fabricating charts. Seller payout destination validation now enforces BD mobile numbers for bKash/Nagad inline; the canonical page shows API errors inline.
- **Regression.** Money group: 24 passed in the serial run; the 3 failures were fixed (complaints filtered-query seed, canonical payout-account test path/validation, reconciliation passes on a clean test DB). Other suites: Vitest 116/116 (run after a flaky worker start), typecheck/lint/build/bundle green. Header-nav/access-control/session specs that use dev-only demo credentials/data were run on the isolated stack and produced environment failures; they are not redesign regressions and need the dev demo seed to be re-run.
- **Public bundles** moved +1 KB (374/388/404/373/360) because the new admin/seller UI strings live in the shared locale messages; still inside the existing budgets.

## 2026-11-23 regression-closure decisions

- **Seed the isolated stack, do not weaken the suites.** The security specs depend on real demo accounts,
  a shop, a product, a cart and an address. Rather than skip/mock them, `test-stack.ps1 start` now runs an
  idempotent `[seed:e2e-demo]` fixture on the test DB only. Demo credentials stay in the repo for local
  isolated runs; they are never used on dev or production.
- **Validate at the write path and keep legacy rows readable.** Payout destinations are normalized and
  validated on create/save (BD mobile or 6-34 bank digits, per-field errors). Old invalid rows are not
  silently rewritten: they return `needsUpdate` and block withdrawal with `PAYOUT_DESTINATION_INVALID`
  until the seller fixes the destination. No balance, ledger, commission or release rule changed.
- **Seller mobile hides secondary analytics behind one explicit control.** "Performance & orders" is
  collapsed by default on mobile and always visible at `lg`; the wallet snapshot keeps amounts but shows
  its donut/gauge only at `lg`. This removed ~1,140 px (4,605 -> 3,466 at 390) without deleting a metric:
  the trend and order breakdown stay one tap away with `aria-expanded` and keyboard support.
- **Motion stays paint-free.** The sidebar hover/active surface is now an opacity overlay (the active
  indicator is a static bar), the tab indicator is transform-only, and the tab trigger no longer animates
  colour. Reduced motion keeps the instant state; a tab switch trace measured 0 layout shift and no long
  tasks.


## 2026-11-23 cancellation/cart, session and header decisions

- **Do not add a cancellation→cart path; pin the invariant.** The reported automatic restoration did not
  exist in code, so the fix is a regression test on all three realistic cancellation paths (expiry,
  customer, admin) rather than inventing a cart write. The cart stays independent; "buy again" remains
  an explicit future/user action only.
- **The session dialog is a handoff, not a second login form.** Detection/refresh/single-flight/proxy
  behavior stays untouched; the dialog only links to the canonical login page with `returnTo` and the
  `reason`. Login from that page clears the query cache and does a full document load, preserving the
  old account-switch isolation without duplicating the login UI.
- **Session hint is server-read layout data.** `ph_has_session` is read in the root locale boundary and
  passed to `AuthProvider`; it only chooses 44 px signed-in placeholders while `/auth/me` resolves.
  Authorization remains API-only. No arbitrary timeouts or visibility hacks.
- **Locale switching is a soft refresh.** `useTransition` + `router.refresh()` keeps the header, URL,
  query, hash and scroll; a full reload was the regression that made the navbar disappear on every
  language switch.
- **The flag is two circles, not two pills.** A 68x44 touch target contains a 36 px track and two
  30x30 px segments, so the active state is a perfect circle at every breakpoint.


## 2026-11-24 typography, tabs, order filters and passwords

- **Taka is a currency subset, not a text family.** Leading the Bangla stacks with it caused per-glyph
  fallback and broke conjunct shaping. Keep it scoped to the taka sign and the language label.
- **Never carry inactive tab panels visibly.** `forceMount` keeps data/state but requires an explicit
  `data-[state=inactive]:hidden`; otherwise old panels stack and labels look clipped. The mobile mask was
  removed because it faded real labels at the scroll edges.
- **Overall status filtering belongs in Prisma.** Filtering only the current page client-side would make
  counts and pagination lie. The relation predicates mirror `computeOverallStatus`; PARTIAL is a real
  customer-facing status.
- **Strong passwords apply only when a password is created.** Login remains compatible with existing
  accounts; the shared character-class rule is mirrored in frontend helper/UI and backend DTOs.


## 2026-11-24 order count aggregate and indicator geometry

- **One count query, not nine.** `/orders/status-counts` groups by the same overall-status CASE and is
  scoped to the customer; the UI never fetches all orders or makes per-tab requests.
- **Do not scale a rounded indicator.** `scaleX` changed the pill radius and left visible gaps; measure
  the trigger and set its width. Observe triggers (not only the list) because badges/fonts change their
  widths and can move later tabs.
- **44 px trigger.** The indicator and trigger are both 44 px; the list is 52 px. This preserves labels,
  horizontal scroll and the existing visual system while meeting the touch target.


## 2026-11-25 delivery/wallet/seller decisions

- **Two conditions, one table.** Reusing `ShopDeliveryZone` with an optional `condition` keeps legacy rows safe (multiple NULLs allowed) while new rows are unique per shop/condition. No order rows are rewritten; historical district/fee snapshots remain.
- **Condition is server-derived.** `District.insideDhaka` is the source of truth; checkout never trusts a client-selected category. Payment mode is enforced by every shop in the cart, not just the UI.
- **Legacy zones are a fallback only.** Old shops without conditions keep their cheapest/covered legacy fee and both methods; the seller UI writes the two conditions. No district links are exposed in the new UI.
- **Rocket/Upay are manual wallets.** They are provider strings plus settings numbers; no fake success/auto-verification. Admin verification remains the only path to PAID.


## 2026-11-25 delivery backfill mapping

- Legacy zones are a source for a **representative** fee, not a district-by-district clone. The cheapest matching zone wins; explicit Dhaka/non-Dhaka coverage outranks nationwide for the relevant condition. This avoids inventing district-level conditions while preserving a real charge/threshold/ETA.
- Condition rows are insert-only. `NOT EXISTS` + unique `(shopId, condition)` makes the migration rerunnable; existing seller customization is never touched.

## 2026-11-26 courier delivery quote decisions

- **Courier rate is the customer price.** Seller-entered condition charges are retained only for history;
  `DeliveryQuoteService` returns courier charge + per-product seller extra. If free delivery applies, the
  customer total is 0 and the seller bears the courier cost.
- **Live is gated.** `delivery.quote.live.enabled` defaults false and is only read server-side. The client
  never reaches Steadfast. A stale cache is always preferred over the admin fallback; overrides always win
  and are never auto-refreshed.
- **No invented price.** `delivery.fallback.* = 0` means unset. If nothing can price a route the quote is
  unavailable with a reason (`ADDRESS_THANA_REQUIRED`, `SHOP_PICKUP_INCOMPLETE`, `DISTRICT_UNMAPPED`,
  `NO_RATE`, `ROUTE_UNAVAILABLE`), and checkout is blocked per shop instead of showing zero.
- **Dhaka is per-thana.** `District.steadfastLocationId` stays null for Dhaka; `Address.thanaId` and
  `Shop.pickupThanaId` decide 1 (City) vs 18 (Sub-Urban). Every seeded Dhaka zone is
  `DEFAULT_UNVERIFIED` and editable at `/admin/delivery-rates`.
- **Snapshot, don't re-derive history.** The order stores `courierCharge`, `sellerExtraCharge`,
  `parcelWeightKg`, `courierLane`, `quoteSource`, `quoteFetchedAt` and `freeDeliveryApplied`;
  `deliveryCharge` remains the amount the customer actually paid.
- **Charge-change guard.** Checkout accepts `expectedDeliveryTotal`; a mismatch is a 409
  `DELIVERY_CHARGE_CHANGED` with the new totals before any write, so the same Idempotency-Key can be retried.

## 2026-11-26 thana selectability and fallback sentinel

- **Do not delete lookup rows.** Steadfast/Packzy includes placeholder or non-address rows. `Thana.selectableByCustomer` (default true) hides them from customer/seller selects without deleting or breaking existing references; `Zone Not Clear` (id 594) is the only one disabled now. Other suspects are listed for owner review rather than guessed.
- **Duplicate names keep both ids.** Customer/seller selects de-duplicate by normalized name and keep the first id; the admin editor still lists every Steadfast id, so both remain resolvable and auditable.
- **0 is the unset fallback sentinel.** The settings registry stores JSON numbers and cannot store null/NULL, so `delivery.fallback.* = 0` means unset (checkout blocked with `NO_RATE`, never a free charge). Negative and non-integer fallbacks are rejected.
- **Settlement naming:** Prompt 2 = courier connection/booking/pickup/webhook/status; Prompt 3 = settlement/dues/reconciliation; Prompt 4 = tracking UI/manual tracking/dashboards.

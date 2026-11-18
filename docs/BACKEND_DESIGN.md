# PlantHaat — Backend Design Document

Audience: the AI coding agent that will build the backend, and the developer reviewing it.
Companion files: `BACKEND_CONTEXT.md` (working rules + progress log), `prisma/schema.prisma` (authoritative data model).

PlantHaat is a **multi-vendor online plant marketplace for Bangladesh**. Verified nurseries run their own shops; customers buy from many shops in one checkout; admins verify sellers and handle disputes. PlantHaat does not own inventory.

---

## 0. Scope

| Area | v1 status |
|---|---|
| Auth, users, addresses, locations | Implement |
| Seller onboarding, verification, shops, delivery zones | Implement |
| Categories, products, variants, images, inventory, search | Implement |
| Cart, checkout, multi-shop orders, order state machine | Implement (COD only) |
| Cancellation requests, wishlist, reviews, complaints, refund tracking | Implement |
| Commission, seller ledger, manual payouts | Implement |
| In-app notifications + transactional email | Implement |
| Admin: moderation, content, announcements, settings, audit log, analytics | Implement |
| Online payment (PipaPay/bKash/etc.) | **Schema + provider interface only. Do not implement.** Gateway docs will be supplied later. |
| Messaging (customer ↔ seller) | **Schema only (`Conversation`, `Message`). No module, no endpoints.** |
| Coupons, courier integration, loyalty, blog | Out of scope (extension points listed in §11) |

Frontend (Next.js) is built **after** the backend is complete. The API contract here is what the frontend will consume.

---

## 1. Tech stack

- Node.js LTS, **NestJS** (TypeScript, `strict: true`), **PostgreSQL**, **Prisma ORM**.
- Recommended libraries (substitute only with a logged reason): `@nestjs/config` + `zod` (env validation), `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt`, `argon2` (fallback `bcrypt`, cost 12), `cookie-parser`, `helmet`, `@nestjs/throttler`, `@nestjs/swagger`, `@nestjs/schedule`, `@nestjs/event-emitter`, `class-validator` + `class-transformer`, `nodemailer`, `multer` + `sharp`, `slugify`, `nestjs-pino` (or Nest Logger), `jest` + `supertest`.
- API prefix `/api/v1`. Swagger UI at `/api/docs` (disabled in production unless `ENABLE_SWAGGER=true`).
- Money: `Decimal(12,2)` BDT. Use Prisma `Decimal` (decimal.js) for all arithmetic. Never `number` for money.
- IDs: UUID strings. Timestamps: UTC.

---

## 2. Architecture & conventions

### 2.1 Folder structure
```
src/
  main.ts  app.module.ts
  config/            # env schema (zod), typed config
  prisma/            # PrismaModule, PrismaService
  common/
    decorators/      # @Public, @Roles, @CurrentUser
    guards/          # JwtAuthGuard (global), RolesGuard, SellerApprovedGuard, OriginGuard
    filters/         # AllExceptionsFilter (error envelope)
    interceptors/    # ResponseEnvelopeInterceptor, logging
    pipes/ dto/      # pagination DTO, id param pipes
    utils/           # money, slug, order-number, crypto (sha256, AES-GCM), phone
  modules/
    auth/ users/ addresses/ locations/ sellers/ shops/ delivery/ categories/
    products/ inventory/ cart/ orders/ cancellations/ wishlist/ reviews/ complaints/
    commissions/ ledger/ payouts/ refunds/ notifications/ mail/ uploads/
    announcements/ content/ settings/ audit/ analytics/ admin/ health/
    payments/        # provider interface + COD handling only (gateway adapters later)
    messaging/       # EMPTY placeholder folder with README noting schema-only
prisma/ schema.prisma  migrations/  seed.ts  seed-demo.ts
test/                # e2e
```
One NestJS module per domain; controllers thin, logic in services; DTOs for every input; never return Prisma entities containing secrets (`passwordHash`, token hashes, `accountNumberEnc`) — use explicit response mappers/select.

### 2.2 Response envelope
Success: `{ "success": true, "data": <payload>, "meta": { "page", "limit", "total", "totalPages" } }` (`meta` only for lists).
Error: `{ "success": false, "statusCode": 422, "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": [...] }, "path": "…", "timestamp": "…" }`.
Always use stable machine-readable `error.code` (SCREAMING_SNAKE). Full list in §3.8 and §4.

### 2.3 Cross-cutting rules
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Global `JwtAuthGuard`; routes opt out with `@Public()`. `RolesGuard` with `@Roles(Role.ADMIN)`.
- Pagination: `?page=1&limit=20` (max 50, default 20). Sorting via whitelisted `sort` keys only.
- All multi-row writes use `prisma.$transaction`. Stock changes use conditional updates (§4.5).
- Soft delete (`deletedAt`) for `User`, `Product`; every query filters `deletedAt: null`.
- Config only from env; fail fast on invalid env at boot.
- No `console.log`; structured logger; never log cookies, tokens, passwords, or full payment payloads.
- Domain events (`@nestjs/event-emitter`): `order.placed`, `order.status_changed`, `seller.approved`, `seller.rejected`, `product.moderated`, `complaint.updated`, etc. Listeners create notifications/emails so services stay decoupled.
- Phone numbers: normalize to `+8801XXXXXXXXX`; accept `01XXXXXXXXX`, `8801…`, `+8801…` matching `^(?:\+?88)?01[3-9]\d{8}$`.

---

## 3. Authentication & Authorization

### 3.1 Goals
JWT-based auth in **httpOnly cookies** with a short-lived access token and a long-lived rotating refresh token, so that an expired access token is renewed **silently** — the user never sees a failure and the frontend never hammers the API with doomed requests.

### 3.2 Tokens
| | Access token | Refresh token |
|---|---|---|
| Format | JWT HS256, claims `sub` (userId), `role`, `sid` (session id), `iss`, `aud`, `iat`, `exp` | Opaque: `<sessionId>.<48 random bytes base64url>` |
| Lifetime | 15 min (`JWT_ACCESS_TTL=900`) | 30 days (`REFRESH_TTL_DAYS=30`), sliding on rotation |
| Secret | `JWT_ACCESS_SECRET` | none — only `sha256(secret part)` stored in `RefreshSession.tokenHash` |
| Cookie | `ph_at`, `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`, `Max-Age=access TTL` | `ph_rt`, `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/api/v1/auth`, `Max-Age=30d` |

- Refresh cookie is scoped to `/api/v1/auth` so it is not sent with ordinary API calls.
- Optional `COOKIE_DOMAIN` env (e.g. `.planthaat.com` when frontend and API are on sibling subdomains). In local dev leave unset.
- `JwtStrategy` extracts the token from cookie `ph_at` first, then `Authorization: Bearer` (future mobile app).
- On every authenticated request `validate()` loads `{id, role, status}` by primary key; non-`ACTIVE` users get `403 ACCOUNT_SUSPENDED`. (Optimize with a short TTL cache later.)
- Login and refresh responses also return `accessTokenExpiresAt` (epoch ms) in the body so the client can refresh proactively.

### 3.3 Flows
**Register** (`POST /auth/register`): validate → argon2id hash → create `User(CUSTOMER)` → create email verification token (random 32 bytes, store sha256, TTL 24h) → send mail → auto-login (set cookies). Duplicate email → `409 EMAIL_ALREADY_REGISTERED`.

**Seller register** (`POST /auth/register/seller`): same, but `role=SELLER` and creates `SellerProfile(status=DRAFT)` in the same transaction. See §4.1.

**Login** (`POST /auth/login`): generic failure `401 INVALID_CREDENTIALS` (never reveal whether email exists). On 5 consecutive failures set `lockedUntil = now+15min` → `423 ACCOUNT_LOCKED`. On success reset counter, set `lastLoginAt`, create a new `RefreshSession` with a **new `familyId`**, set both cookies. Limit active sessions per user to 10 (revoke oldest).

**Refresh** (`POST /auth/refresh`, `@Public()`, reads `ph_rt` cookie only):
1. Parse `<sessionId>.<secret>`; load session. Not found/malformed → `401 INVALID_REFRESH_TOKEN`, clear cookies.
2. `timingSafeEqual(sha256(secret), tokenHash)` mismatch → revoke family (`TOKEN_MISMATCH`), `401`, clear cookies.
3. `revokedAt` set or `expiresAt < now` → `401 SESSION_EXPIRED`, clear cookies.
4. Load user; not `ACTIVE` → `403 ACCOUNT_SUSPENDED`, revoke session.
5. **Rotate atomically**: `updateMany({ where: { id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: now, lastUsedAt: now } })`.
   - `count === 1` → create new session (same `familyId`, new token, `expiresAt = now + 30d`), set `replacedById`, issue new access token (`sid` = new session), set **both** cookies, return `200`.
   - `count === 0` (token was already rotated) → **grace logic**: if `now - rotatedAt <= REFRESH_REUSE_GRACE_SECONDS` (default 10) it is a benign parallel request (several tabs/requests refreshed at once): issue a fresh **access token only** for the same user, do **not** touch the refresh cookie, return `200`. Otherwise it is token **reuse/theft**: revoke the entire family (`REUSE_DETECTED`), `401 REFRESH_TOKEN_REUSED`, clear cookies.

**Logout** (`POST /auth/logout`): revoke current session's family, clear cookies, always `204` even if no session.
**Logout all** (`POST /auth/logout-all`): revoke all of the user's sessions.
**Sessions**: `GET /auth/sessions` (device list from `userAgent`, `ipAddress`, `lastUsedAt`, `isCurrent`), `DELETE /auth/sessions/:id`.
**Me** (`GET /auth/me`): current user (safe fields) + `sellerStatus`/`shopId` if seller. Used by the frontend to bootstrap.
**Email verification**: `POST /auth/verify-email {token}`, `POST /auth/resend-verification` (throttled, 60s).
**Forgot password**: `POST /auth/forgot-password {email}` → always `200` generic message; if user exists create `PASSWORD_RESET` token (TTL 1h). `POST /auth/reset-password {token, newPassword}` → set hash, mark token used, **revoke all sessions**.
**Change password**: `POST /auth/change-password {currentPassword, newPassword}` → revoke all other sessions.
**Maintenance cron** (daily): delete sessions expired > 7 days ago and used/expired `AuthToken`s.

### 3.4 Password & account policy
Min 8 chars, must contain a letter and a digit, max 72. argon2id. Email lowercased + trimmed. Verified email required to **place orders** and to **submit a seller application**; browsing/cart do not require it.

### 3.5 Authorization
- Roles: `CUSTOMER`, `SELLER`, `ADMIN`. A seller can only use `/seller/*` routes when `SellerProfile.status = APPROVED` and their shop is `ACTIVE` (`SellerApprovedGuard`); onboarding endpoints (`/seller/application/*`) are allowed while `DRAFT`/`PENDING`/`REJECTED`.
- **Ownership is enforced in queries**, never by trusting IDs from the client: seller resolves `shopId` from the authenticated user's profile; customers only read their own orders/addresses/cart. Return `404` (not `403`) for other people's resources to avoid ID probing.
- Admin accounts are created by seed script or by another admin; they cannot self-register.

### 3.6 CSRF, CORS, cookies, client IP behind a BFF
Cookie auth requires CSRF discipline:
- `SameSite=Lax` on both cookies; all state-changing endpoints use `POST/PATCH/PUT/DELETE` (never mutate on `GET`).
- `OriginGuard` (global): for non-GET/HEAD/OPTIONS requests, require `Origin` (or `Referer`) host to be in `CORS_ORIGINS`; otherwise `403 ORIGIN_NOT_ALLOWED`. Requests without any `Origin` (server-to-server, curl) are allowed only if they carry `Authorization: Bearer` or are `@Public()`.
- CORS: explicit origin allow-list from `CORS_ORIGINS`, `credentials: true`, never `*`.
- Recommended deployment: Next.js proxies `/api/*` to the backend with `rewrites` so browser and API share one origin (no CORS, simpler cookies, works for SSR).
- **When the frontend runs behind a BFF (Next.js server), every browser request shares the BFF's IP.** The BFF forwards the real client IP as `X-Forwarded-For` together with a shared-secret header `X-BFF-Key: <BFF_SHARED_SECRET>`. The backend honors the forwarded header **only** when the key matches (constant-time compare); otherwise it uses the socket address and ignores all forwarded headers. Rate limiting, session `ipAddress` and audit records must use the resolved client IP. `BFF_SHARED_SECRET` is required in production (absent → plain socket address).

### 3.7 Rate limiting
`@nestjs/throttler`: global 100 req/min/IP. Stricter: `login` 10/min, `register` 5/hour, `forgot-password` 3/hour, `resend-verification` 3/hour, `refresh` 30/min. Use in-memory store now; abstract so Redis can be swapped in.

### 3.8 Auth error codes (HTTP 401 unless noted)
`UNAUTHENTICATED` (no token), `TOKEN_EXPIRED` (access JWT expired), `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `REFRESH_TOKEN_REUSED`, `ACCOUNT_SUSPENDED` (403), `ACCOUNT_LOCKED` (423), `EMAIL_NOT_VERIFIED` (403), `FORBIDDEN_ROLE` (403), `ORIGIN_NOT_ALLOWED` (403).
Implement by overriding `JwtAuthGuard.handleRequest` and mapping `TokenExpiredError` → `TOKEN_EXPIRED`.

### 3.9 Frontend contract (for the later Next.js phase — backend must support it)
- All requests use `credentials: 'include'`.
- API client wrapper: on a `401` whose code is `TOKEN_EXPIRED` or `UNAUTHENTICATED` (and the URL is not an `/auth/*` endpoint) → call `POST /auth/refresh` **once (single-flight: all concurrent failed requests await the same in-flight promise)** → retry the original request once. If refresh fails (`401`) → clear client auth state and redirect to login with `returnTo`.
- Proactive refresh: schedule a refresh ~60 s before `accessTokenExpiresAt` and on tab focus. Together with single-flight this means users never perceive expiry and the API is not hit repeatedly with expired tokens.
- Server components / middleware: if `ph_at` is missing/expired and `ph_rt` exists, the Next.js middleware calls refresh and forwards the new `Set-Cookie` headers.
- Never store tokens in `localStorage`/JS-readable storage.

---

## 4. Domain rules

### 4.1 Seller onboarding
`SellerStatus`: `DRAFT → PENDING → APPROVED | REJECTED`; `APPROVED ⇄ SUSPENDED`; `REJECTED → PENDING` (resubmit).
1. Seller registers → `SellerProfile(DRAFT)`.
2. Fills profile (`businessName`, type, phone, address, optional trade license no.), uploads documents (`SellerDocument`, private storage), creates shop details (`Shop(PENDING)`, unique slug) and at least one `ShopDeliveryZone`, adds payout account (optional at this stage).
3. `POST /seller/application/submit` validates completeness + verified email → `PENDING`, `submittedAt` set, notify admins.
4. Admin approves → `APPROVED`, `verifiedAt`, `Shop.status=ACTIVE`, `approvedAt`; role stays `SELLER`; notification + email. Admin rejects with `rejectionReason` → `REJECTED`.
5. Suspending a seller/shop hides all its products from public listing (query filters on `shop.status=ACTIVE` and seller `APPROVED`) and blocks new orders; existing open orders remain manageable by admin.
Only an **approved + active** shop appears publicly ("Verified Seller" badge = seller `APPROVED`).
Vacation mode: `isOnVacation=true` → products still visible but marked unavailable; checkout rejects with `SHOP_ON_VACATION`.
Payout account numbers are encrypted at rest (AES-256-GCM, key `DATA_ENCRYPTION_KEY`); API only returns `accountMasked`.

### 4.2 Categories
Two-level tree (parent/child). Public read; admin CRUD; cannot delete a category with products (deactivate instead). Each category carries an admin-managed `imageUrl` (uploaded via the `category` image purpose) returned unchanged by public `GET /categories` together with `name`, `nameBn`, `slug`, `sortOrder` and `children` (only active categories are returned publicly). `GET /categories` also returns a cheap `productCount` per node = number of **visible, in-stock** products in that category, with child categories rolled into the parent (one aggregate `groupBy`, no N+1). Seed defaults: Indoor Plants, Outdoor Plants, Flowering Plants, Fruit Plants, Herbs & Medicinal, Succulents & Cactus, Bonsai, Seeds, Pots & Planters, Soil & Fertilizer, Gardening Tools (with Bangla names).

### 4.3 Products & variants
- A product always has ≥ 1 active `ProductVariant` (size/pot options with own price and stock). Single-option plants get one variant named "Standard".
- Status flow: `DRAFT → ACTIVE` (if setting `product.autoApprove=true`) or `DRAFT → PENDING_REVIEW → ACTIVE | REJECTED`; seller toggles `ACTIVE ⇄ INACTIVE`; admin can set `REMOVED` with reason. Edits to name/description/images of an `ACTIVE` product re-enter review only if `product.autoApprove=false`.
- Publicly visible = `status=ACTIVE`, not deleted, shop `ACTIVE` and not hidden by seller suspension.
- Denormalized fields `minPrice`, `maxPrice`, `inStock` on `Product` are recomputed **in the same transaction** whenever a variant's price/stock/active flag changes or stock is decremented.
- ≥1 image required to activate; max 8 images, one primary. Description is plain text (strip HTML).
- Slug: slugified name + 4-char random suffix, unique.
- Plant care fields: `lightRequirement`, `wateringFrequency`, `careDifficulty`, `isIndoor`, `isPetSafe`, `matureHeightCm`, `careInstructions`, free-form `careDetails` JSON.
- Public search `GET /products`: `q` (case-insensitive, matches name/nameBn/scientificName/tags; add `pg_trgm` GIN index via raw SQL migration), `category` (slug, includes children), `shop` (slug), `minPrice`, `maxPrice`, `light`, `difficulty`, `isIndoor`, `isPetSafe`, `inStock`, `deliversTo` (districtId — shops with an active zone covering it or nationwide), `sort` ∈ `newest|price_asc|price_desc|popular|rating`, pagination.
- **Home-feed mode** (`sort=random`, additional value): `sort=random` adds `seed` (string, 1–64 chars of `[A-Za-z0-9_-]`; omitted → derived from the current 15-minute time bucket) and `cursor` (opaque string), `limit` default 20 max 50. It returns `meta {limit, nextCursor, hasMore}` — **no `total`**. For the same filters and `seed` the order is deterministic and stable across requests (cursor pagination never repeats or skips items barring products added/removed between pages); a different `seed` yields a different order; every filter and the public-visibility rule apply. Implementation: reuse the existing Prisma `where` to select matching product IDs, rank in application code by `hex(sha256(seed + ":" + id))[0:8]` then `id`, page with an opaque base64url cursor `{ r, id }` (first `limit` items strictly after the cursor), load page cards with one `findMany({ id: { in } })`, and cache the matching-ID list in memory per filter-hash (~30–60 s TTL, cleared on product create/update/delete/status events). Scale limit: fine to ~20k active products; beyond that move to SQL keyset ordering or a precomputed shuffle key. Never `ORDER BY random()` and never return the whole catalog. Invalid or tampered cursor → `400 INVALID_CURSOR`.
- **Related products** `GET /products/:slug/related` (public, `limit` default 6 max 12): product cards (same DTO as the list). Candidates: active, visible, in-stock products in the same category, excluding the product itself; if fewer than `limit`, fill from sibling categories (same parent), then the same shop, then any visible in-stock product. Order is pseudo-random but stable for the product for the current day (seed = product id + date) so the page can be cached; no duplicates; unknown or hidden slug → `404`.

### 4.4 Cart
One cart per user. `PUT /cart/items {variantId, quantity}` sets quantity (1–20); `DELETE` removes. Cart reads recompute live price/availability and return per-item `issues[]` (`OUT_OF_STOCK`, `INSUFFICIENT_STOCK` with `available`, `PRODUCT_UNAVAILABLE`, `SHOP_UNAVAILABLE`, `PRICE_CHANGED` is not needed since price is always live). Items are grouped by shop in the response with per-shop subtotal and estimated delivery charge when `?districtId=` is given.

### 4.5 Checkout (`POST /checkout`)
Body: `{ addressId, paymentMethod: "COD", note? }` + header `Idempotency-Key` (required, UUID). Client never sends prices.
Algorithm:
1. Require role `CUSTOMER` and verified email. If an order with `(customerId, idempotencyKey)` exists → return it (`200`).
2. Load cart items with variant → product → shop → seller. Empty → `422 CART_EMPTY`.
3. Validate every line; **collect all problems** and fail once with `422 CHECKOUT_VALIDATION_FAILED` and `details[]`: product not `ACTIVE`, variant inactive, shop not `ACTIVE`/seller not `APPROVED` (`SHOP_UNAVAILABLE`), `SHOP_ON_VACATION`, `INSUFFICIENT_STOCK`.
4. Group by shop. For each shop pick the delivery zone for the address district: active zone listing that district wins over a nationwide zone; none → `SHOP_NOT_DELIVERING_TO_DISTRICT`. Charge = `zone.charge`, or `0` if `subtotal >= freeDeliveryAbove`.
5. Resolve commission per line (§4.8) and compute `commissionAmount`, `sellerNetAmount = total - commissionAmount` (delivery charge belongs to the seller).
6. `$transaction`: create `Order` (snapshot of address fields and contact), `ShopOrder`s, `OrderItem`s (snapshot name, variant, image, unit price, commission), initial `OrderStatusHistory`, `Payment` rows (COD → one per `ShopOrder`, `PENDING`); decrement stock with `updateMany({ where: { id, stockQty: { gte: qty } }, data: { stockQty: { decrement: qty } } })` — if `count === 0` abort whole transaction with `INSUFFICIENT_STOCK`; write `InventoryLog(ORDER_PLACED)`; recompute product `inStock`; increment nothing else; delete purchased cart items.
7. After commit emit `order.placed` → notify each seller, email customer.
Order numbers: `PH-YYMMDD-XXXXXX` (6 random chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), shop orders `<orderNumber>-<n>`; retry on unique violation.
`paymentMethod` other than `COD` → `400 PAYMENT_METHOD_NOT_AVAILABLE` (behind feature flag `payments.online.enabled=false`).

### 4.6 Order state machine (per `ShopOrder`)
```
PENDING ──seller──▶ CONFIRMED ──seller──▶ PACKED ──seller──▶ SHIPPED ──seller/admin──▶ DELIVERED (terminal)
   │                    │                    │                  │
   │                    │                    │                  └──▶ FAILED_DELIVERY ──▶ SHIPPED (retry) | CANCELLED
   └────────────────────┴────────────────────┴────────▶ CANCELLED (terminal)
```
| Transition | Who | Rules |
|---|---|---|
| PENDING→CONFIRMED | seller | |
| PENDING→CANCELLED | customer (directly), seller (reject, reason required), admin, system | auto-cancel by cron if seller doesn't act in `SELLER_CONFIRM_TIMEOUT_HOURS` (48) → `cancelledBy=SYSTEM` |
| CONFIRMED/PACKED→CANCELLED | seller or admin (reason required). Customer must file a `CancellationRequest`, which the seller approves/rejects (admin can override) | |
| CONFIRMED→PACKED→SHIPPED | seller | `SHIPPED` accepts optional `courierName`, `trackingCode`, `estimatedDeliveryFrom/To` |
| SHIPPED→DELIVERED | seller or admin | |
| SHIPPED→FAILED_DELIVERY | seller or admin | reason required |
| FAILED_DELIVERY→SHIPPED / CANCELLED | seller or admin | on cancel, `restock` flag (default false — plants may be dead) |
- After `SHIPPED`, customers can no longer cancel; they use complaints.
- Every transition runs in a transaction: validate allowed transition + actor, update status and timestamp column, append `OrderStatusHistory`, handle side effects, emit `order.status_changed`.
- Cancellation from PENDING/CONFIRMED/PACKED **restores stock** (`InventoryLog(ORDER_CANCELLED)`, recompute `inStock`) and cancels the matching `Payment`.
- On `DELIVERED`: COD `Payment → PAID` (`paidAt`), `Product.soldCount += qty`, ledger entry per §4.8, parent `Order.paymentStatus` recomputed (all shop payments paid → `PAID`).
- The API returns a computed `overallStatus` for the parent `Order` (all delivered → `DELIVERED`; all cancelled → `CANCELLED`; mixed → `PARTIAL`; otherwise the least-advanced active status). Do not store it.
- Implement the state machine as a pure, unit-tested function (`canTransition(from, to, actorRole)`).

### 4.7 Delivery
`ShopDeliveryZone` per shop: name, districts (via `ZoneDistrict`) or `isNationwide`, `charge`, optional `freeDeliveryAbove`, estimated days min/max. Validation: a district may be in at most one active zone per shop. Checkout and cart use §4.5 step 4. Estimated delivery shown as `today + estimatedDaysMin..Max`. No courier integration in v1 (sellers deliver); keep `courierName`/`trackingCode` fields for later.

### 4.8 Commission & ledger
- Rate resolution (percent), most specific wins, `effectiveFrom <= now`, `isActive`: **SELLER rule → CATEGORY rule (item's category, then parent) → GLOBAL rule → setting `commission.default` (seed 10)**.
- Commission is calculated on item subtotal only (not delivery), snapshotted per `OrderItem` (`commissionRate`, `commissionAmount`) at checkout; later rate changes never affect existing orders.
- Seller balance = `SUM(LedgerEntry.amount)`; **positive = platform owes seller, negative = seller owes platform**.
- On `DELIVERED`:
  - **COD** (seller collected the cash themselves): `COD_COMMISSION_DUE` entry `-commissionAmount`.
  - **Online-paid** (platform collected): `ORDER_EARNING` entry `+sellerNetAmount`.
- Admin settles manually: `POST /admin/payouts` (platform pays seller → `PAYOUT` entry negative of paid amount, record method/reference) and `POST /admin/sellers/:id/dues-payments` (seller paid dues → `DUES_PAYMENT` positive). Adjustments via `ADJUSTMENT` with note. Payout creation may net positive and negative balances.
- Refund after delivery reverses the seller's share via `REFUND_REVERSAL` (online-paid: `-` refunded net share; COD: `+` the commission portion that was due). Document any simplification you make in `BACKEND_CONTEXT.md`.
- Seller sees balance, ledger and payouts (read-only) at `/seller/earnings`.

### 4.9 Cancellation requests
`POST /orders/shop-orders/:id/cancellation-request {reason}` allowed for the customer while `CONFIRMED` or `PACKED`, one pending request per shop order. Seller/admin approves → order `CANCELLED` (`cancelledBy=CUSTOMER`) with restock, or rejects with `responseNote`. Notify both sides.

### 4.10 Reviews & ratings
Only the buyer of an `OrderItem` whose `ShopOrder.status=DELIVERED`, within `REVIEW_WINDOW_DAYS` (60), one review per order item (`orderItemId` unique), rating 1–5, optional title/comment, up to 3 images. After create/hide/delete recompute `Product.ratingAvg/ratingCount` and `Shop.ratingAvg/ratingCount` (aggregate query in the same transaction). Seller can reply once per review (editable) and can report a review (`ReviewReport`); admin resolves (hide or keep). Customers can edit their review within 7 days.

### 4.11 Complaints & disputes
Customer opens a complaint on a `DELIVERED` shop order within `COMPLAINT_WINDOW_HOURS` (48) of `deliveredAt` (admin may override), type + description, optionally for one order item; `DAMAGED_PLANT` and `NOT_AS_DESCRIBED` require ≥ 1 photo. `NOT_DELIVERED`/`LATE_DELIVERY` may be filed on `SHIPPED`/`FAILED_DELIVERY` orders. Ticket number `PC-YYMMDD-XXXX`.
Status flow: `OPEN → SELLER_RESPONDED → UNDER_REVIEW → RESOLVED_REFUND | RESOLVED_REPLACEMENT | REJECTED → CLOSED`. Participants (customer, seller, admin) post `ComplaintComment`s; admin can add `isInternal` notes (hidden from others). Only admin sets the resolution. `RESOLVED_REFUND` creates a `Refund(REQUESTED)`; admin later marks it `PROCESSED` with method/reference (manual in v1) and the ledger is adjusted (§4.8).

### 4.12 Wishlist
`POST /wishlist/:productId` (idempotent add), `DELETE /wishlist/:productId`, `GET /wishlist` (paginated with availability).

### 4.13 Notifications & email
In-app `Notification` rows created by event listeners; `GET /notifications` (unread filter, pagination), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`. Per-user preferences in `User.notificationPrefs` (`{ email: { orderUpdates: true, marketing: false }, inApp: {…} }`). Real-time push (SSE/WebSocket) is a later enhancement — keep the notification service the single creation point.
Email via `MailService` (nodemailer). `MAIL_TRANSPORT=log` prints emails to the log in dev. Templates (plain, bilingual-ready): verify email, reset password, order placed, order status update, seller approved/rejected, complaint update. Mail failures must never fail the main request (fire-and-forget with logged error).
Low-stock notification to seller when variant stock ≤ `lowStockThreshold` after a decrement.

### 4.14 Admin capabilities
All under `/admin/*`, role `ADMIN`; every sensitive action writes an `AuditLog` (`before`/`after`, actor, IP, UA): user suspend/reactivate, seller approve/reject/suspend, shop suspend/reactivate, product moderation, commission rule changes, settings changes, payout/refund processing, complaint resolution, review hide.
Also: user management, seller application queue, product moderation queue, order & payment monitoring (all orders, filters), complaint & reported-review queues, categories, homepage banners/sections, announcements (audience ALL/CUSTOMERS/SELLERS → fans out `ANNOUNCEMENT` notifications), `SystemSetting` management, payment monitoring `GET /admin/payments` (+ `GET /admin/payments/:id`, filters status/method/order/from/to), analytics (§4.15).

### 4.15 Analytics (computed from SQL aggregates; no extra tables in v1)
- Seller `GET /seller/analytics/overview?from&to`: orders by status, revenue (delivered), commission paid, average order value, top 5 products, low-stock variants, rating summary, daily series.
- Admin `GET /admin/analytics/overview?from&to`: GMV, orders, new customers/sellers, pending approvals, commission earned, top shops/products/districts, cancellation & complaint rates, daily series.

### 4.16 System settings (seed defaults, editable by admin; read through a cached `SettingsService`)
`commission.default=10`, `product.autoApprove=true`, `order.sellerConfirmTimeoutHours=48`, `complaint.windowHours=48`, `review.windowDays=60`, `checkout.maxQtyPerItem=20`, `payments.online.enabled=false`, `shop.maxPerSeller=1`.

### 4.17 Realtime notification gateway (Socket.IO namespace `/realtime`)
Notifications are pushed over a Socket.IO namespace `/realtime` served on the same HTTP server as the REST API. The browser connects **directly** (WebSockets cannot pass through the BFF); authentication is a **one-time short-lived ticket**, never a cookie/JWT in the socket handshake.
- `POST /realtime/ticket` (any authenticated role, throttled 10/min/user) → `{ ticket, expiresInSeconds, url }`. Tickets are random 32 bytes, stored as `sha256` only, one-time use, TTL `REALTIME_TICKET_TTL_SECONDS` (default 30). In-memory ticket store (Redis would be needed for multi-instance — not in v1).
- Handshake rules (else `connect_error`): origin not in `CORS_ORIGINS` → `ORIGIN_NOT_ALLOWED`; ticket missing/invalid/expired/used → `UNAUTHENTICATED`; user not `ACTIVE` → `ACCOUNT_SUSPENDED`; session revoked/expired → `SESSION_EXPIRED`; per-client-IP handshake rate limit → `TOO_MANY_REQUESTS`.
- Limits: max `REALTIME_MAX_CONNECTIONS_PER_USER` concurrent sockets (oldest disconnected with `session:revoked { reason: "connection_limit" }`); max payload 64 KB; max connection age `REALTIME_MAX_AGE_SECONDS` (default 900) after which the server disconnects with `session:revoked { reason: "reauth" }` — the client reconnects with a fresh ticket.
- Server → client events: `notification:new` (same shape as a `GET /notifications` item), `notification:unread_count` (`{ count }`, after create/read/read-all), `notification:refresh` (`{}`, bulk fan-out — client should refetch), `session:revoked` (`{ reason }` on logout, session revoke, suspension, connection cap, max age). No client → server events in v1.
- Revocation: on logout, logout-all, session revoke, password change/reset and user suspension the matching sockets receive `session:revoked` and are disconnected. Implementation rule: domain services emit events (`notification.created`, `notification.read`, `notification.read_all`, `notifications.bulk_created`, `auth.session_revoked`, `user.suspended`) and `RealtimeService` consumes them — domain services never touch the gateway.
- The transport is designed to be reused by the messaging module later (reserved `conversation:{id}` rooms and `message:*`/`typing` events). Full contract in `backend/docs/api/realtime.md`.

### 4.18 Product page support: shop summary, delivery quote, image resolution, view counting
- **Product detail shop summary** (`GET /products/:slug`): the embedded `shop` object contains (additively, public) `name`, `slug`, `logoUrl`, `district` (origin — "ships from"), `verified`, `ratingAvg`, `ratingCount`, `isOnVacation`. **Never expose the shop's street address or phone publicly.**
- **Delivery quote** `GET /shops/:slug/delivery-quote?districtId=<int>` (public): uses the **same zone-resolution logic as checkout** (a district-specific active zone beats a nationwide zone) and returns `{ deliverable, charge, freeDeliveryAbove, estimatedDaysMin, estimatedDaysMax, zoneName, codAvailable }`; `deliverable=false` (all nulls) when no active zone covers the district. Unknown shop → `404`; unknown district → `422`. Decimals serialized as strings like everywhere else. Zone resolution is shared with checkout (no duplicated logic).
- **Product image resolution (zoom):** the `product` upload purpose re-encodes to WebP quality ≈80 (EXIF stripped, no upscaling) with the long edge up to **2000 px**; every other purpose keeps 1600 px. The 5 MB upload limit, 8 images per product and the ordering/primary-image rules are unchanged. Public images are served with long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable` — keys are random UUIDs; the S3 driver sets the same header at upload).
- **View counting:** `GET /products/:slug` **does not** increment `viewCount`; clients send `POST /products/:id/view` (204), deduplicated by the backend at most once per (client IP, product) per 30-minute in-memory window, so cached page renders cannot inflate counts.

---

## 5. API reference
Base `/api/v1`. 🔓 = public, 🔑 = any authenticated, role in brackets.

**Auth** — 🔓 `POST /auth/register`, `/auth/register/seller`, `/auth/login`, `/auth/refresh`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`; 🔑 `POST /auth/logout`, `/auth/logout-all`, `/auth/change-password`, `/auth/resend-verification` (except logout, `@Public` — see context §9); `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`; 🔑 `POST /realtime/ticket`.

**Profile & addresses** — 🔑 `GET/PATCH /users/me`, `POST /users/me/avatar`; `GET/POST /addresses`, `PATCH/DELETE /addresses/:id`, `POST /addresses/:id/default`. 🔓 `GET /locations/districts`.

**Catalog (public)** — 🔓 `GET /categories` (tree with `imageUrl` and `productCount`), `GET /products` (filters + all sorts above incl. `sort=random` + `seed` + `cursor`), `GET /products/:slug` (variants, images, public shop summary per §4.18, rating, care info; does **not** increment views), `GET /products/:slug/reviews`, `GET /products/:slug/related`, `POST /products/:id/view` (204, deduped view beacon), `GET /shops`, `GET /shops/:slug`, `GET /shops/:slug/products`, `GET /shops/:slug/delivery-quote?districtId=`, `GET /home` (banners + sections resolved).

**Cart & checkout** — [CUSTOMER] `GET /cart`, `PUT /cart/items`, `DELETE /cart/items/:variantId`, `DELETE /cart`, `POST /checkout`.

**Customer orders** — [CUSTOMER] `GET /orders`, `GET /orders/:id`, `POST /orders/shop-orders/:id/cancel` (PENDING only), `POST /orders/shop-orders/:id/cancellation-request`, `POST /orders/items/:orderItemId/review`, `PATCH /reviews/:id`, `DELETE /reviews/:id`, `POST /complaints`, `GET /complaints`, `GET /complaints/:id`, `POST /complaints/:id/comments`. Wishlist: `GET/POST/DELETE /wishlist…`. Notifications as §4.13.

**Seller onboarding** — [SELLER] `GET/PATCH /seller/application`, `POST /seller/application/documents`, `DELETE /seller/application/documents/:id`, `POST /seller/application/submit`, payout accounts `GET/POST/DELETE /seller/payout-accounts`.

**Seller (approved)** — [SELLER] `GET/PATCH /seller/shop`, `POST /seller/shop/vacation`, `DELETE /seller/shop/vacation`; delivery zones `GET/POST/PATCH/DELETE /seller/delivery-zones`; products `GET/POST /seller/products`, `GET/PATCH/DELETE /seller/products/:id`, `POST /seller/products/:id/status`, variants `POST/PATCH/DELETE /seller/products/:id/variants/:variantId`, `POST /seller/variants/:variantId/stock {delta|set, reason}`, images `POST /seller/products/:id/images`, `PATCH/DELETE /seller/products/:id/images/:imageId`; orders `GET /seller/orders`, `GET /seller/orders/:id`, `POST /seller/orders/:id/status {status, note?, courierName?, trackingCode?, restock?}`, `GET /seller/cancellation-requests`, `POST /seller/cancellation-requests/:id/respond {approve, note}`; reviews `GET /seller/reviews`, `POST /seller/reviews/:id/reply`, `POST /seller/reviews/:id/report`; complaints `GET /seller/complaints`, `GET /seller/complaints/:id`, `POST /seller/complaints/:id/comments`; `GET /seller/earnings` (balance, ledger, payouts); `GET /seller/analytics/overview`; `GET /seller/dashboard` (counts: pending orders, unread notifications, low stock).

**Admin** — [ADMIN] `GET /admin/users`, `GET /admin/users/:id`, `POST /admin/users/:id/suspend|reactivate`, `POST /admin/users` (create admin); sellers `GET /admin/sellers?status=`, `GET /admin/sellers/:id` (incl. document download links), `POST /admin/sellers/:id/approve|reject|suspend|reactivate`; shops `GET /admin/shops`, `POST /admin/shops/:id/suspend|reactivate`; products `GET /admin/products?status=`, `POST /admin/products/:id/approve|reject|remove`; categories CRUD; orders `GET /admin/orders`, `GET /admin/orders/:id`, `POST /admin/orders/:id/status` (override), `POST /admin/cancellation-requests/:id/respond`; payments `GET /admin/payments`; complaints `GET /admin/complaints`, `POST /admin/complaints/:id/status|resolve|comment`; refunds `GET /admin/refunds`, `POST /admin/refunds/:id/approve|reject|process`; reviews `GET /admin/review-reports`, `POST /admin/review-reports/:id/resolve`, `POST /admin/reviews/:id/hide|unhide`; commissions `GET/POST/PATCH/DELETE /admin/commission-rules`; ledger & payouts `GET /admin/sellers/:id/ledger`, `POST /admin/payouts`, `PATCH /admin/payouts/:id`, `POST /admin/sellers/:id/dues-payments`, `POST /admin/sellers/:id/adjustments`; content `CRUD /admin/banners`, `CRUD /admin/homepage-sections`; `CRUD /admin/announcements`; `GET/PATCH /admin/settings`; `GET /admin/audit-logs`; `GET /admin/analytics/overview`.

**Uploads** — 🔑 `POST /uploads/images` (multipart `file`, field `purpose` ∈ `avatar|product|shop-logo|shop-banner|review|complaint|banner|category`) → `{ url, key }`; `POST /uploads/documents` [SELLER] for seller documents (private; only admin can fetch via `GET /admin/sellers/:id/documents/:docId` which streams or returns a short-lived URL).

**Ops** — 🔓 `GET /health` (DB check), `GET /health/ready`.

Each endpoint must be documented in Swagger (summary, DTOs, response schema, auth requirement, error codes).

---

## 6. Database

- The schema in `prisma/schema.prisma` is the contract. Do not rename models/fields or drop tables for unimplemented features (payments gateways, messaging) — they exist so the system can scale without a redesign.
- Extra SQL in a hand-written migration (Prisma cannot express these):
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + GIN trigram indexes on `Product(name)`, `Product(nameBn)`, `Product(scientificName)`.
  - `CHECK ("stockQty" >= 0)` on `ProductVariant`; `CHECK ("quantity" > 0)` on `CartItem`/`OrderItem`; `CHECK ("rating" BETWEEN 1 AND 5)` on `Review`; `CHECK ("price" >= 0)`.
  - Partial unique index: one default address per user — `CREATE UNIQUE INDEX ON "Address"("userId") WHERE "isDefault"`.
  - Partial unique index: one pending cancellation request per shop order.
- Seeds (`prisma db seed`): all 64 districts of Bangladesh with 8 divisions (English + Bangla names), default categories, admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`, `SystemSetting` defaults, global commission rule. `seed-demo.ts` (separate script, dev only; refuses `NODE_ENV=production`): ≥60 visible, in-stock products spread across **all** seeded categories (several per category, varied prices and variants), **every category with an image** (placeholder images generated locally with `sharp` from SVGs, written through the storage service — no network), ≥10 products with 3–5 image galleries (≥1200 px long edge, different aspect ratios), a few low-stock and out-of-stock variants, shops in different districts and at least two shops with different delivery zones (one nationwide, one limited to a few districts). The seed is idempotent (re-running must not duplicate data) and demo accounts are documented in the backend README.
- Transactions + conditional updates (never read-then-write) for stock. Use `Prisma.TransactionIsolationLevel.ReadCommitted` (default) with the guarded `updateMany`; no table locks.
- Index for every foreign key used in filters; avoid N+1 (use `include`/`select` deliberately, batch with `findMany ... in`).
- Migrations are committed; never edit an applied migration.

---

## 7. Security checklist
Helmet; strict CORS; OriginGuard; DTO whitelist; no raw SQL string interpolation; argon2id; constant-time token compare; hashed tokens at rest; generic auth errors; rate limits; account lockout; ownership scoping; sensitive field encryption; upload validation (magic-byte sniff, size ≤ 5 MB images / 10 MB PDFs, allow `jpeg|png|webp` (+`pdf` for seller docs), re-encode images with `sharp`, random file names, strip EXIF); private storage for seller documents; secrets only via env (`.env` git-ignored, `.env.example` committed); audit log for admin actions; dependency audit in CI; no stack traces in production responses.

## 8. File storage
`StorageService` interface (`put`, `delete`, `getUrl`, `getPrivateUrl`) with two drivers:
- `LocalStorageDriver` (dev): public files under `${UPLOAD_DIR}/public` served at `/uploads/<key>` with immutable caching; private files under `${UPLOAD_DIR}/private` (never served; streamed to admins for seller documents).
- `S3StorageDriver` (production): any S3-compatible object store via `@aws-sdk/client-s3`. Public objects are uploaded with `Cache-Control: public, max-age=31536000, immutable` and a correct `Content-Type`; private objects with `private, max-age=0, no-store` and are reachable only via ~5-minute presigned GET URLs (admin document streaming redirects to the presigned URL). All S3 config is validated at boot when `STORAGE_DRIVER=s3`.

Entities store URL/key only.

## 9. Environment variables (`.env.example` must list all)
`NODE_ENV`, `PORT`, `DATABASE_URL`, `APP_URL` (frontend), `API_URL`, `CORS_ORIGINS` (comma list), `COOKIE_DOMAIN`, `BFF_SHARED_SECRET` (trusted client IP behind the BFF; required in production), `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_ISSUER`, `JWT_AUDIENCE`, `REFRESH_TTL_DAYS`, `REFRESH_REUSE_GRACE_SECONDS`, `DATA_ENCRYPTION_KEY` (32-byte base64), `MAIL_TRANSPORT` (`log|smtp`), `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `STORAGE_DRIVER` (`local|s3`), `UPLOAD_DIR`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` (required with `s3`), `ENABLE_SWAGGER`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `REALTIME_PUBLIC_URL`, `REALTIME_TICKET_TTL_SECONDS`, `REALTIME_MAX_AGE_SECONDS`, `REALTIME_MAX_CONNECTIONS_PER_USER` (see §4.17).

### 9.1 Production start & API contract quality
- Production flow: `npm ci && npm run build && npm prune --omit=dev && npm start` (tsx is a runtime dependency because the ESM output must be loaded through it); `npm run verify:prod` rebuilds and confirms `dist/app.module.js` loads under the pruned runtime dependency graph.
- The exported OpenAPI JSON (`npm run docs:export` → `openapi.json`, committed) is the source for typed frontend clients; every endpoint documented in Swagger with response schemas for public/priority and all `/seller/*` endpoints (remaining lower-priority admin lists tracked as TODO in the context file). The stable envelope and conventions are documented in `backend/docs/api/conventions.md`.

## 10. Testing & quality
- Unit tests (Jest): auth service (login, lockout, refresh rotation, **grace window**, **reuse detection**), order state machine, commission resolver, delivery-zone resolver, checkout totals and stock guard, ledger entries on delivery.
- E2E (supertest, separate test DB, migrations applied): register → verify → login (cookies set) → protected route → simulate expired access token → refresh → retry; logout invalidates refresh; full order flow (seller approved → product → cart → checkout → confirm → ship → deliver → review); concurrent checkout of last unit (exactly one wins); role/ownership denial cases.
## 10. Testing & quality
- Lint (ESLint) + Prettier + `tsc --noEmit` + tests must pass before a phase is marked done. Target ≥ 80% coverage on the services listed above.
- Provide `README.md` (setup, scripts, env, seeding, how to run tests) and an exported OpenAPI JSON (`npm run docs:export`).

## 11. Extension points (design now, build later)
- `PaymentProvider` interface (`createPayment`, `verifyCallback`, `refund`) under `modules/payments`; adapters per gateway; callbacks deduped via `PaymentWebhookEvent`; online orders keep `Payment(PENDING)` until verified; PipaPay adapter to be designed once its documentation is provided. Do not assume refund API, webhook signing or payout capabilities.
- Messaging: add a `messaging` module using existing `Conversation`/`Message`, notifications type `NEW_MESSAGE`, and **reuse the realtime gateway** (`/realtime` namespace, rooms `conversation:{id}`, events `message:*`/`typing` per §4.17).
- Presigned direct uploads are optional future work (only if a host limits request-body sizes).
- Coupons (`Order.discountTotal` already exists), courier APIs (`ShopOrder.courierName/trackingCode`), Redis (throttler store, settings cache, queue via BullMQ for emails; also required for multi-instance realtime ticket stores), seller subscriptions, personalised recommendations, mobile app (Bearer auth already supported).

## 12. Build phases (acceptance criteria)
| Phase | Content | Done when |
|---|---|---|
| 0 | Bootstrap: config/env validation, Prisma + migrate, common (envelope, filters, guards skeleton), health, Swagger, logger, lint/test setup | app boots, `/health` OK, initial migration applied, seed script runs |
| 1 | Auth & users: register/login/refresh/logout, sessions, verify/reset/change password, mail (log transport), throttling, OriginGuard, guards | auth unit + e2e tests green incl. rotation, grace, reuse |
| 2 | Locations, categories, uploads/storage, addresses | districts + categories seeded; image upload works |
| 3 | Seller onboarding, shops, delivery zones, payout accounts, admin seller approval, audit log, notifications core | full seller application → admin approve flow in e2e |
| 4 | Products, variants, images, inventory, moderation, public catalog + search + `/home` | filters/sort/pagination verified; denormalized fields stay in sync |
| 5 | Cart, checkout, orders, state machine, stock, cancellation requests, cron auto-cancel, events/emails | multi-shop checkout e2e + concurrency test green |
| 6 | Commission rules, ledger, payouts, refunds, seller earnings | ledger totals correct for COD and online-paid fixtures |
| 7 | Wishlist, reviews, complaints | windows/ownership rules tested |
| 8 | Admin remaining (content, announcements, settings), analytics | all `/admin/*` endpoints documented and guarded |
| 9 | Hardening: security review against §7, demo seed, README, OpenAPI export, final regression | checklist in `BACKEND_CONTEXT.md` fully ticked |
| 10 | *Delivered extension:* frontend integration support — realtime gateway (§4.17), trusted client IP behind the BFF (§3.6), S3 driver + presigned private URLs (§8), production start (§9.1), `GET /admin/payments(/:id)`, response schemas + `backend/docs/api/conventions.md`, deduplicated view beacon (§4.18) | realtime ticket flow e2e green; Bearer-without-Origin verified; pruned production boot verified |
| 11 | *Delivered extension:* home & product-page support — `sort=random` seeded cursor feed, `related`, delivery quote + public shop summary (§4.18), category `imageUrl`/`productCount` (§4.2), 2000 px product images, richer demo seed (§6) | e2e + live probes documented in `BACKEND_CONTEXT.md`; `openapi.json` regenerated |

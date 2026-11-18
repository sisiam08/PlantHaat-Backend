# Auth sessions

Status: implemented on `redesign/phase2` (frontend) and `feature/payments` (backend), 2026-11-17.

## Model

- **Access token**: short-lived JWT (`ph_at` cookie, also accepted as `Authorization: Bearer`).
  Default 15 minutes. It is never stored in JS storage.
- **Refresh token**: opaque `sessionId.secret` (`ph_rt` cookie). Only its SHA-256 hash is stored
  server-side in `RefreshSession`; the raw value exists only in the cookie.
- Each login/register creates a **family** (`familyId`). Every refresh rotates the token and creates
  a new session row in the same family. The old row keeps `rotatedAt`/`replacedById` for reuse
  detection and the grace window.
- Each family has an **absolute** cap (`absoluteExpiresAt`) and a **sliding** expiry (`expiresAt` =
  min(now + sliding lifetime, absolute cap)). Refreshing extends the sliding expiry until the cap.

### Default lifetimes (`security.*`, admin-editable, not public)

| Role | Sliding | Absolute |
|---|---:|---:|
| Customer | 30 days | 90 days |
| Seller | 14 days | 60 days |
| Admin | 7 days | 30 days |
| Access token | 15 minutes | — |
| Reuse grace | 30 seconds | — |

Changing a setting applies to **new sessions** (the absolute cap is fixed when the family is created).

## Cookies

| Cookie | Value | Path | Max-Age | HttpOnly | Secure | SameSite |
|---|---|---|---|---:|---|---|
| `ph_at` | JWT access token | `/` | session sliding lifetime (role) | yes | production only | Lax |
| `ph_rt` | refresh token | `/` at the Next origin, `/api/v1/auth` at the API origin | role sliding lifetime | yes | production only | Lax |

The access cookie outlives the access **token** on purpose: the browser drops a cookie at Max-Age,
which used to make the session depend on the 15-minute token. The proxy/gateway refresh the expired
token from the refresh cookie instead of redirecting.

The refresh cookie is `httpOnly`, never readable by JS, and sent to the refresh/logout endpoints
(the Next-origin path must be `/` because `proxy.ts` needs it on page navigations). No tokens are
written to `localStorage`/`sessionStorage`.

## Flows

### Page navigation (proxy)

1. `proxy.ts` decodes `ph_at.exp` (routing only, no signature trust).
2. If the access cookie is missing/expired and `ph_rt` exists, it calls the backend refresh once
   (single-flight per refresh token), writes both cookies on the response and forwards the new
   `Cookie` header to the downstream server render.
3. Refresh failure:
   - `401/403` → clear cookies and redirect to
     `/login?returnTo=<path>&reason=session-expired` (friendly localized message).
   - network/5xx → do **not** log out; the server render retries and surfaces an error boundary.
4. `/login` and `/register` are handled by the proxy too: a valid/refreshable session redirects to
   `returnTo` (same-origin only) or the role home, with no redirect loop.

### Gateway (`/api/v1/*`)

- Forwards `Authorization: Bearer <ph_at>` (never the refresh cookie except on `/auth/*`).
- On a 401 for a replayable request it refreshes once, retries once, sets both rotated cookies on the
  response, and adds `x-auth-refresh-generation` (test observability).
- Concurrent requests share one in-flight refresh per refresh token.

### Browser client

- Axios interceptor: on `401 TOKEN_EXPIRED`/`UNAUTHENTICATED`, refresh once and retry the original
  request once.
- `lib/auth/refresh.ts` is single-flight and serializes tabs with the Web Locks API (localStorage
  lock fallback + recent-refresh check). Transient failures are not cached as “logged out”.
- Proactive refresh runs about 60 s before expiry and on focus after a long idle. Revocation/expiry
  shows a non-blocking “Please log in again” toast; the current page state/cart is kept.

### Server Components

- `getSession()` tries the access token, then one refresh (using the proxy-refreshed cookies or a
  direct refresh), and only returns `null` for an **auth** failure. Network/5xx failures throw to the
  error boundary instead of redirecting to login.
- `requireSession()` redirects to `/login?returnTo=<path>&reason=session-expired` using the
  `x-pathname` header set by the proxy.

### Backend refresh endpoint

`POST /api/v1/auth/refresh` (30 requests/minute per client):

- Rotates the refresh token; reuse of a token **outside** the grace window revokes the whole family.
- Inside the grace window, the immediately previous token is accepted and returns an access token for
  the same successor session (no second rotation, no `ph_rt` Set-Cookie). This makes parallel requests
  and multi-tab races benign.
- Rejects revoked, expired, absolute-expired, suspended/deleted-user and mismatched-secret sessions.
- Logout revokes the current family. Password change/reset revokes every session.
- `AuthService.cleanupExpired()` runs at 03:00 and on application bootstrap (catch-up safe,
  idempotent); it deletes sessions expired/revoked for more than 7 days.

## Settings keys (admin → Settings → Security & Sessions)

| Key | Default | Validation |
|---|---:|---|
| `security.access.ttlMinutes` | 15 | 1–1440 |
| `security.refresh.customer.days` | 30 | 1–365 |
| `security.refresh.customer.maxDays` | 90 | 1–730, ≥ sliding |
| `security.refresh.seller.days` | 14 | 1–365 |
| `security.refresh.seller.maxDays` | 60 | 1–730, ≥ sliding |
| `security.refresh.admin.days` | 7 | 1–365 |
| `security.refresh.admin.maxDays` | 30 | 1–730, ≥ sliding |
| `security.refresh.graceSeconds` | 30 | 0–300 |

None of these are public. Sensitive-settings re-auth is unchanged (these are not marked sensitive).

## Environment

Required (no random fallback; missing values abort startup):

- `JWT_ACCESS_SECRET` (≥ 32 chars) — access JWT signing.
- `DATABASE_URL`, `DATA_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Optional: `JWT_ACCESS_TTL` (legacy fallback), `REFRESH_TTL_DAYS` (legacy fallback),
  `COOKIE_DOMAIN`, `BFF_SHARED_SECRET`.

Because refresh sessions live in Postgres and the signing secret comes from env, restarting the API
does not invalidate existing sessions.

## Testing with short TTLs

Backend e2e (`backend/test/auth-sessions.e2e-spec.ts`) uses real Postgres and the settings helper.

For UI tests, run the isolated stack (`backend/scripts/test-stack.ps1`) with test-only overrides:

```text
AUTH_TEST_ACCESS_TTL_SECONDS=10
AUTH_TEST_REFRESH_TTL_SECONDS=300
AUTH_TEST_REFRESH_ABSOLUTE_SECONDS=900
AUTH_TEST_REFRESH_GRACE_SECONDS=60
```

These are honoured **only** when `NODE_ENV=test`; production/dev read the settings registry.
Run `frontend/e2e/session-refresh.spec.ts` against the API on `:5001` and frontend on `:3002`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3002 npx playwright test e2e/session-refresh.spec.ts \
  --project=desktop-chromium --workers=1
```

## Migration / rollback

Additive migration `20261117203000_auth_session_absolute_expiry` adds nullable
`RefreshSession.absoluteExpiresAt` and backfills existing rows with their current `expiresAt`
(no live session is extended). Rollback: `ALTER TABLE "RefreshSession" DROP COLUMN "absoluteExpiresAt";`

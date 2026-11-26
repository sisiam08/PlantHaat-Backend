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

The web app and the API **must not share cookie names**: cookies ignore ports, so on localhost both
origins share one jar and a same-name refresh cookie on `/` (web) and `/api/v1/auth` (API) is sent
twice on `/api/v1/auth/*`. Express `cookie-parser` takes the first (longest-path) value while Next
takes the last, so one side can read a stale token, trigger reuse detection and revoke the family.

| Origin | Cookie | Value | Path | Max-Age | HttpOnly | Secure | SameSite |
|---|---|---|---|---|---:|---|---|
| Web (Next) | `ph_web_at` | JWT access token | `/` | session sliding lifetime (role) | yes | production only | Lax |
| Web (Next) | `ph_web_rt` | refresh token | `/` | role sliding lifetime | yes | production only | Lax |
| API (direct) | `ph_at` | JWT access token | `/` | access TTL (15 min) | yes | production only | Lax |
| API (direct) | `ph_rt` | refresh token | `/api/v1/auth` | role sliding lifetime | yes | production only | Lax |

The API cookies exist for direct API clients (Swagger/Postman). The browser app only reads and writes
`ph_web_*`; the backend's `Set-Cookie` headers are re-issued under the web names by the gateway/proxy.
Legacy `ph_at`/`ph_rt` are read as a fallback (migration) and cleared on every write, including the
`/api/v1/auth` duplicate path. Only the Next layer sets the browser cookies; no token is written to
`localStorage`/`sessionStorage`.

The access cookie outlives the access **token** on purpose: the browser drops a cookie at Max-Age,
which used to make the session depend on the 15-minute token. The proxy/gateway/client refresh the
expired token from the refresh cookie instead of redirecting. Both cookies intentionally share one
expiry: the session lifetime. **The session ends when the refresh session ends**, not every 15 minutes.

## Flows

### Page navigation (proxy)

1. `proxy.ts` decodes `ph_web_at.exp` (routing only, no signature trust).
2. If the access cookie is missing/expired and `ph_web_rt` exists, it calls the backend refresh once
   (single-flight per refresh token), writes both web cookies on the response and forwards the new
   `Cookie` header to the downstream server render.
3. Refresh failure:
   - `401/403`: clear the web cookies + any legacy duplicates and **rewrite** the protected URL to
     `/session-expired` (same URL, dialog open). Auth-entry pages (`/login`, `/register`) keep their
     clear-and-render behavior. Guests with no cookies go to `/login` (`reason=auth-required`).
   - network/5xx: do **not** log out; the render retries and surfaces an error boundary.
4. `/login` and `/register` are handled by the proxy too: a valid/refreshable session redirects to
   `returnTo` (same-origin only) or the role home, with no redirect loop.

### Gateway (`/api/v1/*`)

- Forwards `Authorization: Bearer <ph_web_at>` (never the refresh cookie except on `/auth/*`).
- On a 401 for a replayable request it refreshes once, retries once, sets both rotated cookies on the
  response, and adds `x-auth-refresh-generation` (test observability).
- Concurrent requests share one in-flight refresh per refresh token.
- A BFF request with a valid `X-BFF-Key` passes the backend OriginGuard even without a bearer, so a
  missing/expired access token becomes a 401 (refresh/dialog) rather than a misleading CSRF 403.

### Browser client

- Axios interceptor: on `401 TOKEN_EXPIRED`/`UNAUTHENTICATED` (and a 403 `ORIGIN_NOT_ALLOWED` on a
  mutation in a local BFF without the shared key), refresh once and retry the original request once.
- `lib/auth/refresh.ts` is single-flight and serializes tabs with the Web Locks API (localStorage
  lock fallback + recent-refresh check). Transient failures are not cached as “logged out”.
- Proactive refresh runs about 60 s before expiry and on focus after a long idle. A dead session opens
  a role-aware prompt on the current page: admin/seller see it immediately (including from a public
  background request); an authenticated customer sees it only for an action/protected route; a guest
  gets “Login required” only when an action needs authentication. Public customer browsing stays quiet.
  The prompt only hands off to `/login?returnTo=<current path>&reason=session-expired|auth-required`;
  it has no login form, so a password is never entered inside a modal.
- `ph_has_session`/`ph_session_expired` are non-sensitive UX cookies. The latter lets the proxy render
  the expired prompt at the same URL after a reload; it is cleared on login/logout and is never used
  for authorization. Login on the page clears the query cache and does a full load back to `returnTo`.
- `getSession()` reads the web cookie (legacy fallback) and calls `/auth/me` once. It **never
  refreshes/rotates the refresh token**: a Server Component cannot write the rotated cookie, so a
  silent rotation left the browser on a stale token and later triggered reuse detection. The proxy,
  gateway and browser client own refresh; `requireSession()` shows the segment's `unauthorized`
  dialog at the same URL when there is no session.
- Network/5xx/`x-auth-refresh: transient` failures throw to the error boundary instead of logging out.

### Backend refresh endpoint

`POST /api/v1/auth/refresh` (30 requests/minute per client):

- Rotates the refresh token; reuse of a token **outside** the grace window revokes the whole family.
- Inside the grace window, the immediately previous token is accepted and returns an access token for
  the same successor session (no second rotation, no `ph_rt` Set-Cookie). This makes parallel requests
  and multi-tab races benign.
- Rejects revoked, expired, absolute-expired, suspended/deleted-user and mismatched-secret sessions.
- Cookies are cleared on the error response **only for 401/403**. A 429 (throttle), 5xx or transport
  failure is transient and must not wipe a live session; that was a second early-logout cause under
  refresh bursts.
- Logout revokes the current family. Password change/reset revokes every session.
- `AuthService.cleanupExpired()` runs at 03:00 and on application bootstrap (catch-up safe,
  idempotent); it deletes sessions expired/revoked for more than 7 days.

### Session-expired UX

- An auth-error refresh/rejected probe shows a modal at the current URL. The “expired” variant is
  used for a real prior session; the “required” variant is used for a first-time guest action. Both
  carry a primary link to the existing login page with the right `returnTo`/`reason`, a “Go to home”
  link and a public-only dismiss. There is no email/password form; the dialog is focus-trapped and
  axe-clean.
- Checkout: a guest’s cart button opens “Login required” (login page carries `returnTo=/checkout`);
  a previously authenticated customer gets “Your session has expired… continue with checkout”. The
  guest cart is merged before the auth cache publishes the user, so the return to checkout already
  sees the cart. No non-idempotent mutation is replayed automatically.

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

Long-run soak (real Chrome, cookie names/paths/hashes only — never values):

```bash
node frontend/scripts/session-soak.mjs --base http://localhost:3002 \
  --email buyer1@teststack.local --password <test password> \
  --minutes 40 --tabs 2 --interval 30 --navigateEvery 3
```

It exits non-zero on a refresh auth failure, a `/login` redirect, a session dialog, or a page error.
2026-11-20 evidence: with 10 s access TTL the first version lost `ph_web_rt` rotation after ~17 s
(the Server Component silently rotated and discarded the successor) and hit
`REFRESH_TOKEN_REUSED` at 85 s. After the fixes a 2-minute accelerated soak stayed clean (0 auth
failures, 0 redirects, 0 dialogs, 8 navigations, 26 API calls); a 40-minute real-Chrome dev soak was
run for the review.

## Migration / rollback

Additive migration `20261117203000_auth_session_absolute_expiry` adds nullable
`RefreshSession.absoluteExpiresAt` and backfills existing rows with their current `expiresAt`
(no live session is extended). Rollback: `ALTER TABLE "RefreshSession" DROP COLUMN "absoluteExpiresAt";`

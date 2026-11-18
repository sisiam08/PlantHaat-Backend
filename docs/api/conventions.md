# API conventions

Base path `/api/v1`. Swagger UI at `/api/docs` (when `ENABLE_SWAGGER=true`);
the generated `openapi.json` is the source for typed frontend clients.

## Envelope

Success (single):

```json
{ "success": true, "data": { } }
```

Success (list) adds `meta`:

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

Error:

```json
{
  "success": false,
  "statusCode": 422,
  "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": [] },
  "path": "/api/v1/checkout",
  "timestamp": "2026-10-10T00:00:00.000Z"
}
```

`error.code` is a stable SCREAMING_SNAKE string (`ErrorCode` enum). `message` is
human-readable; `details` is optional and endpoint-specific.

## Pagination

List endpoints accept `?page=1&limit=20` (`limit` max 50, default 20) and return
the `meta` block above. Filtering/sorting parameters are endpoint-specific; sort
keys are whitelisted.

## Auth

- The API is primarily cookie-based (`ph_at` access, `ph_rt` refresh scoped to
  `/api/v1/auth`) for the browser. `JwtStrategy` also accepts
  `Authorization: Bearer <access token>` (used by the Next.js BFF and future
  mobile app).
- Access tokens live 15 min; refresh tokens 30 days and rotate. `POST
  /auth/refresh` returns `accessTokenExpiresAt` (epoch ms); login/register also
  return the safe `user` object (same shape as `GET /auth/me`).
- State-changing requests are guarded by `OriginGuard`: cookie-authenticated
  non-GET requests need an allowed `Origin`; Bearer-authenticated requests and
  `@Public` routes do not.

## Idempotency

`POST /checkout` requires an `Idempotency-Key` header (UUID). Repeating the same
key returns the original order.

## Money & dates

- Money is `Decimal(12,2)` BDT. In JSON it is **serialized as a string**
  (e.g. `"1060.00"`) — parse with a decimal library, never a JS float.
- Dates are ISO-8601 UTC strings.
- IDs are UUID strings; district ids are integers.

## Realtime

See `api/realtime.md`. WebSocket events carry plain payloads (not enveloped).

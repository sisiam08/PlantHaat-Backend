# Realtime (WebSocket) contract

Socket.IO namespace `/realtime`, served on the same HTTP server as the REST API
(default `REALTIME_PUBLIC_URL`). The browser connects **directly** to this
namespace; authentication is a **one-time ticket** (never a cookie/JWT in the
URL). Messaging will reuse this transport (reserved `conversation:{id}` rooms and
`message:*` / `typing` events).

## 1. Get a ticket

`POST /api/v1/realtime/ticket` — any authenticated role, throttled 10/min/user.

```json
{ "ticket": "<base64url>", "expiresInSeconds": 30, "url": "http://localhost:5000" }
```

The ticket is 32 random bytes; the server stores only `sha256(ticket)` mapped to
`{ userId, sid, role, expiresAt }`. It is **one-time use** and short-lived
(`REALTIME_TICKET_TTL_SECONDS`, default 30). A multi-instance deployment needs a
shared ticket store (e.g. Redis) — not implemented in v1.

## 2. Connect

```js
import { io } from "socket.io-client";
const socket = io(`${url}/realtime`, {
  transports: ["websocket"],
  auth: { ticket },
});
socket.on("connect_error", (err) => console.error(err.message));
```

Handshake rules (else `connect_error` with the given message):

| Condition | Error |
|---|---|
| Origin not in `CORS_ORIGINS` | `ORIGIN_NOT_ALLOWED` |
| Ticket missing/invalid/expired/used | `UNAUTHENTICATED` |
| User not `ACTIVE` | `ACCOUNT_SUSPENDED` |
| Session (sid) revoked/expired | `SESSION_EXPIRED` |
| Handshake rate limit (per client IP) | `TOO_MANY_REQUESTS` |

Limits: max `REALTIME_MAX_CONNECTIONS_PER_USER` concurrent sockets (oldest is
disconnected with `session:revoked { reason: "connection_limit" }`); max payload
64 KB; **max connection age** `REALTIME_MAX_AGE_SECONDS` (default 900) after which
the server disconnects with `session:revoked { reason: "reauth" }` — reconnect
with a fresh ticket.

## 3. Server → client events

| Event | Payload | When |
|---|---|---|
| `notification:new` | same shape as a `GET /notifications` item | a notification is created for the user |
| `notification:unread_count` | `{ "count": number }` | after create / mark-read / read-all |
| `notification:refresh` | `{}` | after a bulk fan-out (announcements) → client should refetch |
| `session:revoked` | `{ "reason": string }` | logout, session revoke, suspension, connection cap, max age |

No client → server events in v1.

## 4. Revocation

On logout, logout-all, session revoke, password change/reset and user suspension
the matching sockets receive `session:revoked` and are disconnected. Domain
events (`auth.session_revoked { userId, sid? }`, `user.suspended { userId }`) are
emitted by the auth/admin services and consumed by `RealtimeService`.

## 5. Integration

`NotificationsService` emits `notification.created`, `notification.read`,
`notification.read_all` and `notifications.bulk_created`; `AnnouncementsService`
emits `notifications.bulk_created`. `RealtimeService` listens and pushes. Domain
services never call the gateway directly.

## 6. Environment

`REALTIME_PUBLIC_URL`, `REALTIME_TICKET_TTL_SECONDS`, `REALTIME_MAX_AGE_SECONDS`,
`REALTIME_MAX_CONNECTIONS_PER_USER` (see `.env.example`).

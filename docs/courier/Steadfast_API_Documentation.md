# Steadfast Courier API Documentation

**Base URL:** `https://portal.packzy.com/api/v1`  
**Authentication:** Header-based (api-key + secret-key)  
**Content-Type:** `application/json`  
**Timezone:** Asia/Dhaka (ISO 8601 with offset)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limits](#rate-limits)
3. [Data Handling Rules](#data-handling-rules)
4. [Service Check](#service-check)
5. [Booking Parcels](#booking-parcels)
6. [Checking Status](#checking-status)
7. [Parcels by State](#parcels-by-state)
8. [Stats](#stats)
9. [Pickups](#pickups)
10. [Returns](#returns)
11. [Balance and Payments](#balance-and-payments)
12. [Lookups](#lookups)
13. [Status Reference](#status-reference)
14. [Response Codes](#response-codes)
15. [Webhooks](#webhooks)

---

## Authentication

### Headers (Required on Every Request)

| Header | Description |
|--------|-------------|
| `api-key` | Your API key |
| `Secret-Key` | Your secret key |
| `Content-Type` | `application/json` (required for POST) |

### Key Points

- **No login step** — no token to refresh. Send both keys on every call.
- **Keys belong to one profile** — each business has its own keys; they cannot see other businesses' parcels or payouts.
- **Multiple keys per profile** — one per integration, named, revocable.
- **Missing/wrong credentials** → `401`
- **Repeated failures** (10 in 5 minutes) → `429` for 60 minutes
- **Rate limits**: 1,000 req/min (general), 6,000 req/min (booking)

---

## Rate Limits

| Operation | Limit |
|-----------|-------|
| General | 1,000 requests/minute |
| Booking | 6,000 requests/minute |
| Fraud Check | ~4 checks per parcel booked on busiest day + 10 |

---

## Data Handling Rules

### Character Stripping
Before storing addresses, names, or notes, these characters are replaced with a space:
```
{ } \ < > $
```
**Text you send is not always text you get back.**

### Field Truncation
Over-long values are cut to fit:

| Field | Max Length |
|-------|------------|
| `invoice` | 100 characters |
| `recipient_name` | 100 characters |
| `recipient_phone` | 40 characters |
| `recipient_address` | 490 characters |
| `note` | 480 characters |

---

## Service Check

### `GET /ping`
**No API key needed.** Connectivity check only.

#### Response
```json
{
  "status": 200,
  "message": "pong",
  "service": "steadfast-api",
  "version": "v1",
  "time": "2026-09-20T13:45:09+08:00"
}
```

**Notes:**
- Does not validate keys — use `GET /get_balance` for that
- Does not touch database/queues
- `time` is ISO 8601 with Asia/Dhaka offset — compare with your clock
- Rate limited by IP — don't poll in a tight loop

---

## Booking Parcels

### `POST /create_order`
**Book one parcel.**

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoice` | string | Yes | Your order number. Letters, digits, hyphens, underscores only. Must be unique (enables safe retries). Max 100 chars. |
| `recipient_name` | string | Yes | Max 100 chars. |
| `recipient_phone` | string | Yes | 11 digits starting with `01`. |
| `recipient_address` | string | Yes | Max 490 chars. |
| `cod_amount` | number | Yes | Cash on delivery in BDT. `0` for prepaid. Max 1,000,000. |
| `note` | string | No | Delivery instructions for rider. Max 480 chars. |
| `alternative_phone` | string | No | Second number to try. 11 digits starting with `01`. |
| `recipient_email` | string | No | Must be deliverable (domain checked). |
| `item_description` | string | No | What's in the parcel. Max 255 chars. |
| `total_lot` | number | No | Number of items. Default: `1`. |
| `delivery_type` | number | No | `0` = home delivery (default), `1` = point delivery. |
| `exchange` | boolean | No | `true` for exchange parcel (rider delivers and brings back item). Default: `false`. Send as JSON `true/false` or form `"true"/"false"` or `1/0`. |

#### Request Example
```json
{
  "invoice": "ORD-10231",
  "recipient_name": "Jahid Hasan",
  "recipient_phone": "01712345678",
  "recipient_address": "Dhanmondi, Dhaka",
  "cod_amount": 1860,
  "note": "Call before 3 PM"
}
```

#### Success Response (200)
```json
{
  "status": 200,
  "message": "Consignment has been created successfully.",
  "consignment": {
    "consignment_id": 124107,
    "invoice": "ORD-10231",
    "tracking_code": "15BAEB8A",
    "tracking_link": "https://steadfast.com.bd/tl/tb2c3d",
    "recipient_name": "Jahid Hasan",
    "recipient_phone": "01712345678",
    "recipient_address": "House 17/1, Road 3/8, Dhanmondi, Dhaka-1209",
    "recipient_email": null,
    "alternative_phone": null,
    "item_description": null,
    "total_lot": 1,
    "cod_amount": 1860,
    "exchange": false,
    "status": "in_review",
    "note": "Call before 3 PM",
    "created_at": "2026-09-20T07:05:31.000000Z",
    "updated_at": "2026-09-20T07:05:31.000000Z"
  }
}
```

**Important:** Keep `consignment_id` and `tracking_code` — they're how you query this parcel later.

#### Error Response (400)
```json
{
  "status": 400,
  "errors": {
    "field_name": ["ERROR_CODE"]
  }
}
```

---

### `POST /create_order/bulk-order`
**Book up to 500 parcels in one request.**

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | array | Yes | Orders, each shaped exactly as a single `create_order` body. Max 500 per request. |

#### Request Example
```json
{
  "data": [
    {
      "invoice": "ORD-10231",
      "recipient_name": "Sahid Hasan",
      "recipient_phone": "01712345678",
      "recipient_address": "Dhanmondi, Dhaka",
      "cod_amount": 1860,
      "note": "Call first"
    },
    {
      "invoice": "ORD-10232",
      "recipient_name": "Musrat Dahon",
      "recipient_phone": "01812345678",
      "recipient_address": "Uttara, Dhaka",
      "cod_amount": 450,
      "exchange": true
    }
  ]
}
```

#### Response (200) — **Always 200 even with partial failures**
```json
{
  "status": 200,
  "message": "We have a response for you.",
  "data": [
    {
      "invoice": "ORD-10231",
      "consignment_id": 1424187,
      "tracking_code": "15BAEB8A",
      "status": "success",
      "tracking_link": "https://steadfast.com.bd/tl/a1b2c3d4"
    },
    {
      "invoice": "ORD-10232",
      "consignment_id": null,
      "tracking_code": null,
      "status": null,
      "error": ["THIS_INVOICE_ALREADY_EXISTS"]
    }
  ]
}
```

**Key Points:**
- Whole request returns 200 — **read every entry**
- `data` returns in same order sent — match by position or `invoice`
- Success: `status: "success"` + `consignment_id`
- Failure: `status: null` + `error` (JSON array of codes)
- Partial success is normal — rebook failures after fixing
- `exchange: true` per order books as exchange parcel

#### Error Codes

| Code | Meaning |
|------|---------|
| `INVOICE_IS_REQUIRED` | No `invoice` on this order |
| `INVOICE_MUST_BE_ALPHA_NUM_DASH_UNDERSCORE` | Invalid character in invoice |
| `INVOICE_LENGTH_SHOULD_BE_LESS_THAN_100_CHARS` | Invoice too long |
| `THIS_INVOICE_ALREADY_EXISTS` | Duplicate invoice |
| `RECEIVER_NAME_IS_REQUIRED` | No `recipient_name` |
| `RECEIVER_NAME_LENGTH_SHOULD_BE_LESS_THAN_100_CHARS` | Name too long |
| `RECEIVER_PHONE_IS_REQUIRED` | No `recipient_phone` |
| `RECEIVER_PHONE_LENGTH_SHOULD_BE_LESS_THAN_40_CHARS` | Phone too long |
| `RECEIVER_ADDRESS_IS_REQUIRED` | No `recipient_address` |
| `RECEIVER_ADDRESS_LENGTH_SHOULD_BE_LESS_THAN_490_CHARS` | Address too long |
| `NOTE_LENGTH_SHOULD_BE_LESS_THAN_480_CHARS` | Note too long |
| `COD_AMOUNT_IS_REQUIRED` | No `cod_amount` |
| `COD_AMOUNT_ERROR` | `cod_amount` not a number |
| `EXCHANGE_MUST_BE_TRUE_OR_FALSE` | `exchange` not boolean |

---

### `POST /create_order/bulk-order/extended`
**Same as bulk-order, but with per-field validation messages instead of codes.**  
**Prefer this for new integrations.**

#### Fields
Same as `bulk-order`, plus accepts `recipient_email`, `alternative_phone`, `item_description`, `total_lot` per order (older endpoint reads these from top level).

#### Response (200)
```json
{
  "status": 200,
  "message": "Processed bulk order entries.",
  "data": [
    {
      "invoice": "ORD-10232",
      "status": "error",
      "error": ["The recipient phone format is invalid."],
      "consignment_id": null,
      "tracking_code": null
    }
  ]
}
```

**Advantages:** Failures are human-readable sentences, not codes.

---

## Checking Status

**All status endpoints are cached for 60 seconds** — polling faster tells you nothing new. Prefer webhooks.

### `GET /status_by_cid/{consignment_id}`
**Where a parcel is, by the ID Steadfast gave you.**

#### Response (200)
```json
{
  "status": 200,
  "delivery_status": "delivered"
}
```

---

### `GET /status_with_return_status_by_cid/{consignment_id}`
**Like above, but for returned parcels shows how far back it has got.**  
**Use this for stock reconciliation** — only endpoint that tells you a returned parcel is actually back with you.

#### Response (200)
```json
{
  "status": 200,
  "delivery_status": "cancelled_return_rider_assigned"
}
```

---

### `GET /status_by_invoice/{invoice}`
**Same answer, by your own order number.**  
If same invoice booked twice, returns most recent.

#### Response (200)
```json
{
  "status": 200,
  "delivery_status": "pending"
}
```

---

### `GET /status_by_trackingcode/{tracking_code}`
**Same answer, by tracking code.**

#### Response (200)
```json
{
  "status": 200,
  "delivery_status": "in_review"
}
```

---

### `GET /trackings_by_invoice/{invoice}`
**Every step a parcel has been through, not just current state.**  
**This is what to show a customer asking "where is my order?"**

#### Response (200)
```json
{
  "status": 200,
  "tracking": [
    {
      "consignment_id": 1424107,
      "tracking_type": 2,
      "text": "Consignment created by Sender(API).",
      "created_at": "2026-09-20T07:05:31.000000Z"
    },
    {
      "consignment_id": 1424107,
      "tracking_type": 2,
      "text": "Parcel received at Dhanmondi hub.",
      "created_at": "2026-09-20T11:22:04.000000Z"
    }
  ]
}
```

---

## Parcels by State

### `GET /parcel_states`
**Counts per dashboard state + COD amounts. Live, not cached.**

#### Response (200)
```json
{
  "status": 200,
  "states": {
    "in_review": {
      "count": 12,
      "cod_amount": 18450
    },
    "delivery_processing": {
      "count": 87,
      "cod_amount": 142300
    },
    "cod_processing": {
      "count": 9,
      "cod_amount": 11260
    },
    "return_requests": {
      "count": 2
    }
  }
}
```

**State Meanings:**
| State | Meaning |
|-------|---------|
| `in_review` | Booked, waiting for approval |
| `delivery_processing` | Approved, with rider, not delivered |
| `cod_processing` | Rider finished, waiting for approval. COD only counts delivered/partly delivered parcels. |
| `return_requests` | Hub asked you to agree to cancel — not your own return requests |

Each key sees its own profile (business key = business parcels, account key = account parcels).

---

### `GET /parcel_states/{state}`
**Parcels in one state, latest first, paginated.**

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | Yes | One of: `in_review`, `delivery_processing`, `cod_processing`, `return_requests` |

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `sort` | string | `desc` (latest first, default) or `asc` |
| `per_page` | number | 1-100, default 20 |
| `page` | number | Page number, default 1 |

#### Response (200)
```json
{
  "status": 200,
  "state": "delivery_processing",
  "data": [
    {
      "consignment_id": 1424107,
      "invoice": "ORD-10231",
      "tracking_code": "15BAEB8A",
      "tracking_link": "https://steadfast.com.bd/t1/a1b2c3d4",
      "recipient_name": "Jahid Hasan",
      "recipient_phone": "01712345678",
      "recipient_address": "House 17/1, Road 3/A, Dhanmondi, Dhaka-1209",
      "recipient_email": null,
      "alternative_phone": null,
      "item_description": null,
      "total_lot": 1,
      "cod_amount": 1066,
      "exchange": false,
      "status": "pending",
      "note": "Call before 3 PM",
      "created_at": "2026-11-10T07:05:31.000000Z",
      "updated_at": "2026-11-10T09:12:04.000000Z"
    }
  ],
  "meta": {
    "total": 87,
    "per_page": 20,
    "current_page": 1,
    "last_page": 5,
    "sort": "desc"
  }
}
```

**Notes:**
- Each parcel has same fields as `create_order` response
- Page through until `current_page` = `last_page`
- For `return_requests`: each entry is hub's request with `request_id`, `reason_id`, `reason`, `note`, `requested_at`, `consignment` (the parcel)
- Parcels move between states — paging a busy state may show duplicates or miss recent moves

---

## Stats

### `GET /stats`
**Counts and COD per outcome for parcels booked in a date range.**

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | string | First day `YYYY-MM-DD`. Default: 30 days ago |
| `to` | string | Last day `YYYY-MM-DD` (inclusive). Default: today |

#### Response (200)
```json
{
  "status": 200,
  "from": "2026-10-01",
  "to": "2026-10-31",
  "total": {
    "count": 412,
    "cod_amount": 628450
  },
  "success_rate": 84,
  "cancel_rate": 9,
  "delivered": {
    "count": 331,
    "cod_amount": 512300,
    "share": 80
  },
  "partial": {
    "count": 16,
    "cod_amount": 21400,
    "share": 4
  },
  "cancelled": {
    "count": 37,
    "cod_amount": 52650,
    "share": 9
  },
  "pending": {
    "count": 21,
    "cod_amount": 33900,
    "share": 5
  },
  "approval": {
    "count": 7,
    "cod_amount": 8200,
    "share": 2
  }
}
```

**Key Points:**
- Parcels counted by booking day
- Each falls in exactly one outcome: `delivered`, `partial`, `cancelled`, `pending`, `approval`
- Parcels in review/on hold not counted
- `success_rate` = (delivered + partial) / total × 100
- `cancel_rate` and `share` = percentage of total, rounded
- Any range works back to first parcel

---

## Pickups

### `POST /create_pickup_request`
**Ask a rider to collect from one of your addresses.** Returns **201**.

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address_id` | number | Yes | Your saved pickup address ID (from Pickup Addresses page) |
| `police_station_id` | number | Yes | Thana the address is in (from `/police_stations`) |
| `address` | string | Yes | Address in words, max 255 chars |
| `contact_number` | string | Yes | Who rider should call. 11 digits starting 013-079 |
| `note` | string | No | Rider instructions, max 500 chars |
| `estm_qty` | number | No | Rough parcel count waiting |

#### Request Example
```json
{
  "address_id": 42,
  "police_station_id": 17,
  "address": "House 17/1, Road 3/A, Dhanmondi, Dhaka",
  "contact_number": "01712345678",
  "estm_qty": 25
}
```

#### Response (201)
```json
{
  "message": "Pickup request created successfully.",
  "data": {
    "id": 9081,
    "user_id": 12345,
    "user_address_id": 42,
    "police_station_id": 17,
    "pickup_location": "House 17/1, Road 3/A, Dhanmondi, Dhaka",
    "contact_number": "01712345678",
    "note": null,
    "estm_qty": 25,
    "req_status": 6,
    "created_at": "2026-09-20T07:05:31.000000Z"
  }
}
```

**Notes:**
- Asking twice for same address while pending → `409` with `PICKUP_REQUEST_EXISTS`
- Safe to retry — won't get two riders

---

## Returns

### `POST /create_return_request`
**Ask for a parcel to come back before delivery.** Returns **201**.

#### Fields (one required)
| Field | Type | Description |
|-------|------|-------------|
| `consignment_id` | number | Parcel by Steadfast ID |
| `invoice` | string | Your order number |
| `tracking_code` | string | Tracking code |
| `reason` | string | Why. Max 500 chars. |

#### Request Example
```json
{
  "invoice": "ORD-10231",
  "reason": "Customer changed their mind"
}
```

#### Response (201)
```json
{
  "user_id": 12345,
  "consignment_id": 1424107,
  "reason": "Customer changed their mind",
  "status": "pending",
  "created_at": "2026-09-20T23:11:45.000000Z",
  "updated_at": "2026-09-20T23:11:45.000000Z"
}
```

**Refusals:**
- `422` for already delivered parcel
- `422` for parcel already returning
- `422` for duplicate request while first is open

**Statuses:** `pending`, `approved`, `processing`, `completed`, `cancelled`

---

### `GET /get_return_requests`
**Your return requests, newest first, 10 per page.**  
Paginated: add `?page=2` for next page.

---

### `GET /get_return_request/{id}`
**One return request with the parcel it's about.**

---

## Balance and Payments

### `GET /get_balance`
**What Steadfast currently owes you.**

#### Response (200)
```json
{
  "status": 200,
  "current_balance": 12450
}
```
Delivered COD, less delivery charges, less 1% collection charge. This is what you could request a payout of right now.

---

### `GET /payments`
**Payouts made to you, 10 per page.**

#### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `sort` | string | `asc` (oldest first, default) or `desc` (latest first). Other values → `422` |
| `page` | number | Page number, default 1 |

#### Response (200)
```json
{
  "status": 1,
  "alertClass": "success",
  "message": "Fetched successfully!",
  "payments": [
    {
      "payment_id": "SFC-08213",
      "amount": 12450,
      "method": "bKash",
      "due_bills": 0,
      "paid_bills": 3200,
      "charges": 124,
      "total": 12450,
      "status_label": "Paid",
      "created_at": "2026-09-18 11:64:22",
      "ready_at": "2026-09-18 12:00:00",
      "paid_at": "2026-09-19 10:31:67"
    }
  ]
}
```

---

### `GET /payments/{payment_id}`
**One payout with every parcel it settled.**  
Pass number only (`SFC-88213` = `88213`; non-digits ignored).  
**Use this to reconcile a payout against your own orders** — each parcel returns in full including your `invoice`.

---

## Lookups

### `GET /police_stations`
**Every thana delivered to, with its district.**  
Changes rarely — fetch occasionally and cache.

---

### `GET /fraud_check/score/{phone}`
**Customer's delivery record: arrival rate, return rate, merchant reports.**

#### Response (200)
```json
{
  "status": 200,
  "phone": "01712345678",
  "delivery_ratio": 92,
  "cancellation_ratio": 7,
  "volume_band": "high",
  "volume_range": "50+",
  "delivered_count": 58,
  "cancelled_count": 5,
  "total_reports": 8,
  "fraud_categories": [{"no_response": 3, "refused": 1}],
  "score": null,
  "level": null,
  "reasons": [],
  "scoring_disabled": true,
  "doubtful_reports": false
}
```

**Field Meanings:**
| Field | Meaning |
|-------|---------|
| `delivery_ratio` | Whole % of FINISHED parcels delivered (partial = delivered) |
| `cancellation_ratio` | Whole % of FINISHED parcels cancelled |
| `volume_band` | `none`, `low` (1-5), `medium` (6-20), `high` (21-200), `very_high` (200+) |
| `volume_range` | Exact below 10 ("7"), then steps: "10+", "25+", "50+", "100+" |
| `delivered_count` / `cancelled_count` | Exact counts behind ratios. Filled only when booking regularly (parcels on ≥3 of last 7 days or >3 approved in 24h). Otherwise `null`. |
| `fraud_categories` | Report codes + counts, worst first |
| `total_reports` | Can exceed sum of categories (pre-category reports) |

**Important Notes:**
- `null` = "we don't know" — not the same as clean record. Don't render `null` as clean.
- Ratios rounded down independently — can sum to 99 not 100 (deliberate)
- **SCORING IS DISABLED** — `score`, `level` always `null`, `reasons` empty, `scoring_disabled: true`
- Built from ALL merchants' history with that number, not just yours
- Rate limited: ~4 checks per parcel on busiest day + 10
- **A signal, not a verdict** — cancelled parcel ≠ proof of fraud

**Migration:** Old `GET /fraud_check/{phone}` stops returning counts on **27 September 2026**. Move to this endpoint before then. Sends `Deprecation` and `Sunset` headers meantime.

---

## Status Reference

### Delivery Statuses
**Anything ending `_approval_pending` = rider's word, not confirmed. Don't settle books on it — wait for `delivered`, `partial_delivered`, or `cancelled`.**

| Status | Meaning |
|--------|---------|
| `pending` | Booked and with Steadfast. Not yet attempted. |
| `in_review` | Just created, awaiting approval. Every parcel starts here. |
| `hold` | Held — usually address or payment question. Contact support. |
| `delivered_approval_pending` | Rider marked delivered; accounts not confirmed. |
| `partial_delivered_approval_pending` | Rider marked partially delivered; awaiting confirmation. |
| `cancelled_approval_pending` | Rider marked cancelled; awaiting confirmation. |
| `unknown_approval_pending` | Awaiting confirmation, outcome not above. |
| `delivered` | Delivered and confirmed. COD now owed. |
| `partial_delivered` | Part delivered and confirmed. |
| `cancelled` | Not delivered and confirmed. Parcel returns to you. |
| `exceptional` | Lost, damaged, off normal path. Contact support. |
| `unknown` | Not a state this API recognizes. Treat as "ask us". |

### Return Statuses
**Only from `/status_with_return_status_by_cid/{id}`, only for parcels that didn't fully arrive.**

| Status | Meaning |
|--------|---------|
| `partial_delivered_return_processing` | Part delivered; rest being prepared for return. |
| `partial_delivered_return_rider_assigned` | Part delivered; rider bringing rest back. |
| `partial_delivered_return_received` | Part delivered; you have rest back. |
| `cancelled_return_processing` | Cancelled; being prepared for return. |
| `cancelled_return_rider_assigned` | Cancelled; rider bringing it back. |
| `cancelled_return_received` | Cancelled; you have it back. |

---

## Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `200` | Done, or answered | Some endpoints report per-item failure inside 200 — always read body |
| `400` | Request not understood | Usually malformed/missing `data` on bulk call |
| `401` | Not authenticated / not yours | Wrong/revoked credentials, or parcel belongs to another profile |
| `403` | Authenticated but not allowed | Inactive account, or KYC details need resubmitting |
| `422` | Field rejected | Read `errors` for field names |
| `429` | Too many requests/failures | Back off. Repeated bad credentials lock client out |
| `500` | Server fault | Retry with same invoice; duplicates refused so retry won't double-book |

---

## Webhooks

**Status answers are cached for 60 seconds** — asking more often wastes requests and tells you nothing.  
**Give a webhook URL instead** — Steadfast will notify you when:
- A parcel moves
- A return request is accepted
- A payout is made

See Webhooks documentation in the dashboard.

---

## Quick Reference: All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ping` | Service check (no auth) |
| `POST` | `/create_order` | Book one parcel |
| `POST` | `/create_order/bulk-order` | Book up to 500 parcels |
| `POST` | `/create_order/bulk-order/extended` | Bulk with human-readable errors |
| `GET` | `/status_by_cid/{consignment_id}` | Parcel status by Steadfast ID |
| `GET` | `/status_with_return_status_by_cid/{consignment_id}` | Status + return progress |
| `GET` | `/status_by_invoice/{invoice}` | Status by your invoice |
| `GET` | `/status_by_trackingcode/{tracking_code}` | Status by tracking code |
| `GET` | `/trackings_by_invoice/{invoice}` | Full tracking history |
| `GET` | `/parcel_states` | Counts per dashboard state |
| `GET` | `/parcel_states/{state}` | Parcels in one state (paginated) |
| `GET` | `/stats` | Outcome stats for date range |
| `POST` | `/create_pickup_request` | Request pickup (201) |
| `POST` | `/create_return_request` | Request return (201) |
| `GET` | `/get_return_requests` | List return requests (paginated) |
| `GET` | `/get_return_request/{id}` | One return request |
| `GET` | `/get_balance` | Current balance owed |
| `GET` | `/payments` | Payouts list (paginated) |
| `GET` | `/payments/{payment_id}` | One payout with parcels |
| `GET` | `/police_stations` | All thanas with districts |
| `GET` | `/fraud_check/score/{phone}` | Customer delivery record |

---

## Best Practices Summary

1. **Use `/ping`** for connectivity, `/get_balance` for credential check
2. **Cache status responses** — don't poll faster than 60s
3. **Use webhooks** for real-time updates
4. **Use `bulk-order/extended`** for new integrations (human errors)
5. **Always read bulk responses** — partial success is normal
6. **Keep `consignment_id` + `tracking_code`** from creation
7. **Use `status_with_return_status_by_cid`** for stock reconciliation
8. **Don't settle on `_approval_pending`** statuses
9. **Fetch `/police_stations` occasionally**, not per order
10. **Migrate from old fraud check** before 27 Sep 2026

---

*Generated from Steadfast Courier API Guide — © 2026 Steadfast Courier Ltd*
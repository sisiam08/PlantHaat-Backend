# Backend Change Requests — PlantHaat Phase 2

These are frontend needs discovered during the 2026 redesign. No backend code is modified
by the frontend work; each item is scoped, evidence-based, and optional unless marked.

## 1. Catalog list enrichment (`GET /products`) — needed for the full product card

**Current:** `ProductListItemDto` exposes one `image`, `minPrice`/`maxPrice`, `inStock`,
`ratingAvg`/`ratingCount`, `soldCount`, `shop { id, name, slug }`, `category`.

**Requested (additive, nullable):**

| Field | Why |
|---|---|
| `images: ImageSummaryDto[]` (or `secondaryImageUrl`) | Hover second-image crossfade on product cards. |
| `minCompareAtPrice: string \| null` | Struck-through compare-at price + honest offer badge. |
| `shop.verified: boolean` | Verified-seller badge on the card/PDP summary. |
| `shop.ratingAvg` / `shop.ratingCount` | Seller rating on the card; currently only on the detail DTO. |
| `stockQty` or `lowStock: boolean` | Low-stock badge on the card. |
| `lightRequirement` | One care chip on the card (light need), when available. |
| `isPetSafe` | Second care chip on the card (pet-safe), when available. |

**Fallback until delivered:** the card renders only provable data (image, name, price, rating
when `ratingCount > 0`, stock state). Product cards have no add-to-cart control (owner
decision); the PDP does the selling. No fake badges or prices.

## 2. Seller product list pagination/filter (`GET /seller/products`)

**Current:** the endpoint accepts no `page`/`limit`/`status` query params
(`backend/src/modules/products/seller-products.controller.ts`), so the client fetches the
entire catalogue and filters/paginates in memory. This will not scale past a few hundred
products.

**Requested:** accept `page`, `limit`, `status` and return the standard pagination meta
(`page`, `limit`, `total`, `totalPages`) plus status counts if cheap.

**Fallback until delivered:** client-side filtering + pagination over the full list (current
behaviour), with a virtualization pass if the list grows.

## 3. Wishlist/notifications pagination confirmation

`GET /wishlist` and `GET /notifications` already paginate server-side and the clients now use
`page`/meta. Please confirm the default/max `limit` so the UI can size "Load more" batches and
avoid empty trailing pages.

---

**Priority:** #1 unlocks the approved card design; #2 is scalability; #3 is a confirmation.


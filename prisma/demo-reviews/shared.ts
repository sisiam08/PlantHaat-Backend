/**
 * Shared constants and the review plan for the optional demo-review seed.
 *
 * Rows created by this seed are identifiable by two markers:
 *  - review ids start with `seedrvw_`
 *  - order numbers start with `DEMO-RVW-`
 *
 * `seed-demo-reviews.ts` only creates these rows; `seed-demo-reviews-cleanup.ts`
 * removes exactly those rows and recomputes the denormalized rating columns.
 */

export const DEMO_REVIEW_ID_PREFIX = "seedrvw_";
export const DEMO_REVIEW_ORDER_PREFIX = "DEMO-RVW-";

export interface DemoReviewPlanEntry {
  /** Index into the eight selected demo products. */
  slot: number;
  /** 1..5 */
  rating: number;
  title: string;
  comment: string;
  /** Index into the demo customer list (0..4). */
  customer: number;
}

/**
 * 20 reviews across 8 products: five products with several reviews and three
 * with a single review. Ratings are varied so averages are not all 5.0.
 */
export const DEMO_REVIEW_PLAN: DemoReviewPlanEntry[] = [
  {
    slot: 0,
    rating: 5,
    title: "Arrived healthy and well packed",
    comment: "The leaves were firm and the pot was wrapped carefully. Already sprouting new growth.",
    customer: 0,
  },
  {
    slot: 0,
    rating: 4,
    title: "Good value",
    comment: "Slightly smaller than I expected but very healthy. Delivery took three days.",
    customer: 1,
  },
  {
    slot: 0,
    rating: 5,
    title: "Second order from this shop",
    comment: "Consistent quality and the soil mix was ready to use.",
    customer: 2,
  },
  {
    slot: 0,
    rating: 4,
    title: "Nice plant",
    comment: "Two leaves were bruised on arrival but it recovered within a week.",
    customer: 3,
  },
  {
    slot: 0,
    rating: 3,
    title: "Average",
    comment: "Plant is fine but the pot had a small crack.",
    customer: 4,
  },
  {
    slot: 1,
    rating: 5,
    title: "Beautiful colour",
    comment: "Exactly like the photos. Packaging was neat and no soil spilled.",
    customer: 0,
  },
  {
    slot: 1,
    rating: 4,
    title: "Happy with it",
    comment: "Healthy roots and it is doing well on my balcony.",
    customer: 2,
  },
  {
    slot: 1,
    rating: 4,
    title: "Would buy again",
    comment: "Good size for the price and the seller answered my questions quickly.",
    customer: 4,
  },
  {
    slot: 2,
    rating: 5,
    title: "Perfect for beginners",
    comment: "Low maintenance and it looks great on a desk.",
    customer: 1,
  },
  {
    slot: 2,
    rating: 5,
    title: "Thriving",
    comment: "New leaves after two weeks. Very well packed.",
    customer: 3,
  },
  {
    slot: 3,
    rating: 4,
    title: "Solid quality",
    comment: "Arrived on time and matched the description.",
    customer: 0,
  },
  {
    slot: 3,
    rating: 5,
    title: "Great plant",
    comment: "Bigger than expected and very fresh.",
    customer: 2,
  },
  {
    slot: 3,
    rating: 3,
    title: "Okay",
    comment: "One branch was broken, but the rest was fine.",
    customer: 4,
  },
  {
    slot: 3,
    rating: 4,
    title: "Good purchase",
    comment: "Healthy plant, delivery a day later than promised.",
    customer: 1,
  },
  {
    slot: 4,
    rating: 5,
    title: "Lovely",
    comment: "Exactly what I wanted for the living room.",
    customer: 3,
  },
  {
    slot: 5,
    rating: 4,
    title: "Does the job",
    comment: "Sturdy and well finished for the price.",
    customer: 2,
  },
  {
    slot: 5,
    rating: 3,
    title: "Decent",
    comment: "Colour is slightly different from the photo.",
    customer: 0,
  },
  {
    slot: 6,
    rating: 5,
    title: "Excellent",
    comment: "Fast delivery and careful packaging.",
    customer: 4,
  },
  {
    slot: 7,
    rating: 4,
    title: "Good",
    comment: "Works as described and arrived in good condition.",
    customer: 1,
  },
  {
    slot: 7,
    rating: 5,
    title: "Very satisfied",
    comment: "Exactly the size I needed.",
    customer: 3,
  },
];

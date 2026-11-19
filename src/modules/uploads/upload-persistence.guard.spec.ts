import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PERSISTENCE_FILES = [
  "src/modules/products/seller-products.service.ts",
  "src/modules/admin/admin-categories.service.ts",
  "src/modules/sellers/shops.service.ts",
  "src/modules/users/users.service.ts",
  "src/modules/content/content.service.ts",
  "src/modules/reviews/reviews.service.ts",
  "src/modules/complaints/complaints.service.ts",
  "src/modules/payments/payments.service.ts",
];

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("upload persistence guard", () => {
  it("attaches uploads inside the entity transaction in every persistence flow", () => {
    for (const file of PERSISTENCE_FILES) {
      expect(read(file)).toContain("attachAssetsInTransaction");
    }
  });

  it("does not use the non-transactional attach helper outside UploadsService", () => {
    for (const file of PERSISTENCE_FILES) {
      expect(read(file)).not.toMatch(/uploads\.attachAsset\(/);
      expect(read(file)).not.toMatch(/uploads\.attachAssets\(/);
    }
  });
});

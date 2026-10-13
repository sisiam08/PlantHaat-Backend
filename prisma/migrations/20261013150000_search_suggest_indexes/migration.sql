-- Search suggestions: GIN trigram indexes on Category.name / Category.nameBn
-- and Shop.name (Product already had them from 20261010043000).
CREATE INDEX IF NOT EXISTS category_name_trgm_idx
  ON "Category" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS category_name_bn_trgm_idx
  ON "Category" USING GIN ("nameBn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS shop_name_trgm_idx
  ON "Shop" USING GIN ("name" gin_trgm_ops);

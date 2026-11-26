-- Safe, idempotent backfill of the two nationwide seller conditions.
-- Existing condition rows (including custom payment modes/charges) are untouched.
WITH legacy_ranked AS (
  SELECT
    z."shopId",
    z."charge",
    z."freeDeliveryAbove",
    z."estimatedDaysMin",
    z."estimatedDaysMax",
    CASE
      WHEN z."isNationwide" THEN 1
      WHEN EXISTS (
        SELECT 1 FROM "ZoneDistrict" zd
        JOIN "District" d ON d."id" = zd."districtId"
        WHERE zd."zoneId" = z."id" AND d."insideDhaka" = true
      ) THEN 0
      ELSE 2
    END AS inside_rank,
    CASE
      WHEN z."isNationwide" THEN 0
      WHEN EXISTS (
        SELECT 1 FROM "ZoneDistrict" zd
        JOIN "District" d ON d."id" = zd."districtId"
        WHERE zd."zoneId" = z."id" AND d."insideDhaka" = false
      ) THEN 1
      ELSE 2
    END AS outside_rank,
    ROW_NUMBER() OVER (
      PARTITION BY z."shopId" ORDER BY
        CASE
          WHEN z."isNationwide" THEN 1
          WHEN EXISTS (
            SELECT 1 FROM "ZoneDistrict" zd
            JOIN "District" d ON d."id" = zd."districtId"
            WHERE zd."zoneId" = z."id" AND d."insideDhaka" = true
          ) THEN 0
          ELSE 2
        END,
        z."charge" ASC, z."id" ASC
    ) AS inside_rn,
    ROW_NUMBER() OVER (
      PARTITION BY z."shopId" ORDER BY
        CASE
          WHEN z."isNationwide" THEN 0
          WHEN EXISTS (
            SELECT 1 FROM "ZoneDistrict" zd
            JOIN "District" d ON d."id" = zd."districtId"
            WHERE zd."zoneId" = z."id" AND d."insideDhaka" = false
          ) THEN 1
          ELSE 2
        END,
        z."charge" ASC, z."id" ASC
    ) AS outside_rn
  FROM "ShopDeliveryZone" z
  WHERE z."condition" IS NULL AND z."isActive" = true
),
source AS (
  SELECT "shopId", 'INSIDE_DHAKA'::"DeliveryCondition" AS condition, "charge", "freeDeliveryAbove", "estimatedDaysMin", "estimatedDaysMax"
  FROM legacy_ranked WHERE inside_rn = 1
  UNION ALL
  SELECT "shopId", 'OUTSIDE_DHAKA'::"DeliveryCondition" AS condition, "charge", "freeDeliveryAbove", "estimatedDaysMin", "estimatedDaysMax"
  FROM legacy_ranked WHERE outside_rn = 1
)
INSERT INTO "ShopDeliveryZone" (
  "id", "shopId", "name", "isNationwide", "charge", "freeDeliveryAbove",
  "estimatedDaysMin", "estimatedDaysMax", "isActive", "condition", "paymentMode",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  CASE c.condition WHEN 'INSIDE_DHAKA' THEN 'Inside Dhaka' ELSE 'Outside Dhaka' END,
  true,
  COALESCE(src."charge", 0),
  src."freeDeliveryAbove",
  COALESCE(src."estimatedDaysMin", 1),
  COALESCE(src."estimatedDaysMax", 3),
  true,
  c.condition,
  'COD_AND_ADVANCE'::"DeliveryPaymentMode",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Shop" s
CROSS JOIN (VALUES ('INSIDE_DHAKA'::"DeliveryCondition"), ('OUTSIDE_DHAKA'::"DeliveryCondition")) AS c(condition)
LEFT JOIN source src ON src."shopId" = s."id" AND src.condition = c.condition
WHERE NOT EXISTS (
  SELECT 1 FROM "ShopDeliveryZone" existing
  WHERE existing."shopId" = s."id" AND existing."condition" = c.condition
)
ON CONFLICT ("shopId", "condition") DO NOTHING;

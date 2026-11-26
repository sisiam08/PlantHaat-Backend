-- Additive: some Steadfast lookup rows are placeholders, not address-level thanas.
ALTER TABLE "Thana" ADD COLUMN "selectableByCustomer" BOOLEAN NOT NULL DEFAULT true;

-- Known placeholder in the Packzy/Steadfast lookup. Do not delete the row.
UPDATE "Thana" SET "selectableByCustomer" = false WHERE "name" = 'Zone Not Clear';

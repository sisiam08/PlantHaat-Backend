/**
 * Test-only reconciliation breach fixture.
 *
 * Usage (from backend/):
 *   node --import tsx scripts/part4-breach-test.ts insert
 *   node --import tsx scripts/part4-breach-test.ts restore <entryId>
 *
 * Refuses to run unless the database is `planthaat_test` on the approved Neon
 * host. Inserts one tiny buyer-receipt entry with no matching bucket, so the
 * admin reconciliation page can show the breach state. Always run `restore`
 * afterwards (the inserted id is printed, never any account/personal data).
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { Prisma } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const approvedHost = "ep-late-sound-b3o84uag-pooler.c-4.ap-southeast-1.aws.neon.tech";

function assertSafe() {
  let parsed: URL;
  try {
    parsed = new URL(DATABASE_URL);
  } catch {
    throw new Error("Missing/invalid DATABASE_URL in .env.test");
  }
  const database = parsed.pathname.replace(/^\//, "");
  if (database !== "planthaat_test" || parsed.hostname !== approvedHost) {
    throw new Error("Refusing: this fixture only runs on planthaat_test at the approved host");
  }
}

async function main() {
  assertSafe();
  const [action, entryId] = process.argv.slice(2);
  const prisma = createPrismaClient();
  try {
    if (action === "insert") {
      const entry = await prisma.ledgerEntry.create({
        data: {
          type: "ADJUSTMENT_CREDIT",
          account: "BUYER_RECEIPTS",
          amount: new Prisma.Decimal("0.01"),
          description: "TEST-ONLY reconciliation breach fixture",
          batchId: "part4-breach-fixture",
          idempotencyKey: `part4_breach_fixture:${Date.now()}`,
        },
      });
      console.log(`BREACH_ID=${entry.id}`);
      return;
    }
    if (action === "restore" && entryId) {
      const deleted = await prisma.ledgerEntry.deleteMany({
        where: { id: entryId, batchId: "part4-breach-fixture" },
      });
      console.log(`RESTORED=${deleted.count}`);
      return;
    }
    throw new Error("Use: insert | restore <entryId>");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Fixture failed");
  process.exit(1);
});

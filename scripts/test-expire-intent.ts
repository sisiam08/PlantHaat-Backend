/**
 * Test-stack helper: force a PaymentIntent past its expiry and run the real
 * expiry job. Refuses to run unless DATABASE_URL points at the test database.
 *
 * Usage: node --import tsx scripts/test-expire-intent.ts <orderId>
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(".env.test"), override: true });

if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing: this helper only runs against the test database");
}

const orderId = process.argv[2];
if (!orderId) throw new Error("Usage: test-expire-intent.ts <orderId>");

const { NestFactory } = await import("@nestjs/core");
// @ts-expect-error dist is built before the helper runs
const { AppModule } = await import("../dist/app.module.js");
// @ts-expect-error dist is built before the helper runs
const { PrismaService } = await import("../dist/prisma/prisma.service.js");
// @ts-expect-error dist is built before the helper runs
const { PaymentsService } = await import("../dist/modules/payments/payments.service.js");

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const prisma = app.get(PrismaService);
  const payments = app.get(PaymentsService);
  await prisma.paymentIntent.updateMany({
    where: { orderId, status: "UNPAID" },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const expired = await payments.expireUnpaid();
  const intent = await prisma.paymentIntent.findFirst({ where: { orderId } });
  const stock = await prisma.orderItem.findFirst({ where: { shopOrder: { orderId } } });
  console.log(JSON.stringify({ expired, status: intent?.status, itemId: stock?.id }));
} finally {
  await app.close();
}

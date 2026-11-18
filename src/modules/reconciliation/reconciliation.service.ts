import { Injectable } from "@nestjs/common";

import { money } from "../../common/utils/money";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueryReconciliationDto } from "./dto/query-reconciliation.dto";

export interface ReconciliationViolation {
  code: string;
  entityType: string;
  entityId: string;
  message: string;
  expected?: string;
  actual?: string;
}

function dec(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async run(query: QueryReconciliationDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);
    const violations: ReconciliationViolation[] = [];
    let checked = 0;

    const orders = await this.prisma.order.findMany({
      where: { placedAt: { gte: from, lte: to } },
      select: { id: true, orderNumber: true, grandTotal: true, shopOrders: { select: { id: true, total: true } } },
    });
    for (const order of orders) {
      checked += 1;
      const shopTotals = order.shopOrders.reduce(
        (sum, shopOrder) => sum.plus(shopOrder.total),
        new Prisma.Decimal(0),
      );
      const expected = money(order.grandTotal);
      const actual = money(shopTotals);
      if (!expected.equals(actual)) {
        violations.push({
          code: "ORDER_TOTAL_MISMATCH",
          entityType: "Order",
          entityId: order.id,
          message: `Order ${order.orderNumber} grand total does not match the sum of shop order totals`,
          expected: expected.toFixed(2),
          actual: actual.toFixed(2),
        });
      }
    }

    const shopOrders = await this.prisma.shopOrder.findMany({
      where: {
        OR: [
          { createdAt: { gte: from, lte: to } },
          { deliveredAt: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        shopOrderNumber: true,
        status: true,
        total: true,
        commissionAmount: true,
        sellerNetAmount: true,
        deliveredAt: true,
        order: { select: { paymentMethod: true } },
        ledgerEntries: { select: { type: true, amount: true, account: true } },
      },
    });
    for (const shopOrder of shopOrders) {
      checked += 1;
      const expectedTotal = money(dec(shopOrder.total));
      const parts = money(dec(shopOrder.commissionAmount).plus(dec(shopOrder.sellerNetAmount)));
      if (!parts.equals(expectedTotal)) {
        violations.push({
          code: "SHOP_TOTAL_SPLIT_MISMATCH",
          entityType: "ShopOrder",
          entityId: shopOrder.id,
          message: `commission + seller net does not equal the shop total (${shopOrder.shopOrderNumber})`,
          expected: expectedTotal.toFixed(2),
          actual: parts.toFixed(2),
        });
      }

      if (shopOrder.status === "DELIVERED") {
        const accounting = shopOrder.ledgerEntries.filter((entry) => entry.account);
        if (accounting.length > 0) {
          const expectedAccount =
            shopOrder.order.paymentMethod === "COD" ? "COD_DUES" : "SELLER_PENDING";
          if (!accounting.some((entry) => entry.account === expectedAccount)) {
            violations.push({
              code: "LEDGER_MISSING",
              entityType: "ShopOrder",
              entityId: shopOrder.id,
              message: `Delivered shop order ${shopOrder.shopOrderNumber} has no ${expectedAccount} ledger entry`,
            });
          }
        } else {
          const expectedType =
            shopOrder.order.paymentMethod === "COD" ? "COD_COMMISSION_DUE" : "ORDER_EARNING";
          const expectedAmount =
            expectedType === "COD_COMMISSION_DUE"
              ? money(dec(shopOrder.commissionAmount).negated())
              : money(dec(shopOrder.sellerNetAmount));
          const matching = shopOrder.ledgerEntries.filter((entry) => entry.type === expectedType);
          if (matching.length === 0) {
            violations.push({
              code: "LEDGER_MISSING",
              entityType: "ShopOrder",
              entityId: shopOrder.id,
              message: `Delivered shop order ${shopOrder.shopOrderNumber} has no ${expectedType} ledger entry`,
              expected: expectedAmount.toFixed(2),
            });
          } else if (matching.length > 1) {
            violations.push({
              code: "LEDGER_DUPLICATE",
              entityType: "ShopOrder",
              entityId: shopOrder.id,
              message: `Delivered shop order ${shopOrder.shopOrderNumber} has ${matching.length} ${expectedType} entries`,
            });
          } else {
            const amount = money(dec(matching[0].amount));
            if (!amount.equals(expectedAmount)) {
              violations.push({
                code: "LEDGER_AMOUNT_MISMATCH",
                entityType: "ShopOrder",
                entityId: shopOrder.id,
                message: `Ledger entry amount does not match the delivered shop order (${shopOrder.shopOrderNumber})`,
                expected: expectedAmount.toFixed(2),
                actual: amount.toFixed(2),
              });
            }
          }
        }
      }
    }

    // Total payouts per seller must never exceed their positive ledger credits.
    const [payouts, ledgerTotals] = await Promise.all([
      this.prisma.payout.groupBy({
        by: ["sellerProfileId"],
        where: { createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ["sellerProfileId"],
        where: { amount: { gt: 0 } },
        _sum: { amount: true },
      }),
    ]);
    const credits = new Map(
      ledgerTotals.map((row) => [row.sellerProfileId, dec(row._sum.amount)]),
    );
    for (const row of payouts) {
      checked += 1;
      const paid = money(dec(row._sum.amount));
      const availableCredits = money(credits.get(row.sellerProfileId) ?? new Prisma.Decimal(0));
      if (paid.gt(availableCredits)) {
        violations.push({
          code: "PAYOUT_EXCEEDS_CREDITS",
          entityType: "SellerProfile",
          entityId: row.sellerProfileId,
          message: "Total payouts exceed the seller's positive ledger credits",
          expected: availableCredits.toFixed(2),
          actual: paid.toFixed(2),
        });
      }
    }

    // Refunds cannot exceed what was paid for the shop order.
    const refunds = await this.prisma.refund.groupBy({
      by: ["shopOrderId"],
      where: {
        createdAt: { gte: from, lte: to },
        status: { in: ["APPROVED", "PROCESSED"] },
      },
      _sum: { amount: true },
    });
    if (refunds.length > 0) {
      const totals = new Map(
        (
          await this.prisma.shopOrder.findMany({
            where: { id: { in: refunds.map((row) => row.shopOrderId) } },
            select: { id: true, total: true },
          })
        ).map((row) => [row.id, row.total]),
      );
      for (const row of refunds) {
        checked += 1;
        const refunded = money(dec(row._sum.amount));
        const paid = money(dec(totals.get(row.shopOrderId)));
        if (refunded.gt(paid)) {
          violations.push({
            code: "REFUND_EXCEEDS_PAID",
            entityType: "ShopOrder",
            entityId: row.shopOrderId,
            message: "Refunds exceed the paid amount for the shop order",
            expected: paid.toFixed(2),
            actual: refunded.toFixed(2),
          });
        }
      }
    }

    // A5: settlement ledger conservation (advance money only; COD dues are
    // tracked separately). receipts = all money buckets + paid out + commission.
    const accountTotals = await this.prisma.ledgerEntry.groupBy({
      by: ["account"],
      where: { account: { not: null } },
      _sum: { amount: true },
    });
    const accountValue = (account: string) =>
      dec(accountTotals.find((row) => row.account === account)?._sum?.amount);
    const receipts = accountValue("BUYER_RECEIPTS");
    const bucketTotal = [
      "PLATFORM_HOLDINGS",
      "SELLER_PENDING",
      "SELLER_AVAILABLE",
      "SELLER_ON_HOLD",
      "SELLER_WITHDRAWAL_RESERVED",
      "REFUND_PAYABLE",
      "PLATFORM_COMMISSION",
      "SELLER_PAID_OUT",
      "REFUNDS_PAID",
    ].reduce((sum, account) => sum.plus(accountValue(account)), new Prisma.Decimal(0));
    const difference = money(receipts.minus(bucketTotal));
    if (!difference.isZero()) {
      checked += 1;
      violations.push({
        code: "SETTLEMENT_CONSERVATION_BREACH",
        entityType: "SettlementLedger",
        entityId: "all",
        message: "Buyer receipts do not equal settlement buckets plus payouts",
        expected: money(receipts).toFixed(2),
        actual: money(bucketTotal).toFixed(2),
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      checked,
      violations,
      settlement: {
        receipts: money(receipts).toFixed(2),
        buckets: money(bucketTotal).toFixed(2),
        difference: difference.toFixed(2),
        balanced: difference.isZero(),
        codDues: money(accountValue("COD_DUES").negated()).toFixed(2),
      },
    };
  }
}

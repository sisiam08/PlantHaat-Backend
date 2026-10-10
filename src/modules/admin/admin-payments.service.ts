import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueryPaymentsDto } from "./dto/query-payments.dto";

const PAYMENT_INCLUDE = {
  order: { select: { id: true, orderNumber: true } },
  shopOrder: { select: { id: true, shopOrderNumber: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function toView(payment: PaymentRow) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.order.orderNumber,
    shopOrderId: payment.shopOrderId,
    shopOrderNumber: payment.shopOrder?.shopOrderNumber ?? null,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    provider: payment.provider,
    status: payment.status,
    providerTxnId: payment.providerTxnId,
    paidAt: payment.paidAt,
    failedAt: payment.failedAt,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
  };
}

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryPaymentsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);

    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.order
        ? { OR: [{ orderId: query.order }, { order: { orderNumber: query.order } }] }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: PAYMENT_INCLUDE,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows.map(toView), total, page, limit);
  }

  async get(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Payment not found");
    }
    return toView(payment);
  }
}

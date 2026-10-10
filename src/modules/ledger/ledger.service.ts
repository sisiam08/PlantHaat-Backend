import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { LedgerEntryType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueryLedgerDto } from "./dto/query-ledger.dto";

export interface LedgerRecordInput {
  sellerProfileId: string;
  shopOrderId?: string | null;
  payoutId?: string | null;
  type: LedgerEntryType;
  amount: Prisma.Decimal;
  description?: string | null;
  createdById?: string | null;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    client: Prisma.TransactionClient | PrismaClient,
    input: LedgerRecordInput,
  ): Promise<void> {
    await client.ledgerEntry.create({
      data: {
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId ?? null,
        payoutId: input.payoutId ?? null,
        type: input.type,
        amount: input.amount,
        description: input.description ?? null,
        createdById: input.createdById ?? null,
      },
    });
  }

  async balance(sellerProfileId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.ledgerEntry.aggregate({
      where: { sellerProfileId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  async list(sellerProfileId: string, query: QueryLedgerDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.LedgerEntryWhereInput = {
      sellerProfileId,
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }
}

import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

const WINDOW_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 50_000;

/**
 * Records product views deduplicated per (client IP, product) within a rolling
 * 30-minute window. The increment is fire-and-forget so it never fails the
 * request. An in-memory window is acceptable for v1; a shared store (Redis) is
 * needed for multi-instance deployments.
 */
@Injectable()
export class ProductViewsService {
  private readonly logger = new Logger(ProductViewsService.name);
  private readonly seen = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  record(productId: string, clientIp: string | undefined): void {
    const key = `${clientIp ?? "unknown"}:${productId}`;
    const now = Date.now();
    const last = this.seen.get(key);
    if (last !== undefined && now - last < WINDOW_MS) {
      return;
    }
    if (this.seen.size > MAX_ENTRIES) {
      this.sweep(now);
    }
    this.seen.set(key, now);
    void this.increment(productId);
  }

  private async increment(productId: string): Promise<void> {
    try {
      await this.prisma.product.update({
        where: { id: productId },
        data: { viewCount: { increment: 1 } },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to increment viewCount for ${productId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  private sweep(now: number): void {
    for (const [key, timestamp] of this.seen) {
      if (now - timestamp >= WINDOW_MS) {
        this.seen.delete(key);
      }
    }
  }
}

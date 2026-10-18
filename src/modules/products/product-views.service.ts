import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

const WINDOW_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 50_000;

/** Matches the canonical UUID form Prisma generates for `Product.id`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records product views deduplicated per (client IP, product) within a rolling
 * 30-minute window. The increment is fire-and-forget so it never fails the
 * request. An in-memory window is acceptable for v1; a shared store (Redis) is
 * needed for multi-instance deployments.
 *
 * The identifier may be either the product UUID or its slug: the endpoint is
 * called with the slug by older clients, so a non-UUID value is resolved as a
 * slug. A missing product is a no-op (logged at debug), never an error.
 */
@Injectable()
export class ProductViewsService {
  private readonly logger = new Logger(ProductViewsService.name);
  private readonly seen = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  record(identifier: string, clientIp: string | undefined): void {
    const key = `${clientIp ?? "unknown"}:${identifier}`;
    const now = Date.now();
    const last = this.seen.get(key);
    if (last !== undefined && now - last < WINDOW_MS) {
      return;
    }
    if (this.seen.size > MAX_ENTRIES) {
      this.sweep(now);
    }
    this.seen.set(key, now);
    void this.increment(identifier);
  }

  private async increment(identifier: string): Promise<void> {
    try {
      const productId = await this.resolveProductId(identifier);
      if (!productId) {
        this.logger.debug(`View beacon ignored: no product matches "${identifier}"`);
        return;
      }
      // Guarded update: a missing/soft-deleted row yields count 0 instead of
      // throwing `P2025` (the bug that produced WARN noise on every view).
      const result = await this.prisma.product.updateMany({
        where: { id: productId },
        data: { viewCount: { increment: 1 } },
      });
      if (result.count === 0) {
        this.logger.debug(`View beacon ignored: product "${identifier}" no longer exists`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to increment viewCount for ${identifier}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  private async resolveProductId(identifier: string): Promise<string | null> {
    if (UUID_RE.test(identifier)) {
      return identifier;
    }
    const product = await this.prisma.product.findUnique({
      where: { slug: identifier },
      select: { id: true },
    });
    return product?.id ?? null;
  }

  private sweep(now: number): void {
    for (const [key, timestamp] of this.seen) {
      if (now - timestamp >= WINDOW_MS) {
        this.seen.delete(key);
      }
    }
  }
}

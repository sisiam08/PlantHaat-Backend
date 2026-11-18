import { Injectable, Logger } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { LedgerService } from "./ledger.service";

/**
 * Catch-up safe release scheduler. Uses stored releaseAt timestamps only, so a
 * restart or downtime never loses a release. A process-level overlap guard plus
 * per-ShopOrder row locks make concurrent runs idempotent.
 */
@Injectable()
export class SettlementScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettlementScheduler.name);
  private running = false;

  constructor(private readonly ledger: LedgerService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.ledger.releaseDue();
      if (result.released > 0) {
        this.logger.log(`Released settlement funds for ${result.released} shop order(s)`);
      }
    } catch (error) {
      this.logger.error("Settlement release job failed", error as Error);
    } finally {
      this.running = false;
    }
  }
}

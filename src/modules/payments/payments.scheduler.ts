import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { PaymentsService } from "./payments.service";

@Injectable()
export class PaymentsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentsScheduler.name);
  private running = false;

  constructor(private readonly payments: PaymentsService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runSafely();
  }

  @Cron("*/5 * * * *")
  async run(): Promise<void> {
    await this.runSafely();
  }

  private async runSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.payments.expireUnpaid();
      const alerted = await this.payments.alertSla();
      if (expired > 0 || alerted > 0) {
        this.logger.log(`Advance payments: expired=${expired} slaAlerts=${alerted}`);
      }
    } catch (error) {
      this.logger.error("Advance payment job failed", error as Error);
    } finally {
      this.running = false;
    }
  }
}

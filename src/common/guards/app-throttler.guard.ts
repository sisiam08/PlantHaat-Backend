import { Injectable } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from "@nestjs/throttler";

import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: AppConfigService,
  ) {
    super(options, storage, reflector);
  }

  protected override shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(this.config.isTest);
  }
}

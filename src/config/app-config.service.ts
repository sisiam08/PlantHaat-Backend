import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "./app-config.constants";
import type { AppConfig } from "./env.schema";

@Injectable()
export class AppConfigService {
  constructor(@Inject(APP_CONFIG) readonly values: AppConfig) {}

  get isProduction(): boolean {
    return this.values.NODE_ENV === "production";
  }

  get isTest(): boolean {
    return this.values.NODE_ENV === "test";
  }

  get isDevelopment(): boolean {
    return this.values.NODE_ENV === "development";
  }
}

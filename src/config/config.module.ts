import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { APP_CONFIG } from "./app-config.constants";
import { AppConfigService } from "./app-config.service";
import { validateEnv } from "./env.validation";

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => validateEnv(process.env),
    },
    AppConfigService,
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}

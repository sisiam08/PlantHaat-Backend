import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { AppConfigService } from "./config/app-config.service";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  configureApp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.values.PORT, "0.0.0.0");
  logger.log(`PlantHaat API listening on ${config.values.API_URL} (port ${config.values.PORT})`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to start PlantHaat API", error as Error);
  process.exit(1);
});

import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.values.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  if (config.values.ENABLE_SWAGGER) {
    const documentConfig = new DocumentBuilder()
      .setTitle("PlantHaat API")
      .setDescription("Multi-vendor online plant marketplace API for Bangladesh")
      .setVersion("1.0")
      .addCookieAuth("ph_at", { type: "apiKey", in: "cookie" })
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  await app.listen(config.values.PORT, "0.0.0.0");
  logger.log(`PlantHaat API listening on ${config.values.API_URL} (port ${config.values.PORT})`);
}

bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error("Failed to start PlantHaat API", error as Error);
  process.exit(1);
});

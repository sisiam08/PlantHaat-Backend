import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { createClientIpMiddleware } from "./common/client-ip/client-ip";
import type { AppConfigService } from "./config/app-config.service";

export interface AppSetupOptions {
  helmet?: boolean;
  cors?: boolean;
  swagger?: boolean;
  staticFiles?: boolean;
}

export function configureApp(
  app: INestApplication,
  config: AppConfigService,
  options: AppSetupOptions = {},
): void {
  const { helmet: useHelmet = true, cors = true, swagger = true, staticFiles = true } = options;

  if (useHelmet) {
    app.use(helmet());
  }
  app.use(cookieParser());
  app.use(createClientIpMiddleware(config.values.BFF_SHARED_SECRET));

  if (staticFiles) {
    const publicDir = resolve(process.cwd(), config.values.UPLOAD_DIR, "public");
    mkdirSync(publicDir, { recursive: true });
    app.use("/uploads", express.static(publicDir, { index: false }));
  }

  if (cors) {
    app.enableCors({
      origin: config.values.CORS_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    });
  }

  app.setGlobalPrefix("api/v1");

  if (swagger && config.values.ENABLE_SWAGGER) {
    const documentConfig = new DocumentBuilder()
      .setTitle("PlantHaat API")
      .setDescription("Multi-vendor online plant marketplace API for Bangladesh")
      .setVersion("1.0")
      .addCookieAuth("ph_at", { type: "apiKey", in: "cookie" })
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup("api/docs", app, document);
  }
}

import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import type { AppConfigService } from "./config/app-config.service";

export interface AppSetupOptions {
  helmet?: boolean;
  cors?: boolean;
  swagger?: boolean;
}

export function configureApp(
  app: INestApplication,
  config: AppConfigService,
  options: AppSetupOptions = {},
): void {
  const { helmet: useHelmet = true, cors = true, swagger = true } = options;

  if (useHelmet) {
    app.use(helmet());
  }
  app.use(cookieParser());

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

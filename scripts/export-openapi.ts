import "reflect-metadata";

import { writeFileSync } from "node:fs";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "../src/app.module";

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");

  const documentConfig = new DocumentBuilder()
    .setTitle("PlantHaat API")
    .setDescription("Multi-vendor online plant marketplace API for Bangladesh")
    .setVersion("1.0")
    .addCookieAuth("ph_at", { type: "apiKey", in: "cookie" })
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  writeFileSync("openapi.json", `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await app.close();

  new Logger("OpenAPI").log("Exported OpenAPI document to openapi.json");
}

exportOpenApi().catch((error: unknown) => {
  new Logger("OpenAPI").error("Failed to export OpenAPI document", error as Error);
  process.exit(1);
});

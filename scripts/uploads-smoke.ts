import "dotenv/config";

import { Logger } from "@nestjs/common";
import sharp from "sharp";

import type { AppConfigService } from "../src/config/app-config.service";
import { CloudinaryStorageDriver } from "../src/modules/uploads/storage/cloudinary-storage.driver";

/**
 * Opt-in live smoke test. Run after filling CLOUDINARY_* in backend/.env:
 *   npm run uploads:smoke
 * It uploads one public image and one private PDF, checks delivery (public URL
 * 200; private unsigned URL not 200; signed URL 200), deletes both, and prints
 * a table. Never runs in CI.
 */
async function main(): Promise<void> {
  const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing env: ${missing.join(", ")}. Fill backend/.env first.`);
    process.exitCode = 1;
    return;
  }

  const env = process.env.NODE_ENV ?? "development";
  const prefix = (
    process.env.CLOUDINARY_FOLDER ??
    process.env.CLOUDINARY_FOLDER_PREFIX ??
    `planthaat/${env}`
  ).replace(/^\/+|\/+$/g, "");
  const driver = new CloudinaryStorageDriver({
    values: {
      NODE_ENV: env,
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
      CLOUDINARY_FOLDER: prefix,
    },
  } as unknown as AppConfigService);

  const rows: [string, string, string][] = [];
  const record = (check: string, expected: string, actual: string) => {
    rows.push([check, expected, actual]);
  };

  const stamp = Date.now();
  const smokeFolder = `${prefix}/smoke/${stamp}`;
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  const publicAsset = await driver.put({
    key: `smoke/${stamp}.png`,
    buffer: png,
    contentType: "image/png",
    visibility: "public",
    resourceType: "image",
    folder: smokeFolder,
  });
  const publicStatus = (await fetch(publicAsset.url)).status;
  record("public image", "200", String(publicStatus));

  const privateAsset = await driver.put({
    key: `smoke/${stamp}.pdf`,
    buffer: Buffer.from("%PDF-1.4\n% PlantHaat smoke test\n%%EOF"),
    contentType: "application/pdf",
    visibility: "private",
    resourceType: "raw",
    folder: smokeFolder,
  });
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const unsignedUrl = `https://res.cloudinary.com/${cloud}/raw/upload/${privateAsset.key}`;
  const unsignedStatus = (await fetch(unsignedUrl)).status;
  record("private unsigned", "not 200", String(unsignedStatus));

  const signedUrl = await driver.getPrivateUrl(privateAsset.key);
  const signedStatus = (await fetch(signedUrl)).status;
  record("private signed", "200", String(signedStatus));

  await driver.delete(publicAsset.key, "public");
  await driver.delete(privateAsset.key, "private");
  let afterDelete = 200;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    afterDelete = (await fetch(`${publicAsset.url}?smoke=${Date.now()}`)).status;
    if (afterDelete !== 200) break;
  }
  record("public after delete", "not 200", String(afterDelete));

  const width = Math.max(...rows.map(([a, b, c]) => Math.max(a.length, b.length, c.length)));
  const line = (cells: string[]) => cells.map((cell) => cell.padEnd(width)).join(" | ");
  console.log(line(["check", "expected", "actual"]));
  console.log("-".repeat(width * 3 + 6));
  for (const row of rows) {
    console.log(line(row));
  }
  const failed = rows.some(
    ([, expected, actual]) =>
      (expected === "200" && actual !== "200") ||
      (expected === "not 200" && actual === "200"),
  );
  if (failed) {
    Logger.warn("Uploads smoke test reported failures", "uploads:smoke");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("uploads:smoke failed:", error);
  process.exitCode = 1;
});

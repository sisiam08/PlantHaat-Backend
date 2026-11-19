import "dotenv/config";

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { AppConfigService } from "../src/config/app-config.service";
import { validateEnv } from "../src/config/env.validation";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { UploadsService } from "../src/modules/uploads/uploads.service";
import { UploadPurpose } from "../src/modules/uploads/dto/upload-image.dto";
import { resolveStorageDriver } from "../src/modules/uploads/storage/storage.module";
import { HIGHLIGHT_PLACEMENT } from "../src/modules/content/highlights.validation";

export const IMPORT_MARKER = "[seed:home-highlights]";

interface SeedBanner {
  desktop: string;
  mobile: string;
  altBn: string;
  altEn: string;
  headlineBn: string;
  headlineEn: string;
  ctaBn: string;
  ctaEn: string;
  href: string;
}

const BANNERS: SeedBanner[] = [
  {
    desktop: "banner-1.webp",
    mobile: "banner-1-mobile.webp",
    altBn: "সবুজে ভরা ঘর",
    altEn: "A home filled with green",
    headlineBn: "ঘর ভরে তুলুন সবুজে",
    headlineEn: "Fill your home with green",
    ctaBn: "গাছ দেখুন",
    ctaEn: "Shop plants",
    href: "/products",
  },
  {
    desktop: "banner-2.webp",
    mobile: "banner-2-mobile.webp",
    altBn: "নতুন গাছের সংগ্রহ",
    altEn: "New plant arrivals",
    headlineBn: "নতুন গাছ এসেছে",
    headlineEn: "New plants just arrived",
    ctaBn: "নতুন সংগ্রহ দেখুন",
    ctaEn: "See what's new",
    href: "/products?sort=newest",
  },
  {
    desktop: "banner-3.webp",
    mobile: "banner-3-mobile.webp",
    altBn: "সারা দেশে ক্যাশ অন ডেলিভারি",
    altEn: "Cash on delivery nationwide",
    headlineBn: "সারা দেশে ক্যাশ অন ডেলিভারি",
    headlineEn: "Cash on delivery, nationwide",
    ctaBn: "এখনই কিনুন",
    ctaEn: "Order now",
    href: "/products",
  },
];

function guardDevDatabase(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refused: import script must not run in production");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = url.pathname.replace(/^\//, "");
  if (!/neon\.tech$/i.test(url.hostname) || database !== "neondb") {
    throw new Error("Refused: DATABASE_URL is not the approved dev database");
  }
  process.stdout.write(`DB target host=${url.hostname} database=${database}\n`);
}

async function main() {
  guardDevDatabase();
  const prisma = createPrismaClient();
  const config = new AppConfigService(validateEnv(process.env));
  const uploads = new UploadsService(
    resolveStorageDriver(config),
    prisma as unknown as PrismaService,
  );
  const directory = resolve(
    process.env.FRONTEND_BANNERS_DIR ?? resolve(process.cwd(), "..", "frontend", "public", "banners"),
  );

  const existing = await prisma.banner.count({
    where: { placement: HIGHLIGHT_PLACEMENT, title: { startsWith: IMPORT_MARKER } },
  });
  if (existing > 0) {
    process.stdout.write(`Marker rows already exist (${existing}); nothing to import.\n`);
    return;
  }

  let sortOrder = 0;
  for (const seed of BANNERS) {
    const desktopBuffer = await readFile(resolve(directory, seed.desktop));
    const mobileBuffer = await readFile(resolve(directory, seed.mobile));
    const desktop = await uploads.uploadImage(
      {
        buffer: desktopBuffer,
        size: desktopBuffer.byteLength,
        mimetype: "image/webp",
        originalname: basename(seed.desktop),
        fieldname: "file",
        encoding: "7bit",
        destination: "",
        filename: basename(seed.desktop),
        path: "",
        stream: undefined as never,
      } as Express.Multer.File,
      UploadPurpose.BANNER,
      "seed-script",
    );
    const mobile = await uploads.uploadImage(
      {
        buffer: mobileBuffer,
        size: mobileBuffer.byteLength,
        mimetype: "image/webp",
        originalname: basename(seed.mobile),
        fieldname: "file",
        encoding: "7bit",
        destination: "",
        filename: basename(seed.mobile),
        path: "",
        stream: undefined as never,
      } as Express.Multer.File,
      UploadPurpose.BANNER,
      "seed-script",
    );

    await prisma.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: {
          title: `${IMPORT_MARKER} ${seed.desktop}`,
          imageUrl: desktop.url,
          imagePublicId: desktop.key,
          imageWidth: desktop.width ?? null,
          imageHeight: desktop.height ?? null,
          mobileImageUrl: mobile.url,
          mobileImagePublicId: mobile.key,
          mobileImageWidth: mobile.width ?? null,
          mobileImageHeight: mobile.height ?? null,
          imageAltBn: seed.altBn,
          imageAltEn: seed.altEn,
          focalX: 50,
          focalY: 50,
          mobileFocalX: 50,
          mobileFocalY: 50,
          placement: HIGHLIGHT_PLACEMENT,
          sortOrder,
          isActive: true,
          overlayEnabled: true,
          headlineBn: seed.headlineBn,
          headlineEn: seed.headlineEn,
          subtextBn: null,
          subtextEn: null,
          textColor: "#EFE7D2",
          scrimColor: "#0B2116",
          scrimOpacity: 45,
          desktopPosition: "BOTTOM_LEFT",
          mobilePosition: "BOTTOM_LEFT",
          desktopAlign: "left",
          mobileAlign: "left",
          buttonEnabled: true,
          buttonLabelBn: seed.ctaBn,
          buttonLabelEn: seed.ctaEn,
          buttonHref: seed.href,
          buttonStyle: "primary",
          openInNewTab: false,
          createdById: null,
          updatedById: null,
        },
      });
      await uploads.attachAssetsInTransaction(tx, [desktop.url, mobile.url]);
      process.stdout.write(
        `Imported ${banner.id} (${seed.desktop}) ${desktop.width ?? "?"}x${desktop.height ?? "?"}\n`,
      );
    });
    sortOrder += 1;
  }
  await prisma.$disconnect();
  process.stdout.write(`Imported ${BANNERS.length} slides. Marker: ${IMPORT_MARKER}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
  process.exitCode = 1;
});

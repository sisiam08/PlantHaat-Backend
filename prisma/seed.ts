import "dotenv/config";

import argon2 from "argon2";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { DISTRICTS } from "./data/bd-districts";
import { DEFAULT_CATEGORIES } from "./data/categories";
import { DEFAULT_SETTINGS } from "./data/settings";

const GLOBAL_COMMISSION_RATE_PERCENT = 10;
const WEAK_PASSWORD_MARKERS = ["change-me", "password", "12345678", "admin", "qwerty"];

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required to run the seed`);
  }
  return value.trim();
}

function isWeakPassword(password: string): boolean {
  if (password.length < 8) {
    return true;
  }
  const lower = password.toLowerCase();
  return WEAK_PASSWORD_MARKERS.some((marker) => lower.includes(marker));
}

async function seedDistricts(prisma: PrismaClient): Promise<number> {
  for (const district of DISTRICTS) {
    await prisma.district.upsert({
      where: { name: district.name },
      update: { nameBn: district.nameBn, division: district.division },
      create: district,
    });
  }
  return DISTRICTS.length;
}

async function seedCategories(prisma: PrismaClient): Promise<number> {
  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, nameBn: category.nameBn, sortOrder: index },
      create: { ...category, sortOrder: index },
    });
  }
  return DEFAULT_CATEGORIES.length;
}

async function seedSettings(prisma: PrismaClient): Promise<number> {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as Prisma.InputJsonValue },
    });
  }
  return DEFAULT_SETTINGS.length;
}

async function seedAdmin(prisma: PrismaClient): Promise<string> {
  const email = requireEnv("ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("ADMIN_PASSWORD");
  const name = process.env.ADMIN_NAME?.trim() || "PlantHaat Admin";

  if (process.env.NODE_ENV === "production" && isWeakPassword(password)) {
    throw new Error(
      "Refusing to seed an admin with a weak ADMIN_PASSWORD when NODE_ENV=production",
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", status: "ACTIVE" },
    create: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  return admin.id;
}

async function seedGlobalCommissionRule(
  prisma: PrismaClient,
  createdById: string,
): Promise<boolean> {
  const existing = await prisma.commissionRule.findFirst({
    where: { scope: "GLOBAL", categoryId: null, sellerProfileId: null },
  });
  if (existing) {
    return false;
  }
  await prisma.commissionRule.create({
    data: {
      scope: "GLOBAL",
      ratePercent: GLOBAL_COMMISSION_RATE_PERCENT,
      isActive: true,
      createdById,
    },
  });
  return true;
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const districtCount = await seedDistricts(prisma);
    const categoryCount = await seedCategories(prisma);
    const settingCount = await seedSettings(prisma);
    const adminId = await seedAdmin(prisma);
    const commissionCreated = await seedGlobalCommissionRule(prisma, adminId);

    console.log(
      [
        "Seed complete:",
        `  districts: ${districtCount}`,
        `  categories: ${categoryCount}`,
        `  settings: ${settingCount}`,
        `  admin: ${adminId}`,
        `  global commission rule: ${commissionCreated ? "created" : "already present"}`,
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed", error);
  process.exit(1);
});

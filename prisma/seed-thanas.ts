import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";
import {
  DHAKA_DISTRICT_NAME,
  ourDistrictNameFromSteadfastName,
  steadfastDhakaKind,
} from "./data/steadfast";

interface ThanaSeed {
  steadfastPoliceStationId: number;
  name: string;
  steadfastDistrictId: number;
  steadfastDistrictName: string;
  districtName: string;
  dhakaZone: "CITY" | "SUBURBAN" | null;
  classificationSource: "DEFAULT_UNVERIFIED";
  selectableByCustomer: boolean;
}

interface SteadfastDistrictSeed {
  id: number;
  name: string;
}

function readCsv(path: string): SteadfastDistrictSeed[] {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const [id, ...rest] = line.split(",");
    return { id: Number(id), name: rest.join(",").trim() };
  });
}

export async function seedSteadfastLocations(prisma: PrismaClient): Promise<number> {
  const csvPath = resolve(process.cwd(), "prisma/seed-data/steadfast-districts.csv");
  const rows = readCsv(csvPath);
  for (const row of rows) {
    const dhakaKind = steadfastDhakaKind(row);
    const kind =
      dhakaKind === "CITY"
        ? ("DHAKA_CITY" as const)
        : dhakaKind === "SUBURBAN"
          ? ("DHAKA_SUBURBAN" as const)
          : ("DISTRICT" as const);
    await prisma.steadfastLocation.upsert({
      where: { id: row.id },
      update: { name: row.name, kind },
      create: {
        id: row.id,
        name: row.name,
        kind,
      },
    });
  }

  const districts = await prisma.district.findMany({
    select: { id: true, name: true, steadfastLocationId: true },
  });
  const byName = new Map(districts.map((district) => [district.name, district]));
  for (const row of rows) {
    if (steadfastDhakaKind(row)) {
      continue;
    }
    const ourName = ourDistrictNameFromSteadfastName(row.name);
    const district = byName.get(ourName);
    if (!district) {
      continue;
    }
    if (district.steadfastLocationId !== row.id) {
      await prisma.district.update({
        where: { id: district.id },
        data: { steadfastLocationId: row.id },
      });
    }
  }
  return rows.length;
}

export async function seedThanas(prisma: PrismaClient): Promise<number> {
  const jsonPath = resolve(process.cwd(), "prisma/seed-data/steadfast-thanas.json");
  const payload = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    thanas?: ThanaSeed[];
  };
  const rows = Array.isArray(payload.thanas) ? payload.thanas : [];
  const districts = await prisma.district.findMany({
    select: { id: true, name: true },
  });
  const byName = new Map(districts.map((district) => [district.name, district.id]));
  let count = 0;
  for (const row of rows) {
    const districtId = byName.get(row.districtName);
    if (!districtId) {
      continue;
    }
    await prisma.thana.upsert({
      where: { steadfastPoliceStationId: row.steadfastPoliceStationId },
      update: {
        name: row.name,
        districtId,
        dhakaZone:
          row.districtName === DHAKA_DISTRICT_NAME ? row.dhakaZone : null,
        selectableByCustomer:
          row.selectableByCustomer ?? row.name !== "Zone Not Clear",
      },
      create: {
        steadfastPoliceStationId: row.steadfastPoliceStationId,
        name: row.name,
        districtId,
        dhakaZone:
          row.districtName === DHAKA_DISTRICT_NAME ? row.dhakaZone : null,
        classificationSource: "DEFAULT_UNVERIFIED",
        selectableByCustomer:
          row.selectableByCustomer ?? row.name !== "Zone Not Clear",
      },
    });
    count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const locations = await seedSteadfastLocations(prisma);
    const thanas = await seedThanas(prisma);
    console.log(`Seeded ${locations} Steadfast locations and ${thanas} thanas.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/prisma/seed-thanas.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}




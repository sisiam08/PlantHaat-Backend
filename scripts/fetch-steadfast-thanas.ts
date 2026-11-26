import "dotenv/config";

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DHAKA_DISTRICT_NAME,
  classifyDhakaThana,
  ourDistrictNameFromSteadfastName,
  steadfastDhakaKind,
  type SteadfastDistrictRow,
} from "../prisma/data/steadfast";

interface PortalStation {
  id: number;
  name: string;
  status?: number;
  district_id: number;
}

interface PortalDistrict {
  id: number;
  name: string;
  policestations: PortalStation[];
}

const LOOKUP_URL = "https://portal.packzy.com/api/v1/police_stations";

function readDistrictsCsv(): SteadfastDistrictRow[] {
  const path = resolve(process.cwd(), "prisma/seed-data/steadfast-districts.csv");
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const [id, ...rest] = line.split(",");
    return { id: Number(id), name: rest.join(",") };
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.STEADFAST_LOOKUP_API_KEY?.trim();
  const secret = process.env.STEADFAST_LOOKUP_API_SECRET?.trim();
  if (!apiKey || !secret) {
    throw new Error(
      "STEADFAST_LOOKUP_API_KEY and STEADFAST_LOOKUP_API_SECRET are required to fetch thanas",
    );
  }

  const response = await fetch(LOOKUP_URL, {
    headers: {
      "api-key": apiKey,
      "Secret-Key": secret,
      Accept: "application/json",
      "User-Agent": "PlantHaat/1.0 (thana seed)",
    },
  });
  if (!response.ok) {
    throw new Error(`Steadfast lookup returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    status?: string;
    data?: PortalDistrict[];
  };
  if (payload.status !== "success" || !Array.isArray(payload.data)) {
    throw new Error("Unexpected Steadfast lookup response");
  }

  const csvDistricts = readDistrictsCsv();
  const byId = new Map(csvDistricts.map((row) => [row.id, row]));
  const byName = new Map(
    csvDistricts.map((row) => [row.name.trim().toLowerCase(), row]),
  );

  const rows: {
    steadfastPoliceStationId: number;
    name: string;
    steadfastDistrictId: number;
    steadfastDistrictName: string;
    districtName: string;
    dhakaZone: "CITY" | "SUBURBAN" | null;
    classificationSource: "DEFAULT_UNVERIFIED";
    selectableByCustomer: boolean;
  }[] = [];
  const unmapped: string[] = [];

  for (const portalDistrict of payload.data) {
    const dhakaKind = steadfastDhakaKind({
      id: portalDistrict.id,
      name: portalDistrict.name,
    });
    const csvRow =
      byId.get(portalDistrict.id) ??
      byName.get(portalDistrict.name.trim().toLowerCase()) ??
      null;
    const targetDistrict = dhakaKind ? DHAKA_DISTRICT_NAME : (csvRow ? ourDistrictNameFromSteadfastName(csvRow.name) : null);
    if (!targetDistrict) {
      unmapped.push(`${portalDistrict.id}:${portalDistrict.name}`);
      continue;
    }

    for (const station of portalDistrict.policestations ?? []) {
      if (!station || typeof station.id !== "number" || !station.name) continue;
      if (station.status !== undefined && station.status !== 1) continue;
      rows.push({
        steadfastPoliceStationId: station.id,
        name: station.name.trim(),
        steadfastDistrictId: portalDistrict.id,
        steadfastDistrictName: portalDistrict.name,
        districtName: targetDistrict,
        dhakaZone: dhakaKind
          ? classifyDhakaThana(station.name, portalDistrict.id)
          : null,
        classificationSource: "DEFAULT_UNVERIFIED",
        selectableByCustomer: station.name.trim() !== "Zone Not Clear",
      });
    }
  }

  rows.sort(
    (left, right) => left.steadfastPoliceStationId - right.steadfastPoliceStationId,
  );
  const output = resolve(process.cwd(), "prisma/seed-data/steadfast-thanas.json");
  writeFileSync(
    output,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), thanas: rows }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${rows.length} thanas to ${output}`);
  if (unmapped.length > 0) {
    console.log(
      `Unmapped Steadfast districts (no thanas written): ${unmapped.join(", ")}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});



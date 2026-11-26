/**
 * Steadfast district mapping helpers.
 *
 * Steadfast splits Dhaka into "Dhaka City" (id 1) and "Dhaka Sub-Urban" (id 18)
 * and uses a few older spellings for other districts. Only confident matches are
 * made; an unmapped District stays null and its quote is unavailable until an
 * admin maps it.
 */

export interface SteadfastDistrictRow {
  id: number;
  name: string;
}

/** Our district name -> Steadfast CSV name, where the spellings differ. */
export const DISTRICT_STEADFAST_OVERRIDES: Record<string, string> = {
  Bogura: "Bogra",
  Chattogram: "Chittagong",
  Khagrachhari: "Khagrachori",
  Kushtia: "Kustia",
  Lakshmipur: "Laxmipur",
  Narsingdi: "Narshindi",
  Panchagarh: "Panchgarh",
  Satkhira: "Shatkhira",
};

export const DHAKA_DISTRICT_NAME = "Dhaka";

const OUR_NAME_BY_STEADFAST_NAME = Object.fromEntries(
  Object.entries(DISTRICT_STEADFAST_OVERRIDES).map(([ours, theirs]) => [theirs, ours]),
);

export function ourDistrictNameFromSteadfastName(steadfastName: string): string {
  return OUR_NAME_BY_STEADFAST_NAME[steadfastName] ?? steadfastName;
}

/** Map a Dhaka-district thana to the courier's sub-urban bucket. */
const DHAKA_SUBURBAN_PATTERN =
  /keraniganj|savar|dhamrai|nawabganj|dohar|ashulia|hemayetpur/i;

export function normalizeLocationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const DHAKA_CITY_NAMES = new Set(["dhakacity"]);
const DHAKA_SUBURBAN_NAMES = new Set(["dhakasuburban", "dhakasuburb"]);

export function steadfastDistrictNameFor(
  ourDistrictName: string,
  rows: SteadfastDistrictRow[],
): SteadfastDistrictRow | null {
  if (ourDistrictName === DHAKA_DISTRICT_NAME) {
    return null;
  }
  const override = DISTRICT_STEADFAST_OVERRIDES[ourDistrictName];
  const wanted = normalizeLocationName(override ?? ourDistrictName);
  const candidates = rows.filter(
    (row) =>
      !DHAKA_CITY_NAMES.has(normalizeLocationName(row.name)) &&
      !DHAKA_SUBURBAN_NAMES.has(normalizeLocationName(row.name)),
  );
  const exact = candidates.filter((row) => normalizeLocationName(row.name) === wanted);
  if (exact.length === 1) {
    return exact[0];
  }
  const loose = candidates.filter((row) => {
    const normalized = normalizeLocationName(row.name);
    return normalized.includes(wanted) || wanted.includes(normalized);
  });
  return loose.length === 1 ? loose[0] : null;
}

export function steadfastDhakaKind(row: SteadfastDistrictRow): "CITY" | "SUBURBAN" | null {
  const name = normalizeLocationName(row.name);
  if (DHAKA_CITY_NAMES.has(name)) return "CITY";
  if (DHAKA_SUBURBAN_NAMES.has(name)) return "SUBURBAN";
  return null;
}

export function classifyDhakaThana(
  thanaName: string,
  steadfastDistrictId: number,
): "CITY" | "SUBURBAN" {
  if (steadfastDistrictId === 18 || DHAKA_SUBURBAN_PATTERN.test(thanaName)) {
    return "SUBURBAN";
  }
  return "CITY";
}

export function isDhakaZonePatternMatch(name: string): boolean {
  return DHAKA_SUBURBAN_PATTERN.test(name);
}

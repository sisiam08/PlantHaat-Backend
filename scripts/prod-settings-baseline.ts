/**
 * Creates a clean production settings baseline through the admin API.
 * Dry-run by default. Never prints payment numbers or passwords.
 *
 * Required env:
 *   PROD_API_URL=https://api.example.com     (no trailing /api/v1)
 *   PROD_ORIGIN=https://www.example.com      (an allowed CORS origin)
 *   PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD
 *
 * Usage:
 *   tsx scripts/prod-settings-baseline.ts            # dry run
 *   tsx scripts/prod-settings-baseline.ts --apply    # writes via the admin API
 */
import { buildProductionBaselineChanges } from "../src/modules/settings/production-baseline";

const API = process.env.PROD_API_URL?.replace(/\/+$/, "");
const ORIGIN = process.env.PROD_ORIGIN;
const EMAIL = process.env.PROD_ADMIN_EMAIL;
const PASSWORD = process.env.PROD_ADMIN_PASSWORD;
const apply = process.argv.includes("--apply");

if (!API || !ORIGIN || !EMAIL || !PASSWORD) {
  console.error("Set PROD_API_URL, PROD_ORIGIN, PROD_ADMIN_EMAIL and PROD_ADMIN_PASSWORD.");
  process.exit(2);
}
if (!API.startsWith("https://")) {
  console.error("PROD_API_URL must use https.");
  process.exit(2);
}

async function api(path: string, init: RequestInit = {}, cookie?: string) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN!,
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  return response;
}

const login = await api("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) {
  console.error(`admin login failed: ${login.status}`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");

const settingsResponse = await api("/api/v1/admin/settings", {}, cookie);
if (!settingsResponse.ok) {
  console.error(`Could not read settings: ${settingsResponse.status}`);
  process.exit(1);
}
const current = (await settingsResponse.json()).data as Record<string, unknown>;
const changes = buildProductionBaselineChanges(current);

if (changes.length === 0) {
  console.log("Production settings already match the baseline.");
  process.exit(0);
}
console.log("Proposed production baseline changes (masked):");
for (const change of changes) {
  console.log(`- ${change.key}: ${change.current} -> ${change.next}`);
}
if (!apply) {
  console.log("\nDry run only. Re-run with --apply after reviewing.");
  process.exit(0);
}

const sensitive = changes.filter((change) => change.sensitive).map((change) => change.key);
let reauthToken: string | undefined;
if (sensitive.length > 0) {
  const reauth = await api(
    "/api/v1/admin/settings/reauth",
    { method: "POST", body: JSON.stringify({ keys: sensitive, password: PASSWORD }) },
    cookie,
  );
  if (!reauth.ok) {
    console.error(`Re-auth failed: ${reauth.status}`);
    process.exit(1);
  }
  reauthToken = ((await reauth.json()) as { data: { token: string } }).data.token;
}

const values = Object.fromEntries(
  changes.map((change) => [
    change.key,
    change.key.endsWith(".number") ? "" : change.key.endsWith(".enabled") ? false : true,
  ]),
);
const patch = await api(
  "/api/v1/admin/settings",
  {
    method: "PATCH",
    body: JSON.stringify({ values }),
    ...(reauthToken ? { headers: { "x-settings-reauth": reauthToken } } : {}),
  },
  cookie,
);
if (!patch.ok) {
  console.error(`Settings update failed: ${patch.status}`);
  process.exit(1);
}
console.log("Production baseline applied. Advance OFF, provider numbers empty, COD ON.");

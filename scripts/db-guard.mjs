import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const line = env.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL not found");
const raw = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
const url = new URL(raw);
const database = url.pathname.replace(/^\//, "");
const allowedHosts = (process.env.DEV_DB_HOSTS ?? "ep-late-sound-b3o84uag-pooler.c-4.ap-southeast-1.aws.neon.tech")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

console.log(`DB target host=${url.hostname} database=${database}`);
if (!allowedHosts.includes(url.hostname) || database !== "neondb") {
  console.error("REFUSED: target is not the approved dev database.");
  process.exit(1);
}
console.log("DB guard passed.");

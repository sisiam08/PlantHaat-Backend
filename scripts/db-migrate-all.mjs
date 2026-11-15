import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const allowedHosts = new Set(["ep-late-sound-b3o84uag-pooler.c-4.ap-southeast-1.aws.neon.tech"]);
const allowedDatabases = new Set(["neondb", "planthaat_test"]);
const command = process.argv[2] === "status" ? "status" : "deploy";
const files = [".env", ".env.test"];

for (const file of files) {
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error(`DATABASE_URL missing in ${file}`);
  const url = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  console.log(`[${file}] host=${parsed.hostname} database=${database}`);
  if (!allowedHosts.has(parsed.hostname) || !allowedDatabases.has(database)) {
    console.error(`REFUSED: ${file} is not an approved dev/test target.`);
    process.exit(1);
  }
  const result = spawnSync("npx", ["prisma", "migrate", command], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

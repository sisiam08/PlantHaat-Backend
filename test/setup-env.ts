import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

function readDatabaseUrl(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("DATABASE_URL=")) {
      return line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

const cwd = process.cwd();
const testEnvPath = resolve(cwd, ".env.test");

if (!existsSync(testEnvPath)) {
  throw new Error(
    "Missing backend/.env.test — copy .env.test.example and point DATABASE_URL at a separate test database.",
  );
}

loadEnv({ path: testEnvPath, override: true });

const testUrl = readDatabaseUrl(testEnvPath);
if (!testUrl) {
  throw new Error("DATABASE_URL is not set in .env.test");
}

const developmentUrl = readDatabaseUrl(resolve(cwd, ".env"));
if (developmentUrl && developmentUrl === testUrl) {
  throw new Error(
    "Refusing to run tests against the development database (DATABASE_URL matches .env)",
  );
}
if (!/test/i.test(testUrl)) {
  throw new Error("DATABASE_URL in .env.test must point at a separate test database");
}

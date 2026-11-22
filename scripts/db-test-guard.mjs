#!/usr/bin/env node
/**
 * Guard for destructive/demo scripts: only the isolated test database is
 * allowed. Reads `backend/.env.test` directly so a shell override cannot point
 * the script at dev or production.
 */
import { readFileSync } from "node:fs";

const line = readFileSync(".env.test", "utf8")
  .split(/\r?\n/)
  .find((entry) => entry.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL not found in .env.test");
const raw = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
const url = new URL(raw);
const database = url.pathname.replace(/^\//, "");
console.log(`[db-test-guard] host=${url.hostname} database=${database}`);
if (database !== "planthaat_test" || process.env.NODE_ENV === "production") {
  console.error("REFUSED: dashboard demo seeding is restricted to planthaat_test.");
  process.exit(1);
}

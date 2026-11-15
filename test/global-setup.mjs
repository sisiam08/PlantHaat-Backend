import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

export default function globalSetup() {
  const line = readFileSync(resolve(".env.test"), "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  if (!url) throw new Error("Missing DATABASE_URL in .env.test");
  try {
    execSync(`${process.platform === "win32" ? "npx.cmd" : "npx"} prisma migrate status`, {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch (error) {
    throw new Error("test database is behind: run `npm run db:migrate:all` before the e2e suite", {
      cause: error,
    });
  }
}

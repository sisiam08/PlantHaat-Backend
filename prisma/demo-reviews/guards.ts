/**
 * Safety checks for the optional demo-review scripts.
 *
 * The npm scripts also run `scripts/db-guard.mjs` before this file; these
 * checks keep a direct `tsx` invocation from touching a non-dev target.
 */

export function requireNonProduction(subject: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to run ${subject} with NODE_ENV=production`);
  }
}

export function requireDevDatabase(subject: string): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(`Refusing to run ${subject}: DATABASE_URL is not set`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Refusing to run ${subject}: DATABASE_URL is not a valid URL`);
  }
  const database = url.pathname.replace(/^\//, "");
  if (database !== "neondb" || url.hostname.includes("prod")) {
    throw new Error(
      `Refusing to run ${subject}: target database "${database}" is not the approved dev database`,
    );
  }
}

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 1_000_000;
const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)backups\//,
  /(^|\/)uploads(-test)?\//,
  /package-lock\.json$/,
  /openapi\.json$/,
  /schema\.d\.ts$/,
  /\.(png|jpe?g|webp|gif|ico|pdf|zip|dump)$/i,
];

const patterns = [
  { name: "cloudinary-credentials-url", re: /cloudinary:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/ },
  { name: "cloudinary-api-secret", re: /CLOUDINARY_API_SECRET[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "cloudinary-api-key", re: /CLOUDINARY_API_KEY[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "jwt-access-secret", re: /JWT_ACCESS_SECRET[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "database-url-password", re: /DATABASE_URL[ \t]*=[ \t]*([^\s#]*:\/\/[^\s#:]+:[^\s#@]+@[^\s#]+)/ },
  { name: "smtp-password", re: /SMTP_PASS[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "s3-access-key", re: /S3_ACCESS_KEY_ID[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "s3-secret-key", re: /S3_SECRET_ACCESS_KEY[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "data-encryption-key", re: /DATA_ENCRYPTION_KEY[ \t]*=[ \t]*([^\s#]+)/ },
  { name: "admin-password", re: /ADMIN_PASSWORD[ \t]*=[ \t]*([^\s#]+)/ },
];

function placeholder(value) {
  return (
    value.length === 0 ||
    /^(<.*>|\$\{.*\}|changeme|change-me|example|placeholder|replace.*|your.*|xxx+)$/i.test(value) ||
    /(<|example|placeholder|replace|your-|change-|localhost|user:password|demo|test)/i.test(value)
  );
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const findings = [];
for (const file of files) {
  if (SKIP.some((re) => re.test(file))) continue;
  let text;
  try {
    if (statSync(`${root}/${file}`).size > MAX_BYTES) continue;
    text = readFileSync(`${root}/${file}`, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const value = match[1] ?? match[0];
    if (placeholder(value)) continue;
    findings.push(`${pattern.name}: ${file}`);
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found (values hidden):");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log("secret check: no credential-like values in tracked files");

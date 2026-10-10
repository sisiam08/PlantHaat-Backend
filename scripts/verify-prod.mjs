import { spawnSync } from "node:child_process";

// Builds the app, then verifies the compiled output can be loaded with the
// runtime dependencies only (no test/tooling deps needed at runtime).

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: true });
}

const build = run("npm", ["run", "build"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const load = run("node", ["--import", "tsx", "scripts/load-dist.mjs"]);
process.exit(load.status ?? 1);

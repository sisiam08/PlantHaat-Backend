import { spawn, spawnSync } from "node:child_process";

// The app is ESM and its generated Prisma client uses `import.meta`; the tsx
// loader resolves the emit from `tsc`. esbuild (tsx's transpiler) cannot emit
// NestJS decorator metadata correctly here, so dev compiles with tsc first and
// runs the emitted output with the tsx loader, restarting on rebuild.

const initialBuild = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json"], {
  stdio: "inherit",
  shell: true,
});
if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const tscWatch = spawn(
  "npx",
  ["tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  { stdio: "inherit", shell: true },
);

const runner = spawn("node", ["--watch", "--import", "tsx", "dist/main.js"], {
  stdio: "inherit",
  shell: true,
});

function shutdown() {
  tscWatch.kill();
  runner.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const logFile = resolve("logs/api.log");
const pidFile = resolve("logs/api.pid");
let child;
let shuttingDown = false;

function log(message) {
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

function start() {
  child = spawn(process.execPath, ["--import", "tsx", "dist/main.js"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(pidFile, String(child.pid));
  log(`started pid=${child.pid}`);
  child.stdout.on("data", (data) => appendFileSync(logFile, data));
  child.stderr.on("data", (data) => appendFileSync(logFile, data));
  child.on("exit", (code, signal) => {
    log(`exited code=${code} signal=${signal}`);
    if (shuttingDown) return;
    setTimeout(start, 2000);
  });
}

function shutdown() {
  shuttingDown = true;
  log("supervisor shutting down");
  child?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
start();

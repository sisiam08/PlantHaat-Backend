/**
 * Starts the isolated Part 3 API on :5001 using backend/.env.test.
 * Never used by the dev server. Env values stay in the process; nothing is printed.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(".env.test"), override: true });

process.env.PORT = "5001";
process.env.API_URL = "http://localhost:5001";
process.env.APP_URL = "http://localhost:3002";
process.env.CORS_ORIGINS = "http://localhost:3002,http://localhost:3000";

await import("../dist/main.js");

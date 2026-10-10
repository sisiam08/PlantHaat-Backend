import { defineComputeConfig } from "@prisma/compute-sdk/config";

export default defineComputeConfig({
  app: {
    name: "backend",
    framework: "nestjs",
    httpPort: 5000,
    env: ".env",
  },
});

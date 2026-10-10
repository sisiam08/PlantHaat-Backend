import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

export function buildDatabaseUrl(): string {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = (rawDatabaseUrl ?? "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

export function createPrismaOptions() {
  return {
    adapter: new PrismaPg({ connectionString: buildDatabaseUrl() }),
  };
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient(createPrismaOptions());
}

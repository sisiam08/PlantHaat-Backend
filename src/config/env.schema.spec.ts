import { envSchema } from "./env.schema";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  APP_URL: "https://planthaat.example.com",
  API_URL: "https://api.planthaat.example.com",
  CORS_ORIGINS: "https://planthaat.example.com",
  JWT_ACCESS_SECRET: "a".repeat(32),
  DATA_ENCRYPTION_KEY: "k".repeat(32),
  ADMIN_EMAIL: "owner@planthaat.example.com",
  ADMIN_PASSWORD: "Str0ngAdminPass1!",
};

function parsed(overrides: Record<string, string>) {
  return envSchema.safeParse({ ...base, ...overrides });
}

describe("storage env validation", () => {
  it("requires a strong JWT access secret with no random fallback", () => {
    const result = envSchema.safeParse({
      ...base,
      JWT_ACCESS_SECRET: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("JWT_ACCESS_SECRET"))).toBe(
        true,
      );
    }
  });

  it("rejects dev-looking production values", () => {
    const cases: Array<[string, Record<string, string>]> = [
      ["APP_URL", { APP_URL: "http://localhost:3000" }],
      ["CORS_ORIGINS", { CORS_ORIGINS: "https://localhost:3002" }],
      ["ADMIN_EMAIL", { ADMIN_EMAIL: "admin@teststack.local" }],
      ["ADMIN_PASSWORD", { ADMIN_PASSWORD: "TestAdmin123!" }],
      ["DATA_ENCRYPTION_KEY", { DATA_ENCRYPTION_KEY: "k" }],
      ["JWT_ACCESS_SECRET", { JWT_ACCESS_SECRET: "changeme" }],
    ];
    for (const [path, override] of cases) {
      const result = envSchema.safeParse({ ...base, NODE_ENV: "production", ...override });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes(path))).toBe(true);
      }
    }
  });

  it("accepts a fully public production baseline", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      STORAGE_DRIVER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      CLOUDINARY_FOLDER: "planthaat/prod",
      BFF_SHARED_SECRET: "b".repeat(32),
    });
    expect(result.success).toBe(true);
  });

  it("defaults to the auto driver", () => {
    const result = parsed({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.STORAGE_DRIVER).toBe("auto");
    }
  });

  it("refuses the local driver in production", () => {
    const result = parsed({
      NODE_ENV: "production",
      STORAGE_DRIVER: "local",
      BFF_SHARED_SECRET: "b".repeat(32),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("STORAGE_DRIVER"))).toBe(true);
    }
  });

  it("requires all Cloudinary keys when the driver is cloudinary", () => {
    const result = parsed({ STORAGE_DRIVER: "cloudinary", CLOUDINARY_CLOUD_NAME: "demo" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("CLOUDINARY_API_KEY");
      expect(paths).toContain("CLOUDINARY_API_SECRET");
    }
  });

  it("requires all keys when any partial Cloudinary key is set", () => {
    const result = parsed({ CLOUDINARY_API_SECRET: "secret" });
    expect(result.success).toBe(false);
  });

  it("accepts Cloudinary auto mode with full keys", () => {
    const result = parsed({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("requires an explicit production Cloudinary folder", () => {
    const baseProduction = {
      NODE_ENV: "production",
      STORAGE_DRIVER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      BFF_SHARED_SECRET: "b".repeat(32),
    };
    const missing = parsed(baseProduction);
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.some((issue) => issue.path.includes("CLOUDINARY_FOLDER"))).toBe(
        true,
      );
    }
    const wrong = parsed({ ...baseProduction, CLOUDINARY_FOLDER: "planthaat/dev" });
    expect(wrong.success).toBe(false);
    const good = parsed({ ...baseProduction, CLOUDINARY_FOLDER: "planthaat/prod" });
    expect(good.success).toBe(true);
  });
});

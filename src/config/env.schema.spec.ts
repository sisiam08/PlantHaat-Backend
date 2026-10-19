import { envSchema } from "./env.schema";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_ACCESS_SECRET: "a".repeat(32),
  DATA_ENCRYPTION_KEY: "k",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "password",
};

function parsed(overrides: Record<string, string>) {
  return envSchema.safeParse({ ...base, ...overrides });
}

describe("storage env validation", () => {
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
});

import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(32, "BFF_SHARED_SECRET must be at least 32 characters").optional(),
);
const optionalNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
);

const booleanString = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined ? true : ["true", "1", "yes", "on"].includes(value.trim().toLowerCase()),
  );

const csvList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:5000"),
  CORS_ORIGINS: csvList("http://localhost:3000"),
  COOKIE_DOMAIN: optionalString,
  BFF_SHARED_SECRET: optionalSecret,

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().min(1).default("planthaat"),
  JWT_AUDIENCE: z.string().min(1).default("planthaat-web"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(20),

  DATA_ENCRYPTION_KEY: z.string().min(1, "DATA_ENCRYPTION_KEY is required"),

  MAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalNumber,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  MAIL_FROM: z.string().min(1).default("PlantHaat <no-reply@planthaat.local>"),

  // "auto" uses Cloudinary when its keys are present, otherwise local.
  STORAGE_DRIVER: z.enum(["auto", "local", "s3", "cloudinary"]).default("auto"),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  /** Environment-scoped Cloudinary folder, e.g. planthaat/dev. */
  CLOUDINARY_FOLDER: optionalString,
  /** Deprecated alias kept for existing local env files. */
  CLOUDINARY_FOLDER_PREFIX: optionalString,
  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_BASE_URL: optionalString,

  ENABLE_SWAGGER: booleanString,

  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
  ADMIN_NAME: z.string().min(1).default("PlantHaat Admin"),

  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  REALTIME_PUBLIC_URL: z.string().min(1).default("http://localhost:5000"),
  REALTIME_TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  REALTIME_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(900),
  REALTIME_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(5),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production") {
    const localOrigin = (origin: string) =>
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin) ||
      /\.local(:\d+)?$/i.test(origin);
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (!value.APP_URL.startsWith("https://") || localOrigin(value.APP_URL)) {
      add("APP_URL", "APP_URL must be a public https URL in production");
    }
    if (!value.API_URL.startsWith("https://") || localOrigin(value.API_URL)) {
      add("API_URL", "API_URL must be a public https URL in production");
    }
    if (value.CORS_ORIGINS.length === 0) {
      add("CORS_ORIGINS", "At least one CORS origin is required in production");
    }
    for (const origin of value.CORS_ORIGINS) {
      if (!origin.startsWith("https://") || localOrigin(origin)) {
        add("CORS_ORIGINS", `CORS origin must be a public https URL in production: ${origin}`);
      }
    }
    if (/planthaat\.local$/i.test(value.MAIL_FROM)) {
      add("MAIL_FROM", "MAIL_FROM must not use the development .local domain in production");
    }
    const weakSecrets = new Set([
      "change-me",
      "changeme",
      "secret",
      "test-secret",
      "development-secret",
      "example-secret",
    ]);
    if (weakSecrets.has(value.JWT_ACCESS_SECRET.toLowerCase())) {
      add("JWT_ACCESS_SECRET", "JWT_ACCESS_SECRET must not be a development/default value");
    }
    if (
      value.DATA_ENCRYPTION_KEY.length < 32 ||
      weakSecrets.has(value.DATA_ENCRYPTION_KEY.toLowerCase())
    ) {
      add("DATA_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY must be at least 32 chars and not a default");
    }
    const weakAdminEmails = new Set([
      "admin@teststack.local",
      "admin@planthaat.local",
      "admin@example.com",
      "admin@planthaat.test",
    ]);
    if (
      weakAdminEmails.has(value.ADMIN_EMAIL.toLowerCase()) ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.ADMIN_EMAIL)
    ) {
      add("ADMIN_EMAIL", "ADMIN_EMAIL must be a real production admin address");
    }
    const weakPasswords = new Set(["TestAdmin123!", "Admin123!", "password", "changeme", "admin"]);
    if (value.ADMIN_PASSWORD.length < 12 || weakPasswords.has(value.ADMIN_PASSWORD)) {
      add("ADMIN_PASSWORD", "ADMIN_PASSWORD must be at least 12 chars and not a default/test value");
    }
  }
  if (value.NODE_ENV === "production" && !value.BFF_SHARED_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["BFF_SHARED_SECRET"],
      message: "BFF_SHARED_SECRET is required when NODE_ENV=production",
    });
  }
  const cloudinaryKeys = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ] as const;
  const hasAnyCloudinaryKey = cloudinaryKeys.some((key) => Boolean(value[key]));
  const wantCloudinary =
    value.STORAGE_DRIVER === "cloudinary" ||
    (value.STORAGE_DRIVER === "auto" &&
      cloudinaryKeys.every((key) => Boolean(value[key])));
  if (wantCloudinary || hasAnyCloudinaryKey) {
    for (const key of cloudinaryKeys) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when Cloudinary storage is used`,
        });
      }
    }
  }
  if (
    value.NODE_ENV === "production" &&
    value.STORAGE_DRIVER !== "cloudinary" &&
    value.STORAGE_DRIVER !== "s3"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_DRIVER"],
      message: "STORAGE_DRIVER must be cloudinary or s3 in production (local is refused)",
    });
  }
  if (value.NODE_ENV === "production" && value.STORAGE_DRIVER === "cloudinary") {
    if (!value.CLOUDINARY_FOLDER) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_FOLDER"],
        message: "CLOUDINARY_FOLDER is required in production (for example planthaat/prod)",
      });
    } else if (!/(^|\/)prod(\/|$)/.test(value.CLOUDINARY_FOLDER)) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_FOLDER"],
        message: "CLOUDINARY_FOLDER must be a production folder (include a /prod segment)",
      });
    }
  }
  if (value.STORAGE_DRIVER === "s3") {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
    if (!value.S3_REGION && !value.S3_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_REGION"],
        message: "S3_REGION or S3_ENDPOINT is required when STORAGE_DRIVER=s3",
      });
    }
  }
});

export type AppConfig = z.infer<typeof envSchema>;

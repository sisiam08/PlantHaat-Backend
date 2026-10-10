import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
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

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().min(1).default("planthaat"),
  JWT_AUDIENCE: z.string().min(1).default("planthaat-web"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),

  DATA_ENCRYPTION_KEY: z.string().min(1, "DATA_ENCRYPTION_KEY is required"),

  MAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalNumber,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  MAIL_FROM: z.string().min(1).default("PlantHaat <no-reply@planthaat.local>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
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
});

export type AppConfig = z.infer<typeof envSchema>;

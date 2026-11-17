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

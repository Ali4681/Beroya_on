import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('Beroya On'),
  API_PREFIX: Joi.string().default('api/v1/go'),
  CORS_ORIGINS: Joi.string().default('*'),
  /** Public website origin for tracking_url (`{APP_PUBLIC_URL}/t/{token}`). Empty = relative `/t/...`. */
  APP_PUBLIC_URL: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').default(''),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  /** Optional direct Postgres URL for migrate/deploy when DATABASE_URL points at PgBouncer. */
  DIRECT_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).allow('').optional(),
  /** Max clients in the Node `pg.Pool` (keep modest behind PgBouncer in production). */
  PG_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),
  PG_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).default(30_000),
  PG_POOL_CONN_TIMEOUT_MS: Joi.number().integer().min(1000).default(5_000),

  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: Joi.string().default('go:'),
  /** When true, auto-start portable Redis under `.tools/redis` if REDIS_URL is down. */
  REDIS_MOCK: Joi.boolean().default(false),
  MOCK_REDIS: Joi.boolean().optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),

  OTP_DEV_MODE: Joi.boolean().default(false),
  OTP_DEV_CODE: Joi.string().pattern(/^\d{6}$/).default('123456'),
  OTP_TTL_SECONDS: Joi.number().integer().min(30).default(300),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(0).default(60),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('api/docs'),

  ROUTE_OSRM_URL: Joi.string().uri().allow('').default('https://router.project-osrm.org'),
  GOOGLE_MAPS_API_KEY: Joi.string().allow('').default(''),
  FCM_PROJECT_ID: Joi.string().allow('').default(''),
  FCM_CLIENT_EMAIL: Joi.string().allow('').default(''),
  FCM_PRIVATE_KEY: Joi.string().allow('').default(''),

  /** Cloudflare R2 — when credentials are set, media goes to R2; otherwise local `storage/`. */
  R2_ACCOUNT_ID: Joi.string().allow('').default(''),
  R2_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  R2_PUBLIC_BUCKET: Joi.string().allow('').default(''),
  R2_PRIVATE_BUCKET: Joi.string().allow('').default(''),
  R2_S3_ENDPOINT: Joi.string().uri({ scheme: ['https'] }).allow('').default(''),
  R2_PUBLIC_BASE_URL: Joi.string().uri({ scheme: ['https', 'http'] }).allow('').default(''),
  R2_REGION: Joi.string().default('auto'),
  R2_PRESIGNED_UPLOAD_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  R2_PRESIGNED_DOWNLOAD_TTL_SECONDS: Joi.number().integer().min(30).default(300),
  R2_MULTIPART_THRESHOLD_BYTES: Joi.number().integer().min(5_242_880).default(104_857_600),
  MEDIA_ORPHAN_TTL_SECONDS: Joi.number().integer().min(60).default(86_400),
});

export interface AppConfig {
  nodeEnv: string;
  port: number;
  appName: string;
  apiPrefix: string;
  publicUrl: string;
  corsOrigins: string[] | '*';
  redis: { url: string; keyPrefix: string; mock: boolean };
  jwt: { accessSecret: string; accessTtl: string; refreshSecret: string; refreshTtlDays: number };
  otp: { devMode: boolean; devCode: string; ttlSeconds: number; maxAttempts: number; resendCooldownSeconds: number };
  swagger: { enabled: boolean; path: string };
  routing: { osrmUrl: string; googleMapsApiKey: string };
  fcm: { projectId: string; clientEmail: string; privateKey: string };
  r2: {
    enabled: boolean;
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBucket: string;
    privateBucket: string;
    endpoint: string;
    publicBaseUrl: string;
    region: string;
    presignedUploadTtlSeconds: number;
    presignedDownloadTtlSeconds: number;
    multipartThresholdBytes: number;
    mediaOrphanTtlSeconds: number;
  };
}

export default (): { app: AppConfig } => {
  const cors = process.env.CORS_ORIGINS ?? '*';
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const r2Endpoint = process.env.R2_S3_ENDPOINT ?? '';
  const r2PublicBucket = process.env.R2_PUBLIC_BUCKET ?? '';
  const r2PrivateBucket = process.env.R2_PRIVATE_BUCKET ?? '';
  const r2Enabled = Boolean(r2AccessKeyId && r2SecretAccessKey && r2Endpoint && r2PublicBucket && r2PrivateBucket);
  return {
    app: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      port: Number(process.env.PORT ?? 3000),
      appName: process.env.APP_NAME ?? 'Beroya On',
      apiPrefix: process.env.API_PREFIX ?? 'api/v1/go',
      publicUrl: (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, ''),
      corsOrigins: cors === '*' ? '*' : cors.split(',').map((o) => o.trim()),
      redis: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'go:',
        mock:
          String(process.env.REDIS_MOCK ?? process.env.MOCK_REDIS ?? 'false').toLowerCase() ===
          'true',
      },
      jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET as string,
        accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
        refreshSecret: process.env.JWT_REFRESH_SECRET as string,
        refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
      },
      otp: {
        devMode: String(process.env.OTP_DEV_MODE ?? 'false') === 'true',
        devCode: process.env.OTP_DEV_CODE ?? '123456',
        ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
        maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
        resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
      },
      swagger: {
        enabled: String(process.env.SWAGGER_ENABLED ?? 'true') === 'true',
        path: process.env.SWAGGER_PATH ?? 'api/docs',
      },
      routing: {
        osrmUrl: process.env.ROUTE_OSRM_URL ?? 'https://router.project-osrm.org',
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
      },
      fcm: {
        projectId: process.env.FCM_PROJECT_ID ?? '',
        clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
        privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      },
      r2: {
        enabled: r2Enabled,
        accountId: process.env.R2_ACCOUNT_ID ?? '',
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
        publicBucket: r2PublicBucket,
        privateBucket: r2PrivateBucket,
        endpoint: r2Endpoint.replace(/\/$/, ''),
        publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
        region: process.env.R2_REGION ?? 'auto',
        presignedUploadTtlSeconds: Number(process.env.R2_PRESIGNED_UPLOAD_TTL_SECONDS ?? 900),
        presignedDownloadTtlSeconds: Number(process.env.R2_PRESIGNED_DOWNLOAD_TTL_SECONDS ?? 300),
        multipartThresholdBytes: Number(process.env.R2_MULTIPART_THRESHOLD_BYTES ?? 104_857_600),
        mediaOrphanTtlSeconds: Number(process.env.MEDIA_ORPHAN_TTL_SECONDS ?? 86_400),
      },
    },
  };
};

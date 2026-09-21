import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8081),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CAMPUS_LATITUDE: z.coerce.number().min(-90).max(90),
  CAMPUS_LONGITUDE: z.coerce.number().min(-180).max(180),
  CAMPUS_RADIUS_METERS: z.coerce.number().positive().default(250),
  GEOFENCE_DWELL_SECONDS: z.coerce.number().int().nonnegative().default(8),
  APP_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4.1-mini'),
  OPENROUTER_SITE_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};

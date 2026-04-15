import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), 'school-erp/.env')
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().optional()
});

export const env = envSchema.parse(process.env);

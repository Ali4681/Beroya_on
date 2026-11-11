import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Migrations / generate datasource URL:
 * - Prefer DIRECT_URL (Postgres :5432) when set — required behind PgBouncer in production.
 * - Fall back to DATABASE_URL for local/dev where there is no Bouncer.
 *
 * Runtime Nest still uses DATABASE_URL via pg.Pool (may be :6432 + pgbouncer=true).
 */
function prismaDatasourceUrl(): string {
  const direct = (process.env.DIRECT_URL ?? '').trim();
  if (direct) return direct;
  return env('DATABASE_URL');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: prismaDatasourceUrl(),
  },
});

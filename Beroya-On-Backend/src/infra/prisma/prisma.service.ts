import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    // Local: DATABASE_URL → Postgres directly; app-side pg.Pool is the only pooler.
    // Production: DATABASE_URL may point at PgBouncer (:6432); keep PG_POOL_MAX modest
    // so each Node process does not open too many client connections into Bouncer.
    //
    // pipeline: true — Prisma may run several statements on one borrowed connection
    // (interactive transactions / requestBatch). Without it, pg@8 emits DeprecationWarning
    // when a second query is queued while another is still running on that client.
    const max = Number(config.get<string>('PG_POOL_MAX') ?? 10);
    const idleTimeoutMillis = Number(config.get<string>('PG_POOL_IDLE_TIMEOUT_MS') ?? 30_000);
    const connectionTimeoutMillis = Number(config.get<string>('PG_POOL_CONN_TIMEOUT_MS') ?? 5_000);
    const pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      pipeline: true,
      max: Number.isFinite(max) && max > 0 ? max : 10,
      idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) ? idleTimeoutMillis : 30_000,
      connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) ? connectionTimeoutMillis : 5_000,
    });
    const adapter = new PrismaPg(pool);
    // Bearer secret of the public tracking page: only queries that select it explicitly get it back.
    super({ adapter, omit: { goRide: { tracking_token: true } } });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Connected to PostgreSQL (pg.Pool max=${this.pool.options.max ?? 10})`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

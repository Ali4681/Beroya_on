import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppConfig } from '../../config/configuration';
import { ensureEmbeddedRedis, stopEmbeddedRedis } from '../redis/embedded-redis';
import { QUEUES } from './queue.constants';
import { QueueHealthService } from './queue-health.service';
import { SystemProcessor } from './system.processor';

export function redisConnectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null as null,
  };
}

const queueNames = Object.values(QUEUES);

/** Boots embedded Redis when REDIS_MOCK=true (idempotent if already up). */
@Injectable()
class RedisMockBootstrap implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const app = this.config.getOrThrow<AppConfig>('app');
    if (!app.redis.mock) return;
    await ensureEmbeddedRedis(app.redis.url);
  }

  onModuleDestroy() {
    const app = this.config.getOrThrow<AppConfig>('app');
    if (app.redis.mock) stopEmbeddedRedis();
  }
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const app = config.getOrThrow<AppConfig>('app');
        // Start embedded Redis before workers connect (REDIS_MOCK local mode).
        if (app.redis.mock) {
          await ensureEmbeddedRedis(app.redis.url);
        }
        return {
          connection: redisConnectionFromUrl(app.redis.url),
          prefix: app.nodeEnv === 'test' ? 'go-bull-test' : 'go-bull',
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        };
      },
    }),
    BullModule.registerQueue(...queueNames.map((name) => ({ name }))),
  ],
  providers: [
    SystemProcessor,
    RedisMockBootstrap,
    {
      provide: QueueHealthService,
      inject: [ConfigService, ...queueNames.map((n) => getQueueToken(n))],
      useFactory: (config: ConfigService, ...queues: Queue[]) => {
        const mock = config.getOrThrow<AppConfig>('app').redis.mock;
        return new QueueHealthService(queues, mock);
      },
    },
  ],
  exports: [BullModule, QueueHealthService],
})
export class QueueModule {}

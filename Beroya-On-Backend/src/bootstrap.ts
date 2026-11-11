import { INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { goValidationPipe } from './common/validation/validation-pipe';
import type { AppConfig } from './config/configuration';
import { RedisIoAdapter } from './infra/realtime/redis-io.adapter';
import { TRACKING_PAGE_ROUTE } from './modules/go/public-tracking/public-tracking.controller';

/** Shared app wiring for main.ts, e2e tests and the swagger export script. */
export async function configureApp(app: INestApplication, opts: { redisAdapter?: boolean } = {}) {
  const cfg = app.get(ConfigService).getOrThrow<AppConfig>('app');
  app.setGlobalPrefix(cfg.apiPrefix, { exclude: [{ path: TRACKING_PAGE_ROUTE, method: RequestMethod.GET }] });
  app.useGlobalPipes(goValidationPipe());
  app.enableCors({ origin: cfg.corsOrigins === '*' ? true : cfg.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  const adapter = new RedisIoAdapter(app, cfg.corsOrigins);
  // Embedded Redis (REDIS_MOCK) is started in QueueModule; adapter still helps multi-socket fans.
  if (opts.redisAdapter !== false) await adapter.connectToRedis(cfg.redis.url);
  app.useWebSocketAdapter(adapter);
  return cfg;
}

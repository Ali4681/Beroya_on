import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

export async function createE2eApp(): Promise<NestExpressApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', true);
  await configureApp(app, { redisAdapter: false });
  await app.init();
  return app;
}

/** `/api/v1/go` + suffix (leading slash on suffix optional). */
export function go(path: string): string {
  const prefix = process.env.API_PREFIX ?? 'api/v1/go';
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `/${prefix}${suffix}`;
}

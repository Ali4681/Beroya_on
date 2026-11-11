require('dotenv').config();
process.env.REDIS_MOCK = process.env.REDIS_MOCK || 'true';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/bootstrap');

(async () => {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  await configureApp(app);
  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const r = await fetch(`http://127.0.0.1:${port}/api/v1/go/health`);
  const body = await r.text();
  console.log('health', r.status, body);
  try {
    await app.close();
  } catch {
    /* ignore shutdown race */
  }
  process.exit(r.status === 200 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

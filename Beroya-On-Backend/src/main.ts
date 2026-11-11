import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  app.set('trust proxy', true);
  const cfg = await configureApp(app);
  if (cfg.swagger.enabled) setupSwagger(app, cfg.swagger.path);

  await app.listen(cfg.port);
  const logger = new Logger('Bootstrap');
  logger.log(`API      http://localhost:${cfg.port}/${cfg.apiPrefix}`);
  logger.log(`Public   ${cfg.publicUrl || '(relative /t/{token})'} → tracking_url`);
  if (cfg.swagger.enabled) logger.log(`Swagger  http://localhost:${cfg.port}/${cfg.swagger.path}`);
}


void bootstrap();

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { buildSwaggerDocument } from '../src/swagger';

/** Writes the OpenAPI document to docs/swagger.json. */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  await configureApp(app, { redisAdapter: false });
  await app.init();
  const doc = buildSwaggerDocument(app);
  const out = resolve(__dirname, '../docs/swagger.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2));
  const ops = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  console.log(`Swagger exported: ${out} (${Object.keys(doc.paths).length} paths, ${ops} operations)`);
  await app.close();
  process.exit(0);
}

void main();

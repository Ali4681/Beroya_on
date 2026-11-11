import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Phase 0 — session refresh (transaction e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function staffTokens() {
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'admin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    return login.body as { access_token: string; refresh_token: string };
  }

  it('rotates refresh token; old refresh invalidates session', async () => {
    const run = randomUUID();
    const first = await staffTokens();
    const rotated = await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', `e2e-refresh-rotate-1-${run}`)
      .send({ refresh_token: first.refresh_token })
      .expect(200);
    expect(rotated.body.refresh_token).not.toBe(first.refresh_token);

    await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', `e2e-refresh-rotate-3-${run}`)
      .send({ refresh_token: rotated.body.refresh_token })
      .expect(200);

    const reuseOld = await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', `e2e-refresh-rotate-2-${run}`)
      .send({ refresh_token: first.refresh_token })
      .expect(401);
    expect(reuseOld.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('idempotency: same refresh key replays; different body reuses key -> 422', async () => {
    const tokens = await staffTokens();
    const key = `e2e-idem-refresh-${randomUUID()}`;

    const r1 = await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', key)
      .send({ refresh_token: tokens.refresh_token })
      .expect(200);

    const r2 = await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', key)
      .send({ refresh_token: tokens.refresh_token })
      .expect(200);
    expect(r2.headers['idempotent-replayed']).toBe('true');
    expect(r2.body.refresh_token).toBe(r1.body.refresh_token);

    const bad = await request(app.getHttpServer())
      .post(go('/auth/refresh'))
      .set('Idempotency-Key', key)
      .send({ refresh_token: 'not-a-valid-token' })
      .expect(422);
    expect(bad.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

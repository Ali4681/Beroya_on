import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Phase 0 — HTTP (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get(go('/health')).expect(200);
    expect([
      'phase-0',
      'phase-1',
      'phase-2',
      'phase-3',
      'phase-4',
      'phase-5',
      'phase-6',
      'phase-7',
      'phase-8',
      'phase-9',
      'phase-10',
    ]).toContain(res.body.phase);
    expect(res.body.checks.database).toBe('up');
  });

  it('GET /meta/error-codes', async () => {
    const res = await request(app.getHttpServer()).get(go('/meta/error-codes')).expect(200);
    expect(res.body.some((x: { code: string }) => x.code === 'ROLE_NOT_ALLOWED')).toBe(true);
  });

  it('staff login + admin ping + erp ping', async () => {
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    const token = login.body.access_token as string;
    await request(app.getHttpServer()).get(go('/admin/ping')).set('Authorization', `Bearer ${token}`).expect(200);
    const erp = await request(app.getHttpServer()).get(go('/erp/ping')).set('Authorization', `Bearer ${token}`).expect(200);
    expect(erp.body.branch_scope).toBeNull();
  });

  it('customer OTP + customer ping; customer denied admin', async () => {
    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963911111111', app: 'CUSTOMER' })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963911111111', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const token = verify.body.access_token as string;
    await request(app.getHttpServer()).get(go('/customer/ping')).set('Authorization', `Bearer ${token}`).expect(200);
    const denied = await request(app.getHttpServer()).get(go('/admin/ping')).set('Authorization', `Bearer ${token}`).expect(403);
    expect(denied.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('CS Damascus erp ping has branch_scope', async () => {
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'cs.dam@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(go('/erp/ping'))
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);
    expect(res.body.role).toBe('CUSTOMER_SERVICE');
    expect(res.body.branch_scope).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

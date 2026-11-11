import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('App info (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('public GET + admin PATCH are scoped per app identity', async () => {
    const pubCustomer = await request(app.getHttpServer()).get(go('/app/info?app=customer')).expect(200);
    expect(pubCustomer.body).toMatchObject({
      app: 'customer',
      support_phone: expect.any(String),
      support_whatsapp: expect.any(String),
      support_email: expect.any(String),
      terms_url: expect.any(String),
      privacy_url: expect.any(String),
      about_ar: expect.any(String),
      min_supported_version: expect.any(String),
      latest_version: expect.any(String),
    });
    expect(pubCustomer.body.id).toBeUndefined();

    const defaulted = await request(app.getHttpServer()).get(go('/app/info')).expect(200);
    expect(defaulted.body.app).toBe('customer');

    const patchedDriver = await request(app.getHttpServer())
      .patch(go('/admin/config/app-info?app=driver'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-app-info-driver-${randomUUID()}`)
      .send({
        support_phone: '+963922222222',
        support_whatsapp: '+963922222222',
        support_email: 'drivers@beroyaon.com',
        about_ar: 'عن تطبيق السائق — نص تجريبي',
        min_supported_version: '1.0.0',
        latest_version: '2.0.0',
      })
      .expect(200);
    expect(patchedDriver.body.app).toBe('driver');
    expect(patchedDriver.body.support_phone).toBe('+963922222222');
    expect(patchedDriver.body.latest_version).toBe('2.0.0');

    const againDriver = await request(app.getHttpServer()).get(go('/app/info?app=driver')).expect(200);
    expect(againDriver.body).toMatchObject({
      app: 'driver',
      support_phone: '+963922222222',
      support_email: 'drivers@beroyaon.com',
      latest_version: '2.0.0',
    });

    const againCustomer = await request(app.getHttpServer()).get(go('/app/info?app=customer')).expect(200);
    expect(againCustomer.body.support_phone).not.toBe('+963922222222');
    expect(againCustomer.body.latest_version).not.toBe('2.0.0');

    await request(app.getHttpServer())
      .patch(go('/admin/config/app-info?app=customer'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-app-info-bad-${randomUUID()}`)
      .send({ min_supported_version: 'not-a-version' })
      .expect(400);
  });
});

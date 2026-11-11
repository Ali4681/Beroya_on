import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Phase 10 — Driver Passport Framework (e2e)', () => {
  let app: INestApplication;
  let driverToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'admin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963922222222', app: 'DRIVER' })
      .expect(200);
    driverToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: '+963922222222', app: 'DRIVER', code: '123456' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('driver passport framework view + admin levels', async () => {
    const levels = await request(app.getHttpServer())
      .get(go('/admin/driver-passport/levels'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(levels.body.length).toBeGreaterThanOrEqual(3);

    const view = await request(app.getHttpServer())
      .get(go('/driver/passport'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(view.body.framework_only).toBe(true);
    expect(view.body.hidden_score).toBeUndefined();
    expect(view.body.level?.order).toBe(1);
    expect(view.body.completed_rides).toBeGreaterThanOrEqual(0);

    await request(app.getHttpServer())
      .patch(go(`/admin/driver-passport/levels/${levels.body[0].id}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name_en: 'New Driver (framework)' })
      .expect(200);

    const levelOrder = 9000 + Math.floor(Math.random() * 1000);
    const created = await request(app.getHttpServer())
      .post(go('/admin/driver-passport/levels'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        level_order: levelOrder,
        name_ar: 'مستوى تجريبي',
        name_en: 'Temp framework level',
        is_active: false,
      })
      .expect(201);
    expect(created.body.level_order).toBe(levelOrder);
    expect(created.body.is_active).toBe(false);
  });
});

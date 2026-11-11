import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Phase 1 — Master data (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminToken = login.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists public ride categories with pricing', async () => {
    const res = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body[0]).toHaveProperty('pricing');
  });

  it('admin pricing list + patch with idempotency', async () => {
    const list = await request(app.getHttpServer())
      .get(go('/admin/pricing'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const categoryId = list.body[0].ride_category_id as string;
    const key = `e2e-pricing-${randomUUID()}`;
    const patched = await request(app.getHttpServer())
      .patch(go(`/admin/pricing/${categoryId}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send({ base_fare: 1100, price_per_km: 410, price_per_minute: 85, minimum_fare: 2600, currency: 'SYP' })
      .expect(200);
    expect(Number(patched.body.base_fare)).toBe(1100);

    const replay = await request(app.getHttpServer())
      .patch(go(`/admin/pricing/${categoryId}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send({ base_fare: 1100, price_per_km: 410, price_per_minute: 85, minimum_fare: 2600, currency: 'SYP' })
      .expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });

  it('resolves branch from Damascus pickup', async () => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/branches/resolve-pickup'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);
    expect(res.body.code).toBe('DAMASCUS');
  });

  it('driver eligibility for seeded demo driver', async () => {
    await clearOtpPhones(['+963922222222']);
    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963922222222', app: 'DRIVER' })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963922222222', app: 'DRIVER', code: '123456' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(go('/driver/eligibility'))
      .set('Authorization', `Bearer ${verify.body.access_token}`)
      .expect(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.reasons).toEqual([]);
  });

  it('gets dispatch config', async () => {
    const res = await request(app.getHttpServer())
      .get(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.batch_size).toBe(3);
    expect(res.body.radius_steps_json).toContain(500);
    expect(res.body.driver_offer_radius_m).toBe(500);
  });

  it('driver config exposes offer radius matching admin dispatch', async () => {
    await clearOtpPhones(['+963922222222']);
    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963922222222', app: 'DRIVER' })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963922222222', app: 'DRIVER', code: '123456' })
      .expect(200);
    const driverToken = verify.body.access_token as string;

    const before = await request(app.getHttpServer())
      .get(go('/driver/config'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(before.body.driver_offer_radius_m).toBe(500);
    expect(before.body.updated_at).toBeTruthy();

    await request(app.getHttpServer())
      .patch(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-offer-r-${randomUUID()}`)
      .send({ driver_offer_radius_m: 600 })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(go('/driver/config'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(after.body.driver_offer_radius_m).toBe(600);

    await request(app.getHttpServer())
      .patch(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-offer-r-reset-${randomUUID()}`)
      .send({ driver_offer_radius_m: 500 })
      .expect(200);
  });
});

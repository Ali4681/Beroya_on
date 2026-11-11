import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

async function waitForOffer(
  app: INestApplication,
  driverToken: string,
  rideId: string,
  timeoutMs = 8000,
): Promise<{ id: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(app.getHttpServer())
      .get(go('/driver/offers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    const hit = (res.body as { id: string; ride_id: string }[]).find((o) => o.ride_id === rideId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No offer for ${rideId}`);
}

describe('Phase 9 — Passport / Discounts (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let adminToken: string;
  let categoryId: string;
  let customerProfileId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    categoryId = (await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200)).body[0]
      .id;

    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'admin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await clearOtpPhones(['+963911111111', '+963922222222']);

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963911111111', app: 'CUSTOMER' })
      .expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: '+963911111111', app: 'CUSTOMER', code: '123456' })
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

    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    // Ensure passport exists + get customer profile via discount create path
    const passport = await request(app.getHttpServer())
      .get(go('/customer/passport'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(passport.body.level).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      name_en: expect.any(String),
      order: expect.any(Number),
    });
    expect(passport.body.level).toHaveProperty('stamp_name_ar');
    expect(passport.body.level).toHaveProperty('icon_url');
    expect(passport.body.hidden_score).toBeUndefined();
    expect(passport.body.score).toBeUndefined();
    expect(passport.body.current_streak).toBeDefined();
    expect(passport.body.stamps.count).toBeGreaterThanOrEqual(1);
    expect(passport.body.stamps.latest).toMatchObject({
      name: expect.any(String),
      earned_at: expect.any(String),
    });
    expect(passport.body.stamps.latest).toHaveProperty('image_url');
    expect(passport.body).toHaveProperty('active_reward');

    const levels = await request(app.getHttpServer())
      .get(go('/admin/passport/levels'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const first = levels.body[0] as { id: string; stamp_name_ar?: string | null };
    await request(app.getHttpServer())
      .patch(go(`/admin/passport/levels/${first.id}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stamp_name_ar: 'أنت استثنائي' })
      .expect(200);
    const patched = await request(app.getHttpServer())
      .get(go(`/admin/passport/levels/${first.id}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(patched.body.stamp_name_ar).toBe('أنت استثنائي');

    const levelId = passport.body.level.id as string;
    const stampCode = `STAMP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expires = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const createdStamp = await request(app.getHttpServer())
      .post(go('/admin/discount-codes'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-p9-stamp-${randomUUID()}`)
      .send({
        name: 'Stamp reward',
        code: stampCode,
        percentage: 15,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: expires,
        usage_limit: 100,
        audience: 'STAMP',
        passport_level_id: levelId,
      })
      .expect(201);
    const withReward = await request(app.getHttpServer())
      .get(go('/customer/passport'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(withReward.body.active_reward).toMatchObject({
      label: 'خصم 15%',
      percentage: 15,
      discount_code_id: createdStamp.body.id,
      code: stampCode,
    });
    expect(withReward.body.active_reward.expires_at).toBeTruthy();

    const customers = await request(app.getHttpServer())
      .get(go('/erp/customers'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const demo = (customers.body as { id: string; user?: { phone?: string } }[]).find(
      (c) => c.user?.phone === '+963911111111',
    );
    customerProfileId = demo?.id ?? customers.body[0].id;

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin passport config + discount lifecycle on completed ride', async () => {
    const levels = await request(app.getHttpServer())
      .get(go('/admin/passport/levels'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(levels.body.length).toBe(5);

    const code = `E2E${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const disc = await request(app.getHttpServer())
      .post(go(`/admin/customers/${customerProfileId}/discount-codes`))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E 10%',
        code,
        percentage: 10,
        maximum_discount_amount: 5000,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        usage_limit: 2,
        immediate_allowed: true,
        scheduled_allowed: true,
        ride_category_ids: [categoryId],
      })
      .expect(201);

    const available = await request(app.getHttpServer())
      .get(go('/customer/discount-codes'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(available.body.some((c: { id: string }) => c.id === disc.body.id)).toBe(true);

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p9-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        payment_method: 'CASH',
        discount_code_id: disc.body.id,
      })
      .expect(201);

    const offer = await waitForOffer(app, driverToken, created.body.id);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p9-acc-${randomUUID()}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p9-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    const ended = await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p9-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    expect(Number(ended.body.discount_total)).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/rating`))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ stars: 5, reasons: ['POLITE'], notes: 'great' })
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${created.body.id}/rating`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p9-rate-${randomUUID()}`)
      .send({ stars: 4, reasons: ['CLEAN_CAR'] })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.my_rating?.stars).toBe(4);
    expect(detail.body.ratings).toBeUndefined();

    const passportAfter = await request(app.getHttpServer())
      .get(go('/customer/passport'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(passportAfter.body.current_streak).toBeGreaterThanOrEqual(1);

    await clearActiveCustomerRide(app, customerToken);
  });
});

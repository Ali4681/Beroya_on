import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Min SEARCHING window before FAILED_NO_DRIVER (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let driverToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createE2eApp();

    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .patch(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-min-search-cfg-${randomUUID()}`)
      .send({ min_search_seconds: 5, empty_search_retry_seconds: 1, batch_timeout_seconds: 3 })
      .expect(200);

    const cats = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    categoryId = (cats.body as { id: string; code: string }[]).find((c) => c.code === 'ECONOMY')?.id ?? cats.body[0].id;

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

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    try {
      await request(app.getHttpServer())
        .patch(go('/admin/config/dispatch'))
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `e2e-min-search-reset-${randomUUID()}`)
        .send({ min_search_seconds: 90, empty_search_retry_seconds: 10, batch_timeout_seconds: 10 });
    } catch {
      // best-effort reset — suite may already be tearing down Redis/Bull
    }
    await app.close();
  }, 30_000);

  it('keeps SEARCHING with searching_until, then FAILED_NO_DRIVER after min window when no drivers', async () => {
    await request(app.getHttpServer())
      .post(go('/driver/availability/offline'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-min-search-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'Min search pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Min search drop' },
        payment_method: 'CASH',
      })
      .expect(201);

    const rideId = created.body.id as string;
    expect(created.body.status).toBe('SEARCHING');

    const mid = await request(app.getHttpServer())
      .get(go(`/customer/rides/${rideId}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(mid.body.status).toBe('SEARCHING');
    expect(mid.body.searching_until).toBeTruthy();
    const until = new Date(mid.body.searching_until as string).getTime();
    expect(until).toBeGreaterThan(Date.now());

    // Still searching before the window ends
    await new Promise((r) => setTimeout(r, 2000));
    const still = await request(app.getHttpServer())
      .get(go(`/customer/rides/${rideId}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(still.body.status).toBe('SEARCHING');

    const deadline = Date.now() + 15_000;
    let status = still.body.status as string;
    while (Date.now() < deadline && status === 'SEARCHING') {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await request(app.getHttpServer())
        .get(go(`/customer/rides/${rideId}`))
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      status = poll.body.status;
      if (status !== 'SEARCHING') {
        expect(poll.body.searching_until).toBeNull();
      }
    }
    expect(status).toBe('FAILED_NO_DRIVER');
  }, 30_000);

  it('offers a driver who comes online during the min search window', async () => {
    await clearActiveCustomerRide(app, customerToken);
    await request(app.getHttpServer())
      .post(go('/driver/availability/offline'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-min-search-late-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'Late driver pickup' },
        destination: { lat: 33.515, lng: 36.315, address: 'Late driver drop' },
        payment_method: 'CASH',
      })
      .expect(201);
    const rideId = created.body.id as string;

    await new Promise((r) => setTimeout(r, 800));

    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.501, lng: 36.301 })
      .expect(200);

    const started = Date.now();
    let offerId: string | undefined;
    while (Date.now() - started < 8_000) {
      const res = await request(app.getHttpServer())
        .get(go('/driver/offers'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      const hit = (res.body as { id: string; ride_id: string }[]).find((o) => o.ride_id === rideId);
      if (hit) {
        offerId = hit.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(offerId).toBeTruthy();

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-min-search-late-cancel-${randomUUID()}`)
      .expect(200);
  }, 20_000);
});

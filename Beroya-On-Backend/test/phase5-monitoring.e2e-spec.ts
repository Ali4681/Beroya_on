import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
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
  throw new Error(`No offer for ride ${rideId}`);
}

describe('Phase 5 — Monitoring / CS (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let adminToken: string;
  let csToken: string;
  let opsToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createE2eApp();

    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    csToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'cs.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    opsToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'ops.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .patch(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-p5-cfg-${randomUUID()}`)
      .send({
        long_stop_seconds: 2,
        pickup_arrival_radius_m: 200,
        route_deviation_max_m: 80,
        stale_location_seconds: 2,
        batch_timeout_seconds: 8,
      })
      .expect(200);

    categoryId = (await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200)).body[0].id;

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

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('auto-arrive, long-stop alert, live board, audited contact-info', async () => {
    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p5-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        payment_method: 'CASH',
      })
      .expect(201);

    const offer = await waitForOffer(app, driverToken, created.body.id);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p5-acc-${randomUUID()}`)
      .expect(200);

    // Ping near pickup → auto ARRIVED
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5001, lng: 36.3001 })
      .expect(200);

    const afterArrive = await request(app.getHttpServer())
      .get(go(`/driver/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(afterArrive.body.status).toBe('ARRIVED');

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p5-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    // Stay still → LONG_STOP
    for (let i = 0; i < 4; i++) {
      await request(app.getHttpServer())
        .post(go('/driver/location'))
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ lat: 33.5002, lng: 36.3002 })
        .expect(200);
      await new Promise((r) => setTimeout(r, 800));
    }

    const alerts = await request(app.getHttpServer())
      .get(go('/erp/alerts'))
      .query({ type: 'LONG_STOP', ride_id: created.body.id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(alerts.body.length).toBeGreaterThanOrEqual(1);

    const live = await request(app.getHttpServer())
      .get(go('/erp/rides/live'))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    const liveRide = live.body.find((r: { id: string }) => r.id === created.body.id);
    expect(liveRide).toBeTruthy();
    expect(liveRide.customer?.user?.phone).toBeUndefined();
    expect(liveRide.driver?.user?.phone).toBeUndefined();

    const contact = await request(app.getHttpServer())
      .get(go(`/erp/rides/${created.body.id}/contact-info`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    expect(contact.body.customer_phone).toBe('+963911111111');
    expect(contact.body.driver_phone).toBe('+963922222222');

    // OPERATIONS cannot use CS-only contact-info (SUPER_ADMIN bypasses RolesGuard by design)
    await request(app.getHttpServer())
      .get(go(`/erp/rides/${created.body.id}/contact-info`))
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(403);

    // OPERATIONS cannot resolve alerts (Ticket §12.3 — CS only)
    await request(app.getHttpServer())
      .post(go(`/erp/alerts/${alerts.body[0].id}/resolve`))
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ reason: 'TRAFFIC', notes: '' })
      .expect(403);

    await request(app.getHttpServer())
      .post(go(`/erp/alerts/${alerts.body[0].id}/resolve`))
      .set('Authorization', `Bearer ${csToken}`)
      .send({ reason: 'TRAFFIC', notes: '' })
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p5-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);

    await clearActiveCustomerRide(app, customerToken);
  }, 60_000);
});

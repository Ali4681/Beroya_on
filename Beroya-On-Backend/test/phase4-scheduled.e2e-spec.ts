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
  throw new Error(`No offer for ride ${rideId}`);
}

describe('Phase 4 — Scheduled ride engine (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let adminToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createE2eApp();

    const admin = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminToken = admin.body.access_token;

    // Short lifecycle windows for e2e
    await request(app.getHttpServer())
      .patch(go('/admin/config/dispatch'))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-p4-cfg-${randomUUID()}`)
      .send({
        scheduled_reminder_seconds: 8,
        scheduled_online_required_seconds: 5,
        scheduled_late_tolerance_seconds: 0,
        batch_timeout_seconds: 8,
      })
      .expect(200);

    const cats = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    categoryId = cats.body[0].id;

    await clearOtpPhones(['+963911111111', '+963922222222']);

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963911111111', app: 'CUSTOMER' })
      .expect(200);
    const cust = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963911111111', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    customerToken = cust.body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963922222222', app: 'DRIVER' })
      .expect(200);
    const drv = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963922222222', app: 'DRIVER', code: '123456' })
      .expect(200);
    driverToken = drv.body.access_token;

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

  it('publishes scheduled immediately, reserves on accept, lists upcoming', async () => {
    let rideId: string | undefined;
    try {
      const scheduledAt = new Date(Date.now() + 20_000).toISOString();
      const created = await request(app.getHttpServer())
        .post(go('/customer/rides'))
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', `e2e-p4-${randomUUID()}`)
        .send({
          ride_category_id: categoryId,
          type: 'SCHEDULED',
          scheduled_at: scheduledAt,
          pickup: { lat: 33.5, lng: 36.3, address: 'Sched pickup' },
          destination: { lat: 33.52, lng: 36.32, address: 'Sched drop' },
          payment_method: 'CASH',
        })
        .expect(201);
      expect(created.body.status).toBe('SEARCHING');
      expect(created.body.type).toBe('SCHEDULED');
      rideId = created.body.id;

      const offer = await waitForOffer(app, driverToken, created.body.id);
      const accepted = await request(app.getHttpServer())
        .post(go(`/driver/offers/${offer.id}/accept`))
        .set('Authorization', `Bearer ${driverToken}`)
        .set('Idempotency-Key', `e2e-p4-acc-${randomUUID()}`)
        .expect(200);
      expect(accepted.body.status).toBe('DRIVER_ASSIGNED');

      const active = await request(app.getHttpServer())
        .get(go('/driver/rides/active'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      // Reserved scheduled (DRIVER_ASSIGNED) must not appear as home active (may still show another live immediate).
      expect(active.body?.id ?? null).not.toBe(created.body.id);

      const upcoming = await request(app.getHttpServer())
        .get(go('/driver/scheduled-rides'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      expect(upcoming.body.some((r: { id: string }) => r.id === created.body.id)).toBe(true);

      await request(app.getHttpServer())
        .post(go('/driver/availability/offline'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      await new Promise((r) => setTimeout(r, 18_000));

      const alerts = await request(app.getHttpServer())
        .get(go('/erp/alerts'))
        .query({ type: 'SCHEDULED_DRIVER_OFFLINE', ride_id: created.body.id })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(alerts.body.length).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .post(go(`/erp/alerts/${alerts.body[0].id}/claim`))
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(go(`/erp/alerts/${alerts.body[0].id}/resolve`))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'OTHER', notes: 'e2e' })
        .expect(200);
    } finally {
      if (rideId) {
        await request(app.getHttpServer())
          .post(go(`/customer/rides/${rideId}/cancel`))
          .set('Authorization', `Bearer ${customerToken}`)
          .set('Idempotency-Key', `e2e-p4-cancel-${randomUUID()}`);
      }
      await clearActiveCustomerRide(app, customerToken);
    }
  }, 60_000);
});

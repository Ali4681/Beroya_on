import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

const CUSTOMER_PHONE = '+963955500014';
const DRIVER_PHONE = '+963922222222';

async function waitForOffer(app: INestApplication, driverToken: string, rideId: string, timeoutMs = 8000) {
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

describe('Customer activity screen (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let categoryId: string;

  async function login(phone: string, appName: 'CUSTOMER' | 'DRIVER') {
    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone, app: appName }).expect(200);
    return (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone, app: appName, code: '123456' })
        .expect(200)
    ).body.access_token as string;
  }

  function createRide(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-act-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        payment_method: 'CASH',
        ...body,
      });
  }

  function listRides(query: Record<string, unknown> | string) {
    return request(app.getHttpServer())
      .get(go('/customer/rides'))
      .query(query)
      .set('Authorization', `Bearer ${customerToken}`);
  }

  beforeAll(async () => {
    app = await createE2eApp();
    categoryId = (await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200)).body[0].id;
    await clearOtpPhones([CUSTOMER_PHONE, DRIVER_PHONE]);
    customerToken = await login(CUSTOMER_PHONE, 'CUSTOMER');
    driverToken = await login(DRIVER_PHONE, 'DRIVER');

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
    await clearActiveCustomerRide(app, customerToken);
    await app.close();
  });

  it('meta/enums exposes complaint reason codes', async () => {
    const res = await request(app.getHttpServer()).get(go('/meta/enums')).expect(200);
    expect(res.body.enums.GoComplaintReasonCode).toEqual([
      'DANGEROUS_DRIVING',
      'DRIVER_BEHAVIOR',
      'ROUTE_ISSUE',
      'FARE_ISSUE',
      'VEHICLE_ISSUE',
      'LATE_DRIVER',
      'OTHER',
    ]);
    expect(res.body.enums.GoComplaintUrgentReasonCode).toEqual(['DANGEROUS_DRIVING']);
  });

  it('allows several non-overlapping scheduled rides plus one immediate ride', async () => {
    const hour = 3600_000;
    const s1 = await createRide({ type: 'SCHEDULED', scheduled_at: new Date(Date.now() + 3 * hour).toISOString() }).expect(201);
    const s2 = await createRide({ type: 'SCHEDULED', scheduled_at: new Date(Date.now() + 6 * hour).toISOString() }).expect(201);

    const clash = await createRide({
      type: 'SCHEDULED',
      scheduled_at: new Date(Date.now() + 3 * hour + 10 * 60_000).toISOString(),
    }).expect(409);
    expect(clash.body.code).toBe('RIDE_TIME_CONFLICT');
    expect(clash.body.ride_id).toBe(s1.body.id);

    const now = await createRide({ type: 'IMMEDIATE' }).expect(201);
    const second = await createRide({ type: 'IMMEDIATE' }).expect(409);
    expect(second.body.code).toBe('ACTIVE_RIDE_EXISTS');
    expect(second.body.ride_id).toBe(now.body.id);

    const current = await listRides({ scope: 'current' }).expect(200);
    const ids = (current.body.items as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual([now.body.id, s1.body.id, s2.body.id]);
    expect(current.body.total).toBe(3);
    expect(current.body.has_more).toBe(false);

    const active = await request(app.getHttpServer())
      .get(go('/customer/rides/active'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(active.body.id).toBe(now.body.id);

    const preview = await request(app.getHttpServer())
      .get(go(`/customer/rides/${s1.body.id}/cancel-preview`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(preview.body).toMatchObject({ ride_id: s1.body.id, can_cancel: true, late_cancel: false });

    await clearActiveCustomerRide(app, customerToken);
    const after = await listRides({ scope: 'current' }).expect(200);
    expect(after.body.items).toEqual([]);
  });

  it('past list rows use the customer view with rating + complaint + driver phone', async () => {
    const created = await createRide({ type: 'IMMEDIATE' }).expect(201);
    const rideId = created.body.id as string;
    const offer = await waitForOffer(app, driverToken, rideId);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-act-acc-${randomUUID()}`)
      .expect(200);

    const live = await request(app.getHttpServer())
      .get(go(`/customer/rides/${rideId}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(live.body.driver.user.phone).toBe(DRIVER_PHONE);
    expect(live.body.driver.call_url).toBe(`tel:${DRIVER_PHONE}`);
    expect(live.body.ends_at).toBeTruthy();
    expect(live.body.rental_ends_at).toBe(live.body.ends_at);
    expect(live.body.service_type).toBe('DAILY');
    expect(live.body.vehicle).toMatchObject({ plate_number: expect.any(String) });

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-act-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-act-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/rating`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-act-rate-${randomUUID()}`)
      .send({ stars: 4, reasons: ['CLEAN_CAR'] })
      .expect(200);
    const complaint = await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/complaints`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-act-c-${randomUUID()}`)
      .send({ reason_code: 'ROUTE_ISSUE' })
      .expect(201);

    const past = await listRides({ scope: 'past', limit: 1 }).expect(200);
    expect(past.body).toMatchObject({ page: 1, limit: 1 });
    expect(past.body.total).toBeGreaterThanOrEqual(1);
    expect(typeof past.body.has_more).toBe('boolean');

    const row = past.body.items[0];
    expect(row.id).toBe(rideId);
    expect(row.status).toBe('COMPLETED');
    expect(row.driver.user.full_name).toBeTruthy();
    expect(row.driver.user.phone).toBe(DRIVER_PHONE);
    expect(row.driver.call_url).toBe(`tel:${DRIVER_PHONE}`);
    expect(row.driver).toHaveProperty('avatar_url');
    expect(row.vehicle).toBeTruthy();
    expect(row.ends_at).toBeTruthy();
    expect(row.my_rating).toEqual({ stars: 4 });
    expect(row.my_complaint).toMatchObject({ id: complaint.body.id, reason_code: 'ROUTE_ISSUE', status: 'OPEN' });
    expect(row.service_type).toBe('DAILY');
    expect(row.vehicles_count).toBe(1);
    expect(row.passengers_count).toBeNull();
    expect(row.vehicles).toEqual([
      expect.objectContaining({ category: expect.anything(), count: 1, ride_category_id: expect.any(String) }),
    ]);

    const wanted = ['CANCELLED_BY_CUSTOMER', 'COMPLETED'];
    const repeated = await listRides('status=COMPLETED&status=CANCELLED_BY_CUSTOMER&limit=50').expect(200);
    const commaSeparated = await listRides({ status: wanted.join(','), limit: 50 }).expect(200);
    for (const res of [repeated, commaSeparated]) {
      const statuses = new Set((res.body.items as { status: string }[]).map((r) => r.status));
      expect([...statuses].sort()).toEqual(wanted);
    }

    const none = await listRides({ scope: 'current', status: 'COMPLETED' }).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0, has_more: false });

    const bad = await listRides({ status: 'NOPE' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    const preview = await request(app.getHttpServer())
      .get(go(`/customer/rides/${rideId}/cancel-preview`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(preview.body.can_cancel).toBe(false);
  }, 60_000);
});

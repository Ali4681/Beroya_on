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
): Promise<{
  id: string;
  ride_id: string;
  service_code?: string;
  service?: { code: string; name_ar: string; name_en?: string | null };
  ride_category?: { id: string; code: string; name_ar: string; name_en?: string | null };
  type?: string;
}> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(app.getHttpServer())
      .get(go('/driver/offers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    const hit = (
      res.body as {
        id: string;
        ride_id: string;
        service_code?: string;
        service?: { code: string; name_ar: string; name_en?: string | null };
        ride_category?: { id: string; code: string; name_ar: string; name_en?: string | null };
        type?: string;
      }[]
    ).find((o) => o.ride_id === rideId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No offer for ride ${rideId} within ${timeoutMs}ms`);
}

async function expectNoOffer(
  app: INestApplication,
  driverToken: string,
  rideId: string,
  forMs = 2500,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < forMs) {
    const res = await request(app.getHttpServer())
      .get(go('/driver/offers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    const hit = (res.body as { id: string; ride_id: string }[]).find((o) => o.ride_id === rideId);
    if (hit) throw new Error(`Unexpected offer ${hit.id} for mismatched-category ride ${rideId}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('Phase 3 — Dispatch (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let categoryId: string;
  let economyId: string;
  let vipId: string | undefined;

  beforeAll(async () => {
    app = await createE2eApp();

    const cats = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    const list = cats.body as { id: string; code: string }[];
    categoryId = list[0].id;
    economyId = list.find((c) => c.code === 'ECONOMY')?.id ?? categoryId;
    vipId = list.find((c) => c.code === 'VIP')?.id;

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
      .send({ lat: 33.501, lng: 36.301, speed: 5, heading: 45 })
      .expect(200);

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('create → offer → atomic accept → complete', async () => {
    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'P3 Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'P3 Drop' },
        requirements: ['CHILD_SEAT'],
        payment_method: 'CASH',
      })
      .expect(201);
    expect(created.body.status).toBe('SEARCHING');
    const rideId = created.body.id as string;

    const offer = await waitForOffer(app, driverToken, rideId);
    expect(offer.service_code).toBeTruthy();
    expect(offer.service?.code).toBe(offer.service_code);
    expect(offer.service?.name_ar).toBeTruthy();
    expect(offer.ride_category?.id).toBe(categoryId);
    expect(offer.ride_category?.code).toBeTruthy();
    expect(offer.type).toBe('IMMEDIATE');

    const accepted = await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p3-accept-${randomUUID()}`)
      .expect(200);
    expect(accepted.body.status).toBe('DRIVER_EN_ROUTE');
    expect(accepted.body.driver_id).toBeTruthy();

    const second = await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p3-accept2-${randomUUID()}`)
      .expect(409);
    expect(second.body.code).toBe('RIDE_ALREADY_TAKEN');

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p3-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);
    const ended = await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p3-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    expect(ended.body.status).toBe('COMPLETED');
  });

  it('decline offer leaves ride searching for next batch', async () => {
    await clearActiveCustomerRide(app, customerToken);
    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-dec-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.515, lng: 36.315 },
      })
      .expect(201);

    const offer = await waitForOffer(app, driverToken, created.body.id);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/decline`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const ride = await request(app.getHttpServer())
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(ride.body.status).toBe('SEARCHING');

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-dec-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('does not offer VIP rides to ECONOMY active vehicle', async () => {
    if (!vipId || vipId === economyId) return;

    await clearActiveCustomerRide(app, customerToken);
    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    const mismatched = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-vip-${randomUUID()}`)
      .send({
        ride_category_id: vipId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'VIP pickup' },
        destination: { lat: 33.515, lng: 36.315, address: 'VIP drop' },
        payment_method: 'CASH',
      })
      .expect(201);

    await expectNoOffer(app, driverToken, mismatched.body.id);

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${mismatched.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-vip-cancel-${randomUUID()}`)
      .expect(200);

    const matched = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-eco-${randomUUID()}`)
      .send({
        ride_category_id: economyId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'ECO pickup' },
        destination: { lat: 33.515, lng: 36.315, address: 'ECO drop' },
        payment_method: 'CASH',
      })
      .expect(201);

    const offer = await waitForOffer(app, driverToken, matched.body.id);
    expect(offer.ride_category?.id).toBe(economyId);

    await request(app.getHttpServer())
      .post(go(`/customer/rides/${matched.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p3-eco-cancel-${randomUUID()}`)
      .expect(200);
  });
});

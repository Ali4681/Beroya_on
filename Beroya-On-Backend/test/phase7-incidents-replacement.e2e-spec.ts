import { INestApplication } from '@nestjs/common';
import { GoOperationalAlertType } from '../src/generated/prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AlertsService } from '../src/modules/go/alerts/alerts.service';
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
  throw new Error(`No offer for ${rideId}`);
}

describe('Phase 7 — Incidents / Replacement (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let csToken: string;
  let financeToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    categoryId = (await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200)).body[0]
      .id;

    csToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'cs.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
    financeToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'finance@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

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

  async function startInProgressRide() {
    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p7-${randomUUID()}`)
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
      .set('Idempotency-Key', `e2e-p7-acc-${randomUUID()}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p7-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);
    return created.body.id as string;
  }

  it('auto-creates ACCIDENT case from LONG_STOP resolve + case APIs', async () => {
    const rideId = await startInProgressRide();
    const ride = (
      await request(app.getHttpServer())
        .get(go(`/erp/rides/${rideId}`))
        .set('Authorization', `Bearer ${csToken}`)
        .expect(200)
    ).body;

    const alerts = app.get(AlertsService);
    const alert = await alerts.raise({
      ride_id: rideId,
      branch_id: ride.branch_id,
      type: GoOperationalAlertType.LONG_STOP,
      occurrence_no: 1,
      allowMultiple: true,
    });

    await request(app.getHttpServer())
      .post(go(`/erp/alerts/${alert.id}/resolve`))
      .set('Authorization', `Bearer ${csToken}`)
      .send({ reason: 'ACCIDENT', notes: 'crash' })
      .expect(200);

    const cases = await request(app.getHttpServer())
      .get(go('/erp/cases'))
      .query({ type: 'ACCIDENT' })
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    const hit = cases.body.find((c: { ride_id: string }) => c.ride_id === rideId);
    expect(hit).toBeTruthy();

    const alert2 = await alerts.raise({
      ride_id: rideId,
      branch_id: ride.branch_id,
      type: GoOperationalAlertType.LONG_STOP,
      occurrence_no: 2,
      allowMultiple: true,
    });
    await request(app.getHttpServer())
      .post(go(`/erp/alerts/${alert2.id}/resolve`))
      .set('Authorization', `Bearer ${csToken}`)
      .send({ reason: 'ACCIDENT' })
      .expect(200);
    const cases2 = await request(app.getHttpServer())
      .get(go('/erp/cases'))
      .query({ type: 'ACCIDENT' })
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    expect(cases2.body.filter((c: { ride_id: string }) => c.ride_id === rideId).length).toBe(1);

    await request(app.getHttpServer())
      .post(go(`/erp/cases/${hit.id}/customer-statement`))
      .set('Authorization', `Bearer ${csToken}`)
      .send({ statement: 'driver hit curb' })
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/cases/${hit.id}/notes`))
      .set('Authorization', `Bearer ${csToken}`)
      .send({ note: 'follow up' })
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/cases/${hit.id}/close`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p7-end1-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    await clearActiveCustomerRide(app, customerToken);
  });

  it('replacement + entitlement + combined fare', async () => {
    const rideId = await startInProgressRide();

    const rep = await request(app.getHttpServer())
      .post(go(`/erp/rides/${rideId}/replacement`))
      .set('Authorization', `Bearer ${csToken}`)
      .set('Idempotency-Key', `e2e-p7-rep2-${randomUUID()}`)
      .send({ reason: 'BREAKDOWN', lat: 33.51, lng: 36.31 })
      .expect(201);
    expect(rep.body.original_status).toBe('REPLACED');
    expect(rep.body.replacement.status).toBe('SEARCHING');
    expect(rep.body.original_segment_fare).toBeGreaterThan(0);

    // second replacement blocked
    await request(app.getHttpServer())
      .post(go(`/erp/rides/${rideId}/replacement`))
      .set('Authorization', `Bearer ${csToken}`)
      .set('Idempotency-Key', `e2e-p7-rep3-${randomUUID()}`)
      .send({ reason: 'BREAKDOWN', lat: 33.51, lng: 36.31 })
      .expect(409);

    const ents = await request(app.getHttpServer())
      .get(go('/erp/finance/driver-entitlements'))
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    const ent = ents.body.find((e: { ride_id: string }) => e.ride_id === rideId);
    expect(ent).toBeTruthy();
    expect(ent.status).toBe('CALCULATED');

    await request(app.getHttpServer())
      .post(go(`/erp/finance/driver-entitlements/${ent.id}/approve`))
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ approved_amount: Number(ent.calculated_amount), notes: 'ok' })
      .expect(200);

    const replacementId = rep.body.replacement.id as string;
    const offer = await waitForOffer(app, driverToken, replacementId);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p7-acc2-${randomUUID()}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${replacementId}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${replacementId}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p7-start2-${randomUUID()}`)
      .send({ lat: 33.51, lng: 36.31 })
      .expect(200);
    const ended = await request(app.getHttpServer())
      .post(go(`/driver/rides/${replacementId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p7-end2-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    expect(ended.body.combined_gross_fare).toBeGreaterThan(ended.body.replacement_segment_fare);
    expect(Number(ended.body.customer_payable)).toBe(ended.body.combined_gross_fare);

    await clearActiveCustomerRide(app, customerToken);
  });
});

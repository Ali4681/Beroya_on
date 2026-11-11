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
  throw new Error(`No offer for ${rideId}`);
}

describe('Phase 6 — Complaints / Emergency (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let csToken: string;
  let cssupToken: string;
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
    cssupToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'cssup.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963955500012', app: 'CUSTOMER' })
      .expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: '+963955500012', app: 'CUSTOMER', code: '123456' })
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
      .set('Idempotency-Key', `e2e-p6-${randomUUID()}`)
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
      .set('Idempotency-Key', `e2e-p6-acc-${randomUUID()}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p6-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);
    return created.body.id as string;
  }

  async function endRide(rideId: string) {
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p6-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
  }

  function complain(rideId: string, body: object, key = `e2e-p6-c-${randomUUID()}`) {
    return request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/complaints`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('normal + urgent complaint claim/close', async () => {
    const rideId = await startInProgressRide();

    const early = await complain(rideId, { reason_code: 'LATE_DRIVER' }).expect(422);
    expect(early.body.code).toBe('COMPLAINT_NOT_ALLOWED');
    expect(early.body.reason).toBe('RIDE_NOT_COMPLETED');

    await endRide(rideId);

    const invalid = await complain(rideId, { reason_code: 'NOT_A_REASON' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    const noKey = await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/complaints`))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason_code: 'LATE_DRIVER' })
      .expect(400);
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = `e2e-p6-c-${randomUUID()}`;
    const normal = await complain(rideId, { reason_code: ' late_driver ', notes: 'slow' }, key).expect(201);
    expect(normal.body.priority).toBe('NORMAL');
    expect(normal.body.reason_code).toBe('LATE_DRIVER');
    expect(normal.body.submitted_during_ride).toBe(false);

    const replay = await complain(rideId, { reason_code: ' late_driver ', notes: 'slow' }, key).expect(201);
    expect(replay.body.id).toBe(normal.body.id);

    const dup = await complain(rideId, { reason_code: 'ROUTE_ISSUE' }).expect(409);
    expect(dup.body.code).toBe('COMPLAINT_ALREADY_EXISTS');
    expect(dup.body.complaint.id).toBe(normal.body.id);

    const detail = await request(app.getHttpServer())
      .get(go(`/customer/rides/${rideId}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.my_complaint).toMatchObject({ id: normal.body.id, reason_code: 'LATE_DRIVER' });

    const urgentRideId = await startInProgressRide();
    await endRide(urgentRideId);
    const urgent = await complain(urgentRideId, { reason_code: 'DANGEROUS_DRIVING', notes: 'reckless' }).expect(201);
    expect(urgent.body.priority).toBe('URGENT');

    const list = await request(app.getHttpServer())
      .get(go('/erp/complaints'))
      .query({ priority: 'URGENT' })
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    expect(list.body.some((c: { id: string }) => c.id === urgent.body.id)).toBe(true);

    await request(app.getHttpServer())
      .post(go(`/erp/complaints/${urgent.body.id}/claim`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/complaints/${urgent.body.id}/close`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    await clearActiveCustomerRide(app, customerToken);
  });

  it('ride end does not auto-stop live emergency audio (Ticket §15.4)', async () => {
    const rideId = await startInProgressRide();
    const em = await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/emergency`))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(201);
    expect(em.body.recording_status).toBe('LIVE');

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p6-end-live-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(go('/erp/emergencies'))
      .query({ status: 'ACTIVE' })
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    const still = list.body.find((e: { id: string }) => e.id === em.body.id);
    expect(still?.recording_status).toBe('LIVE');

    await request(app.getHttpServer())
      .post(go(`/customer/emergencies/${em.body.id}/audio/stop`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/emergencies/${em.body.id}/recording/discard`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/emergencies/${em.body.id}/close`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    await clearActiveCustomerRide(app, customerToken);
  });

  it('emergency audio save + supervisor playback/delete', async () => {
    const rideId = await startInProgressRide();

    const em = await request(app.getHttpServer())
      .post(go(`/customer/rides/${rideId}/emergency`))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(201);
    expect(em.body.status).toBe('ACTIVE');
    expect(em.body.recording_status).toBe('LIVE');

    const token = await request(app.getHttpServer())
      .post(go(`/customer/emergencies/${em.body.id}/audio/token`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(token.body.namespace).toBe('/go/emergency-audio');
    expect(token.body.token).toBeTruthy();

    await request(app.getHttpServer())
      .post(go(`/customer/emergencies/${em.body.id}/audio/chunk`))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ data_base64: Buffer.from('fake-audio-bytes').toString('base64') })
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/customer/emergencies/${em.body.id}/audio/stop`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/erp/emergencies/${em.body.id}/recording/save`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);

    const play = await request(app.getHttpServer())
      .get(go(`/erp/emergencies/${em.body.id}/recording`))
      .set('Authorization', `Bearer ${cssupToken}`)
      .expect(200);
    expect(play.body.size_bytes).toBeGreaterThan(0);
    expect(play.body.signed_url).toContain('/recording/stream?token=');

    await request(app.getHttpServer()).get(play.body.signed_url).expect(200);

    // CS (non-supervisor) cannot playback
    await request(app.getHttpServer())
      .get(go(`/erp/emergencies/${em.body.id}/recording`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(go(`/erp/emergencies/${em.body.id}/recording`))
      .set('Authorization', `Bearer ${cssupToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/erp/emergencies/${em.body.id}/claim`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/erp/emergencies/${em.body.id}/close`))
      .set('Authorization', `Bearer ${csToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p6-end2-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    await clearActiveCustomerRide(app, customerToken);
  });
});

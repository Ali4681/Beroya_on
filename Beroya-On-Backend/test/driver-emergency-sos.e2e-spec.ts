import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

const DRIVER_PHONE = '+963922222222';
const CUSTOMER_PHONE = '+963955500022';

describe('Driver SOS (EMRG-001) (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let cs: { Authorization: string };
  let driver: { Authorization: string };

  const staffLogin = async (identifier: string) => {
    const res = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier, password: 'Beroya@12345' })
      .expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  const otpLogin = async (phone: string, appName: 'CUSTOMER' | 'DRIVER') => {
    const server = app.getHttpServer();
    await clearOtpPhones([phone]);
    await request(server).post(go('/auth/otp/request')).send({ phone, app: appName }).expect(200);
    const res = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: appName, code: '123456' })
      .expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    await clearOtpPhones([DRIVER_PHONE, CUSTOMER_PHONE]);
    admin = await staffLogin('superadmin@beroyaon.com');
    cs = await staffLogin('cs.dam@beroyaon.com');
    driver = await otpLogin(DRIVER_PHONE, 'DRIVER');
  });

  afterAll(async () => {
    await app.close();
  });

  it('driver opens SOS, shares session with customer, location, claim/close, active_emergency', async () => {
    const server = app.getHttpServer();
    const customer = await otpLogin(CUSTOMER_PHONE, 'CUSTOMER');
    await clearActiveCustomerRide(app, customer.Authorization.slice(7));

    const drivers = await request(server).get(go('/erp/drivers')).set(admin).expect(200);
    const profile = drivers.body.find((d: { user: { phone: string } }) => d.user.phone === DRIVER_PHONE);
    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const economy = cats.body.find((c: { code: string }) => c.code === 'ECONOMY');
    const created = await request(server)
      .post(go('/customer/rides'))
      .set(customer)
      .set('Idempotency-Key', `e2e-drv-sos-${randomUUID()}`)
      .send({
        ride_category_id: economy.id,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(201);
    const rideId = created.body.id as string;
    const sos = go(`/driver/rides/${rideId}/emergency`);

    try {
      // Before assign the ride is not this driver's → RIDE_NOT_FOUND (not RIDE_NOT_ACTIVE).
      await request(server)
        .post(sos)
        .set(driver)
        .set('Idempotency-Key', randomUUID())
        .send({ lat: 33.5, lng: 36.3 })
        .expect(404)
        .expect((r) => expect(r.body.code).toBe('RIDE_NOT_FOUND'));

      await request(server)
        .post(go(`/erp/rides/${rideId}/assign`))
        .set(admin)
        .set('Idempotency-Key', `e2e-drv-sos-assign-${randomUUID()}`)
        .send({ driver_id: profile.id })
        .expect(200);

      const key = `e2e-drv-sos-start-${rideId}`;
      const first = await request(server)
        .post(sos)
        .set(driver)
        .set('Idempotency-Key', key)
        .send({ lat: 36.2, lng: 37.13 })
        .expect(201);
      expect(first.body).toMatchObject({
        ride_id: rideId,
        status: 'ACTIVE',
        claimed: false,
        already_active: false,
        started_by: 'DRIVER',
        started_lat: 36.2,
        started_lng: 37.13,
        recording_status: 'LIVE',
      });

      const replay = await request(server)
        .post(sos)
        .set(driver)
        .set('Idempotency-Key', key)
        .send({ lat: 36.2, lng: 37.13 })
        .expect(201);
      expect(replay.body.id).toBe(first.body.id);

      const customerResume = await request(server)
        .post(go(`/customer/rides/${rideId}/emergency`))
        .set(customer)
        .send({ lat: 33.501, lng: 36.301 })
        .expect(200);
      expect(customerResume.body).toMatchObject({
        id: first.body.id,
        already_active: true,
        started_by: 'DRIVER',
      });

      const driverResume = await request(server)
        .post(sos)
        .set(driver)
        .set('Idempotency-Key', randomUUID())
        .send({ lat: 36.21, lng: 37.14 })
        .expect(200);
      expect(driverResume.body).toMatchObject({ id: first.body.id, already_active: true });

      const alerts = await request(server)
        .get(go('/erp/alerts'))
        .query({ ride_id: rideId, type: 'EMERGENCY' })
        .set(admin)
        .expect(200);
      expect(alerts.body).toHaveLength(1);
      expect(alerts.body[0].metadata).toMatchObject({
        emergency_id: first.body.id,
        started_by: 'DRIVER',
      });

      const moved = await request(server)
        .post(`${sos}/${first.body.id}/location`)
        .set(driver)
        .send({ lat: 36.22, lng: 37.15 })
        .expect(200);
      expect(moved.body).toMatchObject({
        id: first.body.id,
        last_lat: 36.22,
        last_lng: 37.15,
        status: 'ACTIVE',
      });

      const active = await request(server).get(go('/driver/rides/active')).set(driver).expect(200);
      expect(active.body.active_emergency).toEqual({
        id: first.body.id,
        status: 'ACTIVE',
        claimed: false,
        claimed_at: null,
        started_at: first.body.started_at,
      });
      const detail = await request(server).get(go(`/driver/rides/${rideId}`)).set(driver).expect(200);
      expect(detail.body.active_emergency.id).toBe(first.body.id);

      await request(server).post(go(`/erp/emergencies/${first.body.id}/claim`)).set(cs).expect(200);
      const afterClaim = await request(server).get(go('/driver/rides/active')).set(driver).expect(200);
      expect(afterClaim.body.active_emergency).toMatchObject({
        id: first.body.id,
        status: 'ACTIVE',
        claimed: true,
      });

      await request(server).post(go(`/erp/emergencies/${first.body.id}/close`)).set(cs).expect(200);
      const afterClose = await request(server).get(go('/driver/rides/active')).set(driver).expect(200);
      expect(afterClose.body.active_emergency).toBeNull();

      const late = await request(server)
        .post(`${sos}/${first.body.id}/location`)
        .set(driver)
        .send({ lat: 36.2, lng: 37.13 })
        .expect(409);
      expect(late.body.code).toBe('EMERGENCY_NOT_ACTIVE');
    } finally {
      await clearActiveCustomerRide(app, customer.Authorization.slice(7));
      await request(server).post(go('/driver/availability/online')).set(driver);
    }
  });
});

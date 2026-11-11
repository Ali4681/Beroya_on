import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

const DRIVER_PHONE = '+963922222222';
const CUSTOMER_PHONE = '+963955500011';

describe('Customer SOS before pickup, dedupe and status on the ride (e2e)', () => {
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
    const res = await request(server).post(go('/auth/otp/verify')).send({ phone, app: appName, code: '123456' }).expect(200);
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

  it('opens once from driver assignment, reuses the open session, and shows it on the ride', async () => {
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
      .set('Idempotency-Key', `e2e-sos-${randomUUID()}`)
      .send({
        ride_category_id: economy.id,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(201);
    const rideId = created.body.id as string;
    const sos = go(`/customer/rides/${rideId}/emergency`);
    const detail = () => request(server).get(go(`/customer/rides/${rideId}`)).set(customer).expect(200);

    try {
      const searching = await request(server).post(sos).set(customer).send({ lat: 33.5, lng: 36.3 }).expect(409);
      expect(searching.body.code).toBe('RIDE_NOT_ACTIVE');
      expect((await detail()).body.active_emergency).toBeNull();

      await request(server)
        .post(go(`/erp/rides/${rideId}/assign`))
        .set(admin)
        .set('Idempotency-Key', `e2e-sos-assign-${randomUUID()}`)
        .send({ driver_id: profile.id })
        .expect(200);

      // Before pickup: allowed, and repeated presses (even concurrent) return the same session
      const first = await request(server).post(sos).set(customer).send({ lat: 33.5, lng: 36.3 }).expect(201);
      expect(first.body).toMatchObject({
        ride_id: rideId,
        status: 'ACTIVE',
        claimed: false,
        claimed_at: null,
        already_active: false,
        started_lat: 33.5,
        recording_status: 'LIVE',
      });
      expect(first.body).not.toHaveProperty('handled_by_id');
      expect(first.body).not.toHaveProperty('recording_storage_key');

      const repeats = await Promise.all(
        [0, 1, 2].map(() => request(server).post(sos).set(customer).send({ lat: 33.5005, lng: 36.3005 })),
      );
      for (const r of repeats) {
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ id: first.body.id, already_active: true, status: 'ACTIVE' });
      }
      const alerts = await request(server)
        .get(go('/erp/alerts'))
        .query({ ride_id: rideId, type: 'EMERGENCY' })
        .set(admin)
        .expect(200);
      expect(alerts.body).toHaveLength(1);

      // Location updates while open
      const moved = await request(server)
        .post(`${sos}/${first.body.id}/location`)
        .set(customer)
        .send({ lat: 33.501, lng: 36.301 })
        .expect(200);
      expect(moved.body).toMatchObject({ id: first.body.id, last_lat: 33.501, last_lng: 36.301, status: 'ACTIVE' });
      expect(moved.body.last_location_at).toBeDefined();
      const badLat = await request(server).post(`${sos}/${first.body.id}/location`).set(customer).send({ lat: 100, lng: 36.3 }).expect(400);
      expect(badLat.body.errors.map((e: { field: string }) => e.field)).toContain('lat');
      await request(server)
        .post(go(`/customer/rides/${randomUUID()}/emergency/${first.body.id}/location`))
        .set(customer)
        .send({ lat: 33.5, lng: 36.3 })
        .expect(404);
      const erp = await request(server).get(go(`/erp/emergencies/${first.body.id}`)).set(cs).expect(200);
      expect(Number(erp.body.last_lat)).toBe(33.501);

      // Shown on the ride, then claimed by customer service
      expect((await detail()).body.active_emergency).toEqual({
        id: first.body.id,
        status: 'ACTIVE',
        claimed: false,
        claimed_at: null,
        started_at: first.body.started_at,
      });
      const active = await request(server).get(go('/customer/rides/active')).set(customer).expect(200);
      expect(active.body.active_emergency.id).toBe(first.body.id);

      await request(server).post(go(`/erp/emergencies/${first.body.id}/claim`)).set(cs).expect(200);
      const claimed = (await detail()).body.active_emergency;
      expect(claimed).toMatchObject({ id: first.body.id, status: 'ACTIVE', claimed: true });
      expect(claimed.claimed_at).not.toBeNull();
      const afterClaim = await request(server).post(sos).set(customer).send({}).expect(200);
      expect(afterClaim.body).toMatchObject({ id: first.body.id, claimed: true, already_active: true });

      // Closed: visible as CLOSED, no more location, a new press opens a new session
      await request(server).post(go(`/erp/emergencies/${first.body.id}/close`)).set(cs).expect(200);
      expect((await detail()).body.active_emergency).toMatchObject({ id: first.body.id, status: 'CLOSED', claimed: true });
      const late = await request(server)
        .post(`${sos}/${first.body.id}/location`)
        .set(customer)
        .send({ lat: 33.5, lng: 36.3 })
        .expect(409);
      expect(late.body.code).toBe('EMERGENCY_NOT_ACTIVE');

      const second = await request(server).post(sos).set(customer).send({ lat: 33.5, lng: 36.3 }).expect(201);
      expect(second.body.id).not.toBe(first.body.id);
      expect(second.body.already_active).toBe(false);
      expect((await detail()).body.active_emergency).toMatchObject({ id: second.body.id, status: 'ACTIVE', claimed: false });
      await request(server).post(go(`/erp/emergencies/${second.body.id}/close`)).set(cs).expect(200);
    } finally {
      await clearActiveCustomerRide(app, customer.Authorization.slice(7));
      await request(server).post(go('/driver/availability/online')).set(driver);
    }
  });
});

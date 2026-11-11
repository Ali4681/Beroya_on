import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DRIVER_PHONE = '+963922222222';

describe('Customer ride tracking — vehicle, driver card, location (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let driver: { Authorization: string };

  const otpLogin = async (phone: string, appName: 'CUSTOMER' | 'DRIVER') => {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone, app: appName }).expect(200);
    const res = await request(server).post(go('/auth/otp/verify')).send({ phone, app: appName, code: '123456' }).expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    admin = { Authorization: `Bearer ${login.body.access_token}` };
    await clearOtpPhones([DRIVER_PHONE, '+963955500009', '+963955500008']);
    driver = await otpLogin(DRIVER_PHONE, 'DRIVER');
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows vehicle, rating, photo and live tracking only to the ride owner while it is active', async () => {
    const server = app.getHttpServer();
    const customer = await otpLogin('+963955500009', 'CUSTOMER');
    const stranger = await otpLogin('+963955500008', 'CUSTOMER');
    await clearActiveCustomerRide(app, customer.Authorization.slice(7));

    const drivers = await request(server).get(go('/erp/drivers')).set(admin).expect(200);
    const profile = drivers.body.find((d: { user: { phone: string } }) => d.user.phone === DRIVER_PHONE);
    expect(profile.active_vehicle).toBeTruthy();
    await request(server)
      .patch(go(`/admin/drivers/${profile.id}`))
      .set(admin)
      .send({ avatar: `data:image/png;base64,${PNG}` })
      .expect(200);

    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const economy = cats.body.find((c: { code: string }) => c.code === 'ECONOMY');
    const created = await request(server)
      .post(go('/customer/rides'))
      .set(customer)
      .set('Idempotency-Key', `e2e-track-${randomUUID()}`)
      .send({
        ride_category_id: economy.id,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(201);
    const rideId = created.body.id as string;
    const detail = () => request(server).get(go(`/customer/rides/${rideId}`)).set(customer).expect(200);

    try {
      const searching = await detail();
      expect(searching.body).toMatchObject({
        status: 'SEARCHING',
        driver: null,
        vehicle: null,
        driver_location: null,
        driver_eta_sec: null,
      });

      await request(server)
        .post(go(`/erp/rides/${rideId}/assign`))
        .set(admin)
        .set('Idempotency-Key', `e2e-track-assign-${randomUUID()}`)
        .send({ driver_id: profile.id })
        .expect(200);
      await request(server)
        .post(go('/driver/location'))
        .set(driver)
        .send({ lat: 33.505, lng: 36.305, heading: 90, speed: 8 })
        .expect(200);

      const enRoute = await detail();
      expect(enRoute.body.status).toBe('DRIVER_EN_ROUTE');
      expect(enRoute.body.vehicle).toMatchObject({
        plate_number: profile.active_vehicle.plate_number,
        make: profile.active_vehicle.make,
        model: profile.active_vehicle.model,
        color: profile.active_vehicle.color,
      });
      expect(enRoute.body).not.toHaveProperty('vehicle_snapshot');
      const card = enRoute.body.driver;
      expect(card.user.full_name).toBeDefined();
      expect(Number.isInteger(card.rating_count)).toBe(true);
      expect(card.rating_avg === null ? card.rating_count === 0 : card.rating_avg > 0).toBe(true);
      expect(card.avatar_url).toContain(`/customer/rides/${rideId}/driver-avatar?v=`);
      expect(card).not.toHaveProperty('avatar_key');
      expect(enRoute.body.driver_location).toMatchObject({ lat: 33.505, lng: 36.305, heading: 90 });
      expect(enRoute.body.driver_location.recorded_at).toBeDefined();
      expect(enRoute.body.driver_eta_sec).toBeGreaterThan(0);
      expect(enRoute.body.pickup_eta_sec).toBeGreaterThan(0);
      expect(enRoute.body.pickup_distance_m).toBeGreaterThan(0);
      expect(typeof enRoute.body.pickup_route_polyline === 'string' || enRoute.body.pickup_route_polyline === null).toBe(
        true,
      );

      const active = await request(server).get(go('/customer/rides/active')).set(customer).expect(200);
      expect(active.body.id).toBe(rideId);
      expect(active.body.service_type).toBe('DAILY');
      expect(active.body.ends_at).toBeTruthy();
      expect(active.body.rental_ends_at).toBeNull();
      expect(active.body.vehicle).toMatchObject({
        plate_number: profile.active_vehicle.plate_number,
        make: profile.active_vehicle.make,
        model: profile.active_vehicle.model,
      });
      expect(active.body.driver.user.phone).toBeTruthy();
      expect(active.body.driver.call_url).toMatch(/^tel:/);
      expect(active.body.driver_location).not.toBeNull();
      expect(active.body.pickup_eta_sec).toBeGreaterThan(0);
      expect(active.body).toHaveProperty('pickup_route_polyline');

      const img = await request(server).get(go(`/customer/rides/${rideId}/driver-avatar`)).set(customer).expect(200);
      expect(img.headers['content-type']).toContain('image/png');
      await request(server).get(go(`/customer/rides/${rideId}/driver-avatar`)).set(stranger).expect(404);
      await request(server).get(go(`/customer/rides/${rideId}`)).set(stranger).expect(404);

      const erp = await request(server).get(go(`/erp/rides/${rideId}`)).set(admin).expect(200);
      expect(erp.body).not.toHaveProperty('driver_location');
      expect(erp.body.driver).not.toHaveProperty('rating_avg');

      await request(server).post(go(`/driver/rides/${rideId}/arrive`)).set(driver).expect(200);
      const arrived = await detail();
      expect(arrived.body.driver_location).not.toBeNull();
      expect(arrived.body.driver_eta_sec).toBeNull();
      expect(arrived.body.pickup_route_polyline).toBeNull();
      expect(arrived.body.pickup_eta_sec).toBeNull();

      await request(server)
        .post(go(`/driver/rides/${rideId}/start`))
        .set(driver)
        .set('Idempotency-Key', `e2e-track-start-${randomUUID()}`)
        .send({ lat: 33.5, lng: 36.3 })
        .expect(200);
      await request(server).post(go('/driver/location')).set(driver).send({ lat: 33.51, lng: 36.31 }).expect(200);
      const inProgress = await detail();
      expect(inProgress.body.status).toBe('IN_PROGRESS');
      expect(inProgress.body.driver_location).toMatchObject({ lat: 33.51, lng: 36.31, heading: null });
      expect(inProgress.body.driver_eta_sec).toBeGreaterThan(0);

      await request(server)
        .post(go(`/driver/rides/${rideId}/end`))
        .set(driver)
        .set('Idempotency-Key', `e2e-track-end-${randomUUID()}`)
        .send({ lat: 33.52, lng: 36.32 })
        .expect(200);
      const done = await detail();
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.driver_location).toBeNull();
      expect(done.body.driver_eta_sec).toBeNull();
      expect(done.body.vehicle.plate_number).toBe(profile.active_vehicle.plate_number);
      expect(done.body.driver.avatar_url).not.toBeNull();
    } finally {
      await clearActiveCustomerRide(app, customer.Authorization.slice(7));
      await request(server).patch(go(`/admin/drivers/${profile.id}`)).set(admin).send({ remove_avatar: true });
      await request(server).post(go('/driver/availability/online')).set(driver);
    }
  });
});

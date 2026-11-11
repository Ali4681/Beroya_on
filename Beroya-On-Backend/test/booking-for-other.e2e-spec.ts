import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DRIVER_PHONE = '+963922222222';
const PASSENGER_PHONE = '+963944444444';

describe('Booking for someone else — privacy, pickup sign, tracking link (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let driver: { Authorization: string };

  const otpLogin = async (phone: string, appName: 'CUSTOMER' | 'DRIVER') => {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone, app: appName }).expect(200);
    const res = await request(server).post(go('/auth/otp/verify')).send({ phone, app: appName, code: '123456' }).expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  const waitForOffer = async (rideId: string) => {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      const res = await request(app.getHttpServer()).get(go('/driver/offers')).set(driver).expect(200);
      const hit = (res.body as { id: string; ride_id: string }[]).find((o) => o.ride_id === rideId);
      if (hit) return res.body.find((o: { ride_id: string }) => o.ride_id === rideId);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`No offer for ${rideId}`);
  };

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    admin = { Authorization: `Bearer ${login.body.access_token}` };
    driver = await otpLogin(DRIVER_PHONE, 'DRIVER');
  });

  afterAll(async () => {
    await app.close();
  });

  it('hides the passenger phone from the driver and serves a public tracking link', async () => {
    const server = app.getHttpServer();
    const customer = await otpLogin('+963955500013', 'CUSTOMER');
    await clearActiveCustomerRide(app, customer.Authorization.slice(7));

    const drivers = await request(server).get(go('/erp/drivers')).set(admin).expect(200);
    const profile = drivers.body.find((d: { user: { phone: string } }) => d.user.phone === DRIVER_PHONE);
    await request(server).patch(go(`/admin/drivers/${profile.id}`)).set(admin).send({ avatar: PNG }).expect(200);
    await request(server).post(go('/driver/availability/online')).set(driver).expect(200);
    await request(server).post(go('/driver/location')).set(driver).send({ lat: 33.5, lng: 36.3, heading: 45 }).expect(200);

    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const economy = cats.body.find((c: { code: string }) => c.code === 'ECONOMY');
    const base = {
      ride_category_id: economy.id,
      type: 'IMMEDIATE',
      pickup: { lat: 33.5, lng: 36.3, address: 'المطار' },
      destination: { lat: 33.52, lng: 36.32, address: 'المزة' },
    };

    const createErr = async (body: Record<string, unknown>) => {
      const res = await request(server)
        .post(go('/customer/rides'))
        .set(customer)
        .set('Idempotency-Key', `e2e-other-bad-${randomUUID()}`)
        .send({ ...base, ...body })
        .expect(400);
      return res.body.errors.map((e: { field: string }) => e.field);
    };
    expect(await createErr({ pickup_sign_name: 'أحمد' })).toContain('pickup_sign_name');
    expect(
      await createErr({
        booking_for: 'OTHER',
        other_passenger: { name: 'أحمد', phone: PASSENGER_PHONE },
        pickup_sign_name: 'x'.repeat(61),
      }),
    ).toContain('pickup_sign_name');
    expect(await createErr({ booking_for: 'OTHER', other_passenger: { name: '  ' } })).toEqual(['other_passenger.name']);
    expect(await createErr({ booking_for: 'OTHER', other_passenger: { name: 'أحمد', phone: '12' } })).toEqual([
      'other_passenger.phone',
    ]);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set(customer)
      .set('Idempotency-Key', `e2e-other-${randomUUID()}`)
      .send({
        ...base,
        booking_for: 'OTHER',
        other_passenger: { name: 'أحمد', phone: '0944 444 444' },
        pickup_sign_name: '  أحمد محمد  ',
        share_tracking_link: true,
      })
      .expect(201);
    const rideId = created.body.id as string;
    expect(created.body).toMatchObject({
      booking_for: 'OTHER',
      other_passenger_name: 'أحمد',
      other_passenger_phone: PASSENGER_PHONE,
      pickup_sign_name: 'أحمد محمد',
      share_tracking_link: true,
      tracking_url: null,
    });
    expect(created.body).not.toHaveProperty('tracking_token');

    try {
      // Offer list + accept response: name and sign, never the phone
      const offer = await waitForOffer(rideId);
      expect(offer.ride).toMatchObject({ booking_for: 'OTHER', other_passenger_name: 'أحمد', pickup_sign_name: 'أحمد محمد' });
      expect(JSON.stringify(offer)).not.toContain(PASSENGER_PHONE);
      const accepted = await request(server)
        .post(go(`/driver/offers/${offer.id}/accept`))
        .set(driver)
        .set('Idempotency-Key', `e2e-other-acc-${randomUUID()}`)
        .expect(200);
      expect(accepted.body.pickup_sign_name).toBe('أحمد محمد');
      expect(JSON.stringify(accepted.body)).not.toContain(PASSENGER_PHONE);
      expect(accepted.body).not.toHaveProperty('other_passenger_phone');

      const driverView = await request(server).get(go(`/driver/rides/${rideId}`)).set(driver).expect(200);
      expect(driverView.body).toMatchObject({ id: rideId, other_passenger_name: 'أحمد', pickup_sign_name: 'أحمد محمد' });
      expect(driverView.body).not.toHaveProperty('other_passenger_phone');
      expect(driverView.body).not.toHaveProperty('tracking_token');

      // Customer gets the link once a driver is assigned
      const detail = await request(server).get(go(`/customer/rides/${rideId}`)).set(customer).expect(200);
      expect(detail.body.other_passenger_phone).toBe(PASSENGER_PHONE);
      expect(detail.body).not.toHaveProperty('tracking_token');
      expect(detail.body.tracking_url).toMatch(/\/t\/[A-Za-z0-9_-]{32}$/);
      const token = (detail.body.tracking_url as string).split('/t/')[1];
      const erp = await request(server).get(go(`/erp/rides/${rideId}`)).set(admin).expect(200);
      expect(erp.body).not.toHaveProperty('tracking_token');

      // Public JSON: no login, no phone numbers
      const pub = await request(server).get(go(`/public/track/${token}`)).expect(200);
      expect(['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE']).toContain(pub.body.status);
      expect(pub.body).toMatchObject({
        passenger_name: 'أحمد',
        vehicle: { plate: profile.active_vehicle.plate_number },
        pickup: { lat: 33.5, lng: 36.3, address: 'المطار' },
        destination: { lat: 33.52, lng: 36.32, address: 'المزة' },
      });
      expect(pub.body.driver.name).toBeTruthy();
      expect(pub.body.driver_location).toMatchObject({ lat: 33.5, lng: 36.3, heading: 45 });
      expect(Object.keys(pub.body).sort()).toEqual(
        ['destination', 'driver', 'driver_eta_sec', 'driver_location', 'passenger_name', 'pickup', 'status', 'vehicle'].sort(),
      );
      expect(JSON.stringify(pub.body)).not.toMatch(/\+963|phone/);
      const avatarPath = new URL(pub.body.driver.avatar_url, 'http://x').pathname;
      const avatar = await request(server).get(avatarPath).expect(200);
      expect(avatar.headers['content-type']).toContain('image/png');

      const page = await request(server).get(`/t/${token}`).expect(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.text).toContain('/public/track/');
      expect(page.text).not.toContain(token);

      await request(server).get(go('/public/track/not-a-token')).expect(404);
      await request(server).get(go(`/public/track/${'A'.repeat(32)}`)).expect(404);

      // Ride over: link stops, tracking_url goes away
      await request(server).post(go(`/driver/rides/${rideId}/arrive`)).set(driver).expect(200);
      await request(server)
        .post(go(`/driver/rides/${rideId}/start`))
        .set(driver)
        .set('Idempotency-Key', `e2e-other-start-${randomUUID()}`)
        .send({ lat: 33.5, lng: 36.3 })
        .expect(200);
      expect((await request(server).get(go(`/public/track/${token}`)).expect(200)).body.status).toBe('IN_PROGRESS');
      const ended = await request(server)
        .post(go(`/driver/rides/${rideId}/end`))
        .set(driver)
        .set('Idempotency-Key', `e2e-other-end-${randomUUID()}`)
        .send({ lat: 33.52, lng: 36.32 })
        .expect(200);
      expect(JSON.stringify(ended.body)).not.toContain(PASSENGER_PHONE);
      const gone = await request(server).get(go(`/public/track/${token}`)).expect(410);
      expect(gone.body.code).toBe('TRACKING_LINK_EXPIRED');
      await request(server).get(avatarPath).expect(410);
      const done = await request(server).get(go(`/customer/rides/${rideId}`)).set(customer).expect(200);
      expect(done.body.tracking_url).toBeNull();

      // Passenger phone is optional
      const noPhone = await request(server)
        .post(go('/customer/rides'))
        .set(customer)
        .set('Idempotency-Key', `e2e-other-nophone-${randomUUID()}`)
        .send({ ...base, booking_for: 'OTHER', other_passenger: { name: 'سارة' } })
        .expect(201);
      expect(noPhone.body).toMatchObject({ other_passenger_name: 'سارة', other_passenger_phone: null });
    } finally {
      await clearActiveCustomerRide(app, customer.Authorization.slice(7));
      await request(server).patch(go(`/admin/drivers/${profile.id}`)).set(admin).send({ remove_avatar: true });
      await request(server).post(go('/driver/availability/online')).set(driver);
    }
  });
});

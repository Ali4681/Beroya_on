import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Phase 2 — Ride core (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let adminToken: string;
  let categoryId: string;
  let driverProfileId: string;

  beforeAll(async () => {
    app = await createE2eApp();

    const admin = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminToken = admin.body.access_token;

    const cats = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    categoryId = cats.body[0].id;

    const customerPhone = '+963955502901';
    const driverPhone = '+963922222222';
    await clearOtpPhones([customerPhone, driverPhone]);

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: customerPhone, app: 'CUSTOMER' })
      .expect(200);
    const cust = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: customerPhone, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    customerToken = cust.body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: driverPhone, app: 'DRIVER' })
      .expect(200);
    const drv = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: driverPhone, app: 'DRIVER', code: '123456' })
      .expect(200);
    driverToken = drv.body.access_token;

    const drivers = await request(app.getHttpServer())
      .get(go('/erp/drivers'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    driverProfileId = drivers.body.find((d: { user: { phone: string } }) => d.user.phone === driverPhone).id;

    // Keep driver discoverable so dispatch does not FAIL_NO_DRIVER before ERP assign.
    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3, speed: 10, heading: 0 })
      .expect(200);

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('estimate + create + assign + start + end happy path', async () => {
    const estimate = await request(app.getHttpServer())
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        stops: [],
        requirements: ['CHILD_SEAT'],
      })
      .expect(200);
    expect(estimate.body.estimated_fare).toBeGreaterThan(0);

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-ride-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3, address: 'Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Drop' },
        stops: [],
        requirements: ['CHILD_SEAT'],
        payment_method: 'CASH',
      })
      .expect(201);
    expect(created.body.status).toBe('SEARCHING');
    const rideId = created.body.id as string;

    const activeDup = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-ride-dup-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(409);
    expect(activeDup.body.code).toBe('ACTIVE_RIDE_EXISTS');

    await request(app.getHttpServer())
      .post(go(`/erp/rides/${rideId}/assign`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-assign-${randomUUID()}`)
      .send({ driver_id: driverProfileId })
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    const ended = await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    expect(ended.body.status).toBe('COMPLETED');
    expect(Number(ended.body.customer_payable)).toBeGreaterThan(0);

    // Back online for subsequent tests
    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.51, lng: 36.31 })
      .expect(200);
  });

  it('customer cancel while searching is free', async () => {
    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-cancel-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.51, lng: 36.31 },
        destination: { lat: 33.53, lng: 36.33 },
      })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-cancel-do-${randomUUID()}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED_BY_CUSTOMER');
    expect(cancelled.body.late_cancel).toBe(false);
  });

  it('driver location updates', async () => {
    const res = await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3, speed: 20, heading: 90 })
      .expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects SHAM_CASH in V1 (Ticket §21–§22)', async () => {
    await clearActiveCustomerRide(app, customerToken);
    const res = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-sham-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        payment_method: 'SHAM_CASH',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('customer note: saved, validated, editable before assign, visible to driver', async () => {
    const server = app.getHttpServer();
    const phone = '+963955500002';
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const token = login.body.access_token as string;
    await clearActiveCustomerRide(app, token);
    const trip = {
      ride_category_id: categoryId,
      type: 'IMMEDIATE',
      pickup: { lat: 33.5, lng: 36.3 },
      destination: { lat: 33.52, lng: 36.32 },
    };

    const tooLong = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-note-long-${randomUUID()}`)
      .send({ ...trip, customer_note: 'x'.repeat(151) })
      .expect(400);
    expect(tooLong.body.code).toBe('VALIDATION_ERROR');

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-note-${randomUUID()}`)
      .send({ ...trip, customer_note: '  أنا عند البوابة الشرقية  ' })
      .expect(201);
    expect(created.body.customer_note).toBe('أنا عند البوابة الشرقية');
    const rideId = created.body.id as string;

    const edited = await request(server)
      .patch(go(`/customer/rides/${rideId}/note`))
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_note: 'ب'.repeat(150) })
      .expect(200);
    expect(edited.body.customer_note).toBe('ب'.repeat(150));

    await request(server)
      .patch(go(`/customer/rides/${rideId}/note`))
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_note: 'x'.repeat(151) })
      .expect(400);

    await request(server)
      .post(go(`/erp/rides/${rideId}/assign`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-note-assign-${randomUUID()}`)
      .send({ driver_id: driverProfileId })
      .expect(200);

    const driverView = await request(server)
      .get(go(`/driver/rides/${rideId}`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(driverView.body.customer_note).toBe('ب'.repeat(150));

    const locked = await request(server)
      .patch(go(`/customer/rides/${rideId}/note`))
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_note: 'late' })
      .expect(409);
    expect(locked.body.code).toBe('RIDE_NOT_ACTIVE');

    await clearActiveCustomerRide(app, token);
  });

  it('preferred driver language: accepted on estimate + create, defaults to AR, visible to driver', async () => {
    const server = app.getHttpServer();
    const phone = '+963955500003';
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const token = login.body.access_token as string;
    await clearActiveCustomerRide(app, token);
    const trip = {
      ride_category_id: categoryId,
      pickup: { lat: 33.5, lng: 36.3 },
      destination: { lat: 33.52, lng: 36.32 },
    };

    const estimate = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${token}`)
      .send({ ...trip, ride_type: 'IMMEDIATE', preferred_driver_language: 'en' })
      .expect(200);
    expect(estimate.body.preferred_driver_language).toBe('en');

    const invalid = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-lang-bad-${randomUUID()}`)
      .send({ ...trip, type: 'IMMEDIATE', preferred_driver_language: 'xx' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    const plain = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-lang-default-${randomUUID()}`)
      .send({ ...trip, type: 'IMMEDIATE' })
      .expect(201);
    expect(plain.body.preferred_driver_language).toBe('ar');
    await clearActiveCustomerRide(app, token);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-lang-en-${randomUUID()}`)
      .send({ ...trip, type: 'IMMEDIATE', preferred_driver_language: 'EN' })
      .expect(201);
    expect(created.body.preferred_driver_language).toBe('en');

    const french = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${token}`)
      .send({ ...trip, ride_type: 'IMMEDIATE', preferred_driver_language: 'fr' })
      .expect(200);
    expect(french.body.preferred_driver_language).toBe('fr');

    await request(server)
      .post(go(`/erp/rides/${created.body.id}/assign`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-lang-assign-${randomUUID()}`)
      .send({ driver_id: driverProfileId })
      .expect(200);
    const driverView = await request(server)
      .get(go(`/driver/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(driverView.body.preferred_driver_language).toBe('en');

    await clearActiveCustomerRide(app, token);
  });

  it('WALLET ride: insufficient balance, hold on create, refund on cancel', async () => {
    const server = app.getHttpServer();
    const phone = '+963955500001';
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const customerToken = login.body.access_token as string;
    await clearActiveCustomerRide(app, customerToken);
    const trip = {
      ride_category_id: categoryId,
      type: 'IMMEDIATE',
      pickup: { lat: 33.5, lng: 36.3 },
      destination: { lat: 33.52, lng: 36.32 },
    };
    const balance = async () => {
      const res = await request(server)
        .get(go('/customer/wallet'))
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(res.body.currency).toBe('SYP');
      return res.body.balance as number;
    };

    const probe = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-wallet-probe-${randomUUID()}`)
      .send({ ...trip, payment_method: 'CASH' })
      .expect(201);
    const customerId = probe.body.customer_id as string;
    await clearActiveCustomerRide(app, customerToken);

    const start = await balance();
    if (start > 0) {
      await request(server)
        .post(go(`/erp/customer-wallets/${customerId}/withdraw`))
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `e2e-wallet-empty-${randomUUID()}`)
        .send({ amount: start, reason: 'e2e reset' })
        .expect(200);
    }
    expect(await balance()).toBe(0);

    const short = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-wallet-short-${randomUUID()}`)
      .send({ ...trip, payment_method: 'WALLET' })
      .expect(409);
    expect(short.body.code).toBe('WALLET_INSUFFICIENT_BALANCE');
    expect(short.body.required).toBeGreaterThan(0);
    expect(short.body.balance).toBe(0);

    const topUp = short.body.required * 3;
    await request(server)
      .post(go(`/erp/customer-wallets/${customerId}/top-up`))
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `e2e-wallet-topup-${randomUUID()}`)
      .send({ amount: topUp })
      .expect(200);
    expect(await balance()).toBe(topUp);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-wallet-ok-${randomUUID()}`)
      .send({ ...trip, payment_method: 'WALLET' })
      .expect(201);
    expect(created.body.payment_method).toBe('WALLET');
    const held = Number(created.body.wallet_paid_amount);
    expect(held).toBeGreaterThan(0);
    expect(await balance()).toBeCloseTo(topUp - held, 2);

    const ledger = await request(server)
      .get(go(`/erp/customer-wallets/${customerId}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const payment = ledger.body.transactions.find(
      (t: { ride_id: string; type: string }) => t.ride_id === created.body.id && t.type === 'RIDE_PAYMENT',
    );
    expect(Number(payment.amount)).toBeCloseTo(held, 2);

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-wallet-cancel-${randomUUID()}`)
      .expect(200);
    expect(await balance()).toBeCloseTo(topUp, 2);
  });

  it('Ticket §29 — TOURIST estimate/create scales fare by vehicles_count and returns real view fields', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);

    const daily = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'DAILY',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(200);
    expect(daily.body.service_type).toBe('DAILY');
    expect(daily.body.vehicles_count).toBe(1);

    const tourist = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'TOURIST',
        // Over category seat capacity on purpose (e.g. 4 seats × 4 cars = 16).
        passengers_count: 20,
        vehicles_count: 4,
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(200);
    expect(tourist.body.service_type).toBe('TOURIST');
    expect(tourist.body.vehicles_count).toBe(4);
    expect(tourist.body.passengers_count).toBe(20);
    expect(tourist.body.estimated_fare).toBeCloseTo(daily.body.estimated_fare * 4, 0);

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'TOURIST',
        vehicles_count: 2,
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(400);

    const scheduledAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-tourist-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'SCHEDULED',
        scheduled_at: scheduledAt,
        service_type: 'TOURIST',
        passengers_count: 20,
        vehicles_count: 4,
        pickup: { lat: 33.5, lng: 36.3, address: 'Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Drop' },
        payment_method: 'CASH',
      })
      .expect(201);
    expect(created.body.service_code).toBe('TOURIST');
    expect(created.body.vehicles_count).toBe(4);
    expect(created.body.passengers_count).toBe(20);
    expect(created.body.status).toBe('SEARCHING');
    expect(Number(created.body.estimated_fare)).toBeCloseTo(tourist.body.estimated_fare, 0);

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('TOURIST');
    expect(detail.body.vehicles_count).toBe(4);
    expect(detail.body.passengers_count).toBe(20);
    expect(detail.body.vehicles).toEqual([
      expect.objectContaining({ count: 4, category: expect.objectContaining({ id: categoryId }) }),
    ]);

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-tourist-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('Ticket FLEET — estimate/create mix + random, rejects TAXI and IMMEDIATE', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);

    const cats = (await request(server).get(go('/customer/ride-categories')).expect(200)).body as {
      id: string;
      code: string;
    }[];
    const economy = cats.find((c) => c.code === 'ECONOMY')!;
    const vip = cats.find((c) => c.code === 'VIP')!;
    const taxi = cats.find((c) => c.code === 'TAXI')!;
    const scheduledAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: economy.id,
        ride_type: 'IMMEDIATE',
        service_type: 'FLEET',
        vehicles_count: 2,
        random_vehicles: true,
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(400);

    const randomEst = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: economy.id,
        ride_type: 'SCHEDULED',
        scheduled_at: scheduledAt,
        service_type: 'FLEET',
        vehicles_count: 3,
        random_vehicles: true,
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(200);
    expect(randomEst.body.service_type).toBe('FLEET');
    expect(randomEst.body.vehicles_count).toBe(3);
    expect(randomEst.body.random_vehicles).toBe(true);
    expect(randomEst.body.estimated_fare).toBeGreaterThan(0);

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: economy.id,
        ride_type: 'SCHEDULED',
        scheduled_at: scheduledAt,
        service_type: 'FLEET',
        vehicles_count: 1,
        vehicles: [{ ride_category_id: taxi.id, count: 1 }],
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(400);

    const mixEst = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: economy.id,
        ride_type: 'SCHEDULED',
        scheduled_at: scheduledAt,
        service_type: 'FLEET',
        vehicles_count: 3,
        random_vehicles: false,
        vehicles: [
          { ride_category_id: economy.id, count: 2 },
          { ride_category_id: vip.id, count: 1 },
        ],
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(200);
    expect(mixEst.body.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ride_category_id: economy.id, count: 2 }),
        expect.objectContaining({ ride_category_id: vip.id, count: 1 }),
      ]),
    );

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-fleet-${randomUUID()}`)
      .send({
        ride_category_id: economy.id,
        type: 'SCHEDULED',
        scheduled_at: scheduledAt,
        service_type: 'FLEET',
        vehicles_count: 3,
        random_vehicles: false,
        vehicles: [
          { ride_category_id: economy.id, count: 2 },
          { ride_category_id: vip.id, count: 1 },
        ],
        pickup: { lat: 33.5, lng: 36.3, address: 'Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Drop' },
        payment_method: 'CASH',
      })
      .expect(201);
    expect(created.body.service_code).toBe('FLEET');
    expect(created.body.vehicles_count).toBe(3);
    expect(created.body.random_vehicles).toBe(false);

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('FLEET');
    expect(detail.body.vehicles_count).toBe(3);
    expect(detail.body.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ride_category_id: economy.id, count: 2 }),
        expect.objectContaining({ ride_category_id: vip.id, count: 1 }),
      ]),
    );

    const services = (await request(server).get(go('/customer/services')).expect(200)).body as {
      code: string;
      is_available: boolean;
    }[];
    expect(services.find((s) => s.code === 'FLEET')).toMatchObject({ is_available: true });

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-fleet-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('Ticket RENTAL — estimate/create by duration, no destination, catalog available', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'RENTAL',
        scheduled_at: scheduledAt,
        duration_hours: 2,
        pickup: { lat: 33.5, lng: 36.3 },
      })
      .expect(400);

    const estimate = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'SCHEDULED',
        service_type: 'RENTAL',
        scheduled_at: scheduledAt,
        ends_at: endsAt,
        pickup: { lat: 33.5, lng: 36.3, address: 'Meet here' },
      })
      .expect(200);
    expect(estimate.body.service_type).toBe('RENTAL');
    expect(estimate.body.scheduled_at).toBeTruthy();
    expect(estimate.body.ends_at).toBeTruthy();
    expect(estimate.body.rental_ends_at).toBe(estimate.body.ends_at);
    expect(estimate.body.pricing_basis.model).toBe('DURATION');
    expect(estimate.body.estimated_fare).toBeGreaterThan(0);
    expect(estimate.body.distance_m).toBe(0);

    const byHours = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'SCHEDULED',
        service_type: 'RENTAL',
        scheduled_at: scheduledAt,
        duration_hours: 3,
        pickup: { lat: 33.5, lng: 36.3 },
      })
      .expect(200);
    expect(byHours.body.duration_hours).toBe(3);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-rental-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'SCHEDULED',
        service_type: 'RENTAL',
        scheduled_at: scheduledAt,
        duration_hours: 3,
        pickup: { lat: 33.5, lng: 36.3, address: 'Meet here' },
        payment_method: 'CASH',
        booking_for: 'SELF',
      })
      .expect(201);
    expect(created.body.service_code).toBe('RENTAL');
    expect(created.body.rental_ends_at).toBeTruthy();

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('RENTAL');
    expect(detail.body.ends_at).toBeTruthy();
    expect(detail.body.rental_ends_at).toBe(detail.body.ends_at);

    const services = (await request(server).get(go('/customer/services')).expect(200)).body as {
      code: string;
      is_available: boolean;
    }[];
    expect(services.find((s) => s.code === 'RENTAL')).toMatchObject({ is_available: true });

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-rental-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('Ticket INTERCITY — estimate/create like DAILY with distinct city ids', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);

    const cities = (await request(server).get(go('/customer/cities')).expect(200)).body.items as {
      id: string;
      name_ar: string;
      lat: number;
      lng: number;
    }[];
    const damascus = cities.find((c) => c.name_ar === 'دمشق');
    const aleppo = cities.find((c) => c.name_ar === 'حلب');
    expect(damascus && aleppo).toBeTruthy();

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'INTERCITY',
        pickup: { lat: damascus!.lat, lng: damascus!.lng },
        destination: { lat: aleppo!.lat, lng: aleppo!.lng },
        pickup_city_id: damascus!.id,
        destination_city_id: damascus!.id,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors?.[0]?.field).toBe('destination_city_id');
      });

    const estimate = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'INTERCITY',
        pickup: { lat: damascus!.lat, lng: damascus!.lng, address: 'Damascus' },
        destination: { lat: aleppo!.lat, lng: aleppo!.lng, address: 'Aleppo' },
        pickup_city_id: damascus!.id,
        destination_city_id: aleppo!.id,
      })
      .expect(200);
    expect(estimate.body.service_type).toBe('INTERCITY');
    expect(estimate.body.pickup_city_id).toBe(damascus!.id);
    expect(estimate.body.destination_city_id).toBe(aleppo!.id);
    expect(estimate.body.estimated_fare).toBeGreaterThan(0);
    expect(estimate.body.routes?.length).toBeGreaterThan(0);

    const route = estimate.body.routes[0];
    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-intercity-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        service_type: 'INTERCITY',
        pickup: { lat: damascus!.lat, lng: damascus!.lng, address: 'Damascus' },
        destination: { lat: aleppo!.lat, lng: aleppo!.lng, address: 'Aleppo' },
        pickup_city_id: damascus!.id,
        destination_city_id: aleppo!.id,
        selected_route: {
          route_id: route.route_id,
          summary: route.summary,
          distance_m: route.distance_m,
          duration_sec: route.duration_sec,
          encoded_polyline: route.encoded_polyline,
        },
        payment_method: 'CASH',
        booking_for: 'SELF',
      })
      .expect(201);
    expect(created.body.service_code).toBe('INTERCITY');

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('INTERCITY');

    const services = (await request(server).get(go('/customer/services')).expect(200)).body as {
      code: string;
      is_available: boolean;
    }[];
    expect(services.find((s) => s.code === 'INTERCITY')).toMatchObject({ is_available: true });

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-intercity-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('Ticket ACCESSIBILITY — estimate/create like DAILY with forced ACCESSIBILITY + new caps', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);

    const estimate = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'ACCESSIBILITY',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        requirements: ['WHEELCHAIR', 'PERSONAL_ASSISTANCE'],
      })
      .expect(200);
    expect(estimate.body.service_type).toBe('ACCESSIBILITY');
    expect(estimate.body.estimated_fare).toBeGreaterThan(0);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-accessibility-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        service_type: 'ACCESSIBILITY',
        pickup: { lat: 33.5, lng: 36.3, address: 'Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Drop' },
        requirements: ['WHEELCHAIR', 'PERSONAL_ASSISTANCE'],
        payment_method: 'CASH',
        booking_for: 'SELF',
      })
      .expect(201);
    expect(created.body.service_code).toBe('ACCESSIBILITY');
    const reqTypes = (created.body.requirements as { type: string }[]).map((r) => r.type).sort();
    expect(reqTypes).toEqual(['ACCESSIBILITY', 'PERSONAL_ASSISTANCE', 'WHEELCHAIR'].sort());

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('ACCESSIBILITY');

    const services = (await request(server).get(go('/customer/services')).expect(200)).body as {
      code: string;
      is_available: boolean;
    }[];
    expect(services.find((s) => s.code === 'ACCESSIBILITY')).toMatchObject({ is_available: true });

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-accessibility-cancel-${randomUUID()}`)
      .expect(200);
  });

  it('Ticket AMBULANCE — estimate/create like DAILY with AMBULANCE category only', async () => {
    const server = app.getHttpServer();
    await clearActiveCustomerRide(app, customerToken);

    const ambulanceCats = (
      await request(server).get(go('/customer/ride-categories?service_type=AMBULANCE')).expect(200)
    ).body as { id: string; code: string }[];
    expect(ambulanceCats).toHaveLength(1);
    expect(ambulanceCats[0].code).toBe('AMBULANCE');
    const ambulanceCategoryId = ambulanceCats[0].id;

    await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: categoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'AMBULANCE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors?.[0]?.field).toBe('ride_category_id');
      });

    const estimate = await request(server)
      .post(go('/customer/rides/estimate'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        ride_category_id: ambulanceCategoryId,
        ride_type: 'IMMEDIATE',
        service_type: 'AMBULANCE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(200);
    expect(estimate.body.service_type).toBe('AMBULANCE');
    expect(estimate.body.estimated_fare).toBeGreaterThan(0);

    const created = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-ambulance-${randomUUID()}`)
      .send({
        ride_category_id: ambulanceCategoryId,
        type: 'IMMEDIATE',
        service_type: 'AMBULANCE',
        pickup: { lat: 33.5, lng: 36.3, address: 'Pickup' },
        destination: { lat: 33.52, lng: 36.32, address: 'Drop' },
        payment_method: 'CASH',
        booking_for: 'SELF',
      })
      .expect(201);
    expect(created.body.service_code).toBe('AMBULANCE');

    const detail = await request(server)
      .get(go(`/customer/rides/${created.body.id}`))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.service_type).toBe('AMBULANCE');

    const services = (await request(server).get(go('/customer/services')).expect(200)).body as {
      code: string;
      is_available: boolean;
    }[];
    expect(services.find((s) => s.code === 'AMBULANCE')).toMatchObject({ is_available: true });

    await request(server)
      .post(go(`/customer/rides/${created.body.id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-ambulance-cancel-${randomUUID()}`)
      .expect(200);
  });
});


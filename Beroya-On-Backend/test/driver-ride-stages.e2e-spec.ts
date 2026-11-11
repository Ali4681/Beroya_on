import { INestApplication } from '@nestjs/common';
import { randomInt } from 'crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver ride stages enrichment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken = '';
  let driverId = '';
  let customerProfileId = '';
  let searchingRideId = '';
  let activeRideId = '';
  let categoryId = '';
  let branchId = '';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    categoryId = (await prisma.goRideCategory.findFirstOrThrow()).id;

    const driverPhone = randomPhone();
    const driverUser = await prisma.user.create({
      data: {
        phone: driverPhone,
        role: 'DRIVER',
        full_name: 'سائق المراحل',
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const driver = await prisma.goDriverProfile.create({
      data: { user_id: driverUser.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });
    driverId = driver.id;

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: driverPhone, app: 'DRIVER' }).expect(200);
    driverToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: driverPhone, app: 'DRIVER', code: CODE })
        .expect(200)
    ).body.access_token;

    const customerPhone = randomPhone();
    const customerUser = await prisma.user.create({
      data: {
        phone: customerPhone,
        role: 'CUSTOMER',
        full_name: 'عميل المراحل',
        created_at: BACKDATED,
      },
    });
    const customer = await prisma.goCustomerProfile.create({
      data: { user_id: customerUser.id, created_at: BACKDATED },
    });
    customerProfileId = customer.id;

    const searching = await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customerProfileId,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'IMMEDIATE',
        status: 'SEARCHING',
        payment_method: 'CASH',
        service_code: 'DAILY',
        pickup_lat: 33.5,
        pickup_lng: 36.3,
        pickup_address: 'المزة',
        original_destination_lat: 33.52,
        original_destination_lng: 36.32,
        original_destination_address: 'المالكي',
        estimated_fare: new Prisma.Decimal(4000),
        estimated_distance_m: 5000,
        estimated_duration_sec: 900,
        estimated_route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        incentive_percentage: new Prisma.Decimal(5),
        incentive_reason: 'DISTANCE',
        incentive_distance_pct: new Prisma.Decimal(5),
        created_at: BACKDATED,
      },
    });
    searchingRideId = searching.id;
    await prisma.goRideOffer.create({
      data: {
        ride_id: searching.id,
        driver_id: driverId,
        batch_number: 1,
        radius_m: 2000,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 120_000),
        effective_eta_sec: 300,
      },
    });

    const active = await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customerProfileId,
        driver_id: driverId,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'IMMEDIATE',
        status: 'DRIVER_EN_ROUTE',
        payment_method: 'WALLET',
        service_code: 'DAILY',
        pickup_lat: 33.5,
        pickup_lng: 36.3,
        pickup_address: 'المزة',
        original_destination_lat: 33.52,
        original_destination_lng: 36.32,
        original_destination_address: 'المالكي',
        assigned_at: new Date(),
        created_at: BACKDATED,
      },
    });
    activeRideId = active.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /driver/offers includes customer card + service/payment (no phone)', async () => {
    const res = await request(app.getHttpServer())
      .get(go('/driver/offers'))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);

    const offer = (res.body as Record<string, unknown>[]).find((o) => o.ride_id === searchingRideId);
    expect(offer).toBeTruthy();
    expect(offer!.customer).toMatchObject({
      full_name: 'عميل المراحل',
      rating_count: expect.any(Number),
    });
    expect(offer!.customer).not.toHaveProperty('phone');
    expect(offer!.service_code).toBe('DAILY');
    expect(offer!.payment_method).toBe('CASH');
    expect(offer!.payment_method_label_ar).toBe('كاش');
    expect(offer!.estimated_route_polyline).toBeTruthy();
    expect(offer!.has_bonus).toBe(true);
    expect(offer!.bonus).toMatchObject({ percentage: expect.any(Number) });
    expect((offer!.ride as { destination: unknown }).destination).toMatchObject({ address: 'المالكي' });
  });

  it('GET /driver/rides/active returns unified customer card + waiting + pickup nav fields', async () => {
    await prisma.goDriverState.upsert({
      where: { driver_id: driverId },
      create: {
        driver_id: driverId,
        availability: 'BUSY',
        last_lat: 33.49,
        last_lng: 36.29,
        last_location_at: new Date(),
        current_ride_id: activeRideId,
      },
      update: {
        last_lat: 33.49,
        last_lng: 36.29,
        last_location_at: new Date(),
        current_ride_id: activeRideId,
      },
    });

    const active = await request(app.getHttpServer())
      .get(go('/driver/rides/active'))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);

    expect(active.body.id).toBe(activeRideId);
    expect(active.body.customer).toMatchObject({
      full_name: 'عميل المراحل',
      phone: expect.stringMatching(/^\+/),
      call_url: expect.stringMatching(/^tel:\+/),
      rating_count: expect.any(Number),
    });
    expect(active.body.free_waiting_sec).toBe(120);
    expect(active.body.no_show_after_arrived_sec).toBe(600);
    expect(active.body.no_show_eligible_at).toBeNull();
    expect(active.body.payment_method).toBe('WALLET');
    expect(active.body.payment_method_label_ar).toBe('محفظة');
    expect(active.body).toHaveProperty('pickup_eta_sec');
    expect(active.body).toHaveProperty('pickup_route_polyline');
    expect(active.body).toHaveProperty('pickup_distance_m');

    await prisma.goRide.update({
      where: { id: activeRideId },
      data: { status: 'ARRIVED', arrived_at: new Date('2026-10-05T10:00:00.000Z') },
    });

    const arrived = await request(app.getHttpServer())
      .get(go('/driver/rides/active'))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);
    expect(arrived.body.no_show_eligible_at).toBe('2026-10-05T10:10:00.000Z');
  });
});

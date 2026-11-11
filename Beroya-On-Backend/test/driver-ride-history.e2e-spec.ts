import { INestApplication } from '@nestjs/common';
import { randomInt } from 'crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver ride history list (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken = '';
  let pastRideId = '';
  let currentRideId = '';
  let scheduledRideId = '';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);

    const branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    const categoryId = (await prisma.goRideCategory.findFirstOrThrow()).id;
    const driverPhone = randomPhone();

    const driverUser = await prisma.user.create({
      data: {
        phone: driverPhone,
        role: 'DRIVER',
        full_name: 'سائق السجل',
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const driver = await prisma.goDriverProfile.create({
      data: { user_id: driverUser.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });

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
        full_name: 'عميل السجل',
        created_at: BACKDATED,
      },
    });
    const customer = await prisma.goCustomerProfile.create({
      data: { user_id: customerUser.id, created_at: BACKDATED },
    });

    const past = await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customer.id,
        driver_id: driver.id,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'IMMEDIATE',
        status: 'COMPLETED',
        payment_method: 'CASH',
        pickup_lat: 33.5,
        pickup_lng: 36.3,
        pickup_address: 'المزة، دمشق',
        original_destination_lat: 33.52,
        original_destination_lng: 36.32,
        original_destination_address: 'المالكي',
        estimated_fare: new Prisma.Decimal(4800),
        gross_final_fare: new Prisma.Decimal(5000),
        customer_payable: new Prisma.Decimal(5000),
        completed_at: new Date('2025-10-05T07:25:00Z'),
        created_at: BACKDATED,
      },
    });
    pastRideId = past.id;

    const current = await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customer.id,
        driver_id: driver.id,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'IMMEDIATE',
        status: 'DRIVER_EN_ROUTE',
        payment_method: 'CASH',
        pickup_lat: 33.5,
        pickup_lng: 36.3,
        pickup_address: 'أبو رمانة',
        original_destination_lat: 33.52,
        original_destination_lng: 36.32,
        original_destination_address: 'الشعلان',
        estimated_fare: new Prisma.Decimal(3500),
        assigned_at: new Date(),
        created_at: new Date(),
      },
    });
    currentRideId = current.id;

    const scheduled = await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customer.id,
        driver_id: driver.id,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'SCHEDULED',
        status: 'DRIVER_ASSIGNED',
        payment_method: 'CASH',
        pickup_lat: 33.51,
        pickup_lng: 36.31,
        pickup_address: 'كفرسوسة',
        original_destination_lat: 33.53,
        original_destination_lng: 36.33,
        original_destination_address: 'المزة فيلات',
        estimated_fare: new Prisma.Decimal(4000),
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
        assigned_at: new Date(),
        created_at: new Date(),
      },
    });
    scheduledRideId = scheduled.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /driver/rides?scope=past returns card fields + flat customer', async () => {
    const res = await request(app.getHttpServer())
      .get(go('/driver/rides'))
      .query({ scope: 'past', page: 1, limit: 20 })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      page: 1,
      limit: 20,
      has_more: false,
    });
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const item = res.body.items.find((r: { id: string }) => r.id === pastRideId);
    expect(item).toMatchObject({
      id: pastRideId,
      status: 'COMPLETED',
      pickup_address: 'المزة، دمشق',
      original_destination_address: 'المالكي',
      public_number: expect.any(String),
      display_code: expect.stringMatching(/^TRP-\d{4}$/),
    });
    expect(Number(item.gross_final_fare)).toBe(5000);
    expect(Number(item.estimated_fare)).toBe(4800);
    expect(item.completed_at).toBeTruthy();
    expect(item.customer).toMatchObject({
      full_name: 'عميل السجل',
      rating_count: expect.any(Number),
    });
    expect(item.customer).toHaveProperty('avatar_url');
    expect(item.customer).not.toHaveProperty('user');
    expect(item.online_before_minutes).toBeUndefined();
  });

  it('GET /driver/rides?scope=current lists live rides', async () => {
    const res = await request(app.getHttpServer())
      .get(go('/driver/rides'))
      .query({ scope: 'current' })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const ids = res.body.items.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([currentRideId, scheduledRideId]));
    expect(ids).not.toContain(pastRideId);

    const live = res.body.items.find((r: { id: string }) => r.id === currentRideId);
    expect(live.customer.full_name).toBe('عميل السجل');
    expect(live.status).toBe('DRIVER_EN_ROUTE');
  });

  it('GET /driver/scheduled-rides returns enriched customer card', async () => {
    const res = await request(app.getHttpServer())
      .get(go('/driver/scheduled-rides'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const hit = res.body.find((r: { id: string }) => r.id === scheduledRideId);
    expect(hit).toBeTruthy();
    expect(hit.customer).toMatchObject({ full_name: 'عميل السجل' });
    expect(hit.customer).not.toHaveProperty('user');
    expect(hit).toHaveProperty('payment_method_label_ar');
    expect(hit.display_code).toMatch(/^TRP-\d{4}$/);
    expect(hit.online_before_minutes).toBe(30);
  });

  it('does not treat list path as :rideId', async () => {
    await request(app.getHttpServer())
      .get(go('/driver/rides'))
      .query({ scope: 'past' })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
  });
});

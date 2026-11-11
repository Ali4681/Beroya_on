import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver invoice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken = '';
  let customerToken = '';
  let rideId = '';

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
        full_name: 'سائق الفاتورة',
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const driver = await prisma.goDriverProfile.create({
      data: { user_id: driverUser.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });
    const wallet = await prisma.goDriverWallet.create({
      data: { driver_id: driver.id, balance: new Prisma.Decimal(100000) },
    });

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: driverPhone, app: 'DRIVER' }).expect(200);
    driverToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: driverPhone, app: 'DRIVER', code: CODE })
        .expect(200)
    ).body.access_token;

    const customerPhone = randomPhone();
    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: customerPhone, app: 'CUSTOMER' })
      .expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: customerPhone, app: 'CUSTOMER', code: CODE })
        .expect(200)
    ).body.access_token;
    const customerUser = await prisma.user.update({
      where: { phone_role: { phone: customerPhone, role: 'CUSTOMER' } },
      data: { full_name: 'خالد العلي' },
    });
    const customer = await prisma.goCustomerProfile.findUniqueOrThrow({ where: { user_id: customerUser.id } });

    const ride = await prisma.goRide.create({
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
        gross_final_fare: new Prisma.Decimal(5000),
        discount_total: new Prisma.Decimal(500),
        customer_payable: new Prisma.Decimal(4500),
        actual_distance_m: 5000,
        actual_duration_sec: 1500,
        completed_at: new Date('2025-10-05T07:25:00Z'),
        created_at: BACKDATED,
      },
    });
    rideId = ride.id;

    await prisma.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: driver.id,
        type: 'COMMISSION_DEDUCTION',
        amount: new Prisma.Decimal(450),
        balance_before: new Prisma.Decimal(100000),
        balance_after: new Prisma.Decimal(99550),
        ride_id: ride.id,
        reason: 'commission',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /driver/rides/:id/invoice returns receipt fields', async () => {
    await request(app.getHttpServer())
      .get(go(`/driver/rides/${rideId}/invoice`))
      .set({ Authorization: `Bearer ${customerToken}` })
      .expect(403);

    const res = await request(app.getHttpServer())
      .get(go(`/driver/rides/${rideId}/invoice`))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);

    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.invoice).toMatchObject({
      gross_fare: 5000,
      customer_payable: 4500,
      discount_total: 500,
      commission_amount: 450,
      commission_deducted: 450,
      commission_status: 'SUCCESS',
      driver_earnings: 4550,
      payment_method: 'CASH',
      payment_method_label_ar: 'كاش',
      actual_distance_m: 5000,
      actual_duration_sec: 1500,
      pickup_address: 'المزة، دمشق',
      destination_address: 'المالكي',
      show_destination: true,
    });
    expect(typeof res.body.invoice.driver_earnings).toBe('number');
    expect(res.body.invoice.commission_amount).not.toBeNull();
    expect(res.body.invoice.show_destination).toBe(true);
    expect(res.body.invoice.free_waiting_sec).toBe(120);
    expect(res.body.customer).toMatchObject({
      full_name: 'خالد العلي',
      avatar_url: null,
    });
    expect(res.body.rating).toMatchObject({
      can_rate: true,
      my_rating: null,
      submit_path: `/api/v1/go/driver/rides/${rideId}/rating`,
    });
  });

  it('GET /driver/rides/:id includes invoice when COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .get(go(`/driver/rides/${rideId}`))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);
    expect(res.body.invoice.driver_earnings).toBe(4550);
    expect(res.body.driver_earnings).toBe(4550);
    expect(res.body.rating.can_rate).toBe(true);
  });

  it('POST /driver/rides/:id/rating accepts notes; invoice then can_rate false', async () => {
    const key = `ride.rating:${rideId}`;
    const body = { stars: 5, notes: 'زبون ممتاز' };

    const first = await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/rating`))
      .set({ Authorization: `Bearer ${driverToken}`, 'Idempotency-Key': key })
      .send(body)
      .expect(200);
    expect(first.body.stars).toBe(5);
    expect(first.body.notes).toBe('زبون ممتاز');

    const replay = await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/rating`))
      .set({ Authorization: `Bearer ${driverToken}`, 'Idempotency-Key': key })
      .send(body)
      .expect(200);
    expect(replay.body.id).toBe(first.body.id);

    const invoice = await request(app.getHttpServer())
      .get(go(`/driver/rides/${rideId}/invoice`))
      .set({ Authorization: `Bearer ${driverToken}` })
      .expect(200);
    expect(invoice.body.customer.full_name).toBe('خالد العلي');
    expect(invoice.body.rating).toMatchObject({
      can_rate: false,
      my_rating: { stars: 5 },
      submit_path: `/api/v1/go/driver/rides/${rideId}/rating`,
    });

    await request(app.getHttpServer())
      .post(go(`/driver/rides/${rideId}/rating`))
      .set({ Authorization: `Bearer ${driverToken}`, 'Idempotency-Key': randomUUID() })
      .send({ stars: 4 })
      .expect(409);
  });
});

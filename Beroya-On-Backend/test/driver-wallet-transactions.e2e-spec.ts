import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver wallet transactions activity feed (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken = '';
  let customerToken = '';
  let driverId = '';
  let rideId = '';
  let publicNumber = '';

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);

    const branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    const categoryId = (await prisma.goRideCategory.findFirstOrThrow()).id;
    const phone = randomPhone();

    const user = await prisma.user.create({
      data: {
        phone,
        role: 'DRIVER',
        full_name: 'سائق سجل المحفظة',
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const profile = await prisma.goDriverProfile.create({
      data: { user_id: user.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });
    driverId = profile.id;

    const wallet = await prisma.goDriverWallet.create({
      data: { driver_id: profile.id, balance: new Prisma.Decimal(50000) },
    });

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone, app: 'DRIVER' }).expect(200);
    driverToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone, app: 'DRIVER', code: CODE })
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
    const customerUser = await prisma.user.findUniqueOrThrow({
      where: { phone_role: { phone: customerPhone, role: 'CUSTOMER' } },
    });
    const customerProfile = await prisma.goCustomerProfile.findUniqueOrThrow({
      where: { user_id: customerUser.id },
    });

    publicNumber = String(randomInt(1000, 9999));
    const completedAt = new Date();
    const ride = await prisma.goRide.create({
      data: {
        public_number: publicNumber,
        customer_id: customerProfile.id,
        driver_id: profile.id,
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
        gross_final_fare: new Prisma.Decimal(4500),
        customer_payable: new Prisma.Decimal(4500),
        completed_at: completedAt,
        created_at: BACKDATED,
      },
    });
    rideId = ride.id;

    await prisma.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: profile.id,
        type: 'COMMISSION_DEDUCTION',
        amount: new Prisma.Decimal(450),
        balance_before: new Prisma.Decimal(50000),
        balance_after: new Prisma.Decimal(49550),
        ride_id: ride.id,
        reason: 'commission',
        created_at: new Date(completedAt.getTime() + 1000),
      },
    });
    await prisma.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: profile.id,
        type: 'TOP_UP',
        amount: new Prisma.Decimal(25000),
        balance_before: new Prisma.Decimal(24550),
        balance_after: new Prisma.Decimal(49550),
        reason: 'e2e top-up',
        created_at: new Date(completedAt.getTime() - 60_000),
      },
    });
    await prisma.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: profile.id,
        type: 'POS_RECHARGE',
        amount: new Prisma.Decimal(10000),
        balance_before: new Prisma.Decimal(14550),
        balance_after: new Prisma.Decimal(24550),
        reason: 'pos-recharge; store=TEST',
        created_at: new Date(completedAt.getTime() - 120_000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects non-drivers', async () => {
    await request(app.getHttpServer())
      .get(go('/driver/wallet/transactions'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('returns merged activity feed with titles and signed amounts', async () => {
    const feed = await request(app.getHttpServer())
      .get(go('/driver/wallet/transactions'))
      .query({ page: 1, limit: 20 })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(feed.body).toMatchObject({ page: 1, limit: 20, has_more: false });
    expect(feed.body.total).toBeGreaterThanOrEqual(4);

    const items = feed.body.items as Record<string, unknown>[];
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['TRIP_EARNING', 'COMMISSION_DEDUCTION', 'TOP_UP', 'POS_RECHARGE']));

    const trip = items.find((i) => i.kind === 'TRIP_EARNING' && i.ride_id === rideId)!;
    expect(trip.display_code).toMatch(/^TRP-\d{4}$/);
    expect(trip).toMatchObject({
      amount: 4500,
      signed_amount: 4500,
      public_number: publicNumber,
      pickup_label: 'المزة',
      destination_label: 'المالكي',
      title_ar: `الرحلة رقم ${trip.display_code} – من المزة إلى المالكي`,
      title_en: `Trip ${trip.display_code} – from المزة to المالكي`,
    });
    expect(JSON.stringify(trip)).not.toMatch(/\+9639/);

    const commission = items.find((i) => i.kind === 'COMMISSION_DEDUCTION' && i.ride_id === rideId)!;
    expect(commission.signed_amount).toBe(-450);
    expect(commission.display_code).toBe(trip.display_code);
    expect(commission.title_ar).toBe(`تم خصم العمولة – الرحلة رقم ${commission.display_code}`);
    expect(commission.title_en).toBe(`Commission deducted – trip ${commission.display_code}`);
    expect(commission.public_number).toBe(publicNumber);

    const topUp = items.find((i) => i.kind === 'TOP_UP')!;
    expect(topUp.title_ar).toBe('شحن المحفظة');
    expect(Number(topUp.signed_amount)).toBeGreaterThan(0);

    const pos = items.find((i) => i.kind === 'POS_RECHARGE')!;
    expect(pos.title_ar).toBe('شحن المحفظة');

    const times = items.map((i) => new Date(String(i.created_at)).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('paginates newest-first across trip + ledger sources', async () => {
    const page1 = await request(app.getHttpServer())
      .get(go('/driver/wallet/transactions'))
      .query({ page: 1, limit: 2 })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.has_more).toBe(true);

    const page2 = await request(app.getHttpServer())
      .get(go('/driver/wallet/transactions'))
      .query({ page: 2, limit: 2 })
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(page2.body.items.length).toBeGreaterThan(0);

    const ids = [
      ...(page1.body.items as { id: string }[]).map((i) => i.id),
      ...(page2.body.items as { id: string }[]).map((i) => i.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

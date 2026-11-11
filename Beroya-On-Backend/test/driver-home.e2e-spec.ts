import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver home — account / inbox / language / support (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let branchId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeDriver(phone: string, fullName = 'سائق الرئيسية') {
    const user = await prisma.user.create({
      data: {
        phone,
        role: 'DRIVER',
        full_name: fullName,
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const profile = await prisma.goDriverProfile.create({
      data: { user_id: user.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });
    return { userId: user.id, profileId: profile.id, phone };
  }

  async function login(phone: string) {
    const server = app.getHttpServer();
    await prisma.goOtpRequest.deleteMany({ where: { phone } });
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'DRIVER' }).expect(200);
    const res = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: 'DRIVER', code: CODE })
      .expect(200);
    return {
      Authorization: `Bearer ${res.body.access_token}` as string,
      userId: res.body.user.id as string,
    };
  }

  it('PATCH preferred_language with Idempotency-Key; rejects invalid; replays same key', async () => {
    const phone = randomPhone();
    await makeDriver(phone);
    const auth = await login(phone);
    const key = randomUUID();

    const meBefore = await request(app.getHttpServer()).get(go('/auth/me')).set(auth).expect(200);
    expect(meBefore.body.preferred_language).toBe('AR');

    const missingKey = await request(app.getHttpServer())
      .patch(go('/driver/profile'))
      .set(auth)
      .send({ preferred_language: 'EN' })
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const bad = await request(app.getHttpServer())
      .patch(go('/driver/profile'))
      .set(auth)
      .set({ 'Idempotency-Key': randomUUID() })
      .send({ preferred_language: 'FR' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(bad.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'preferred_language',
          messages: expect.arrayContaining([expect.stringMatching(/must be AR or EN/i)]),
        }),
      ]),
    );

    const updated = await request(app.getHttpServer())
      .patch(go('/driver/profile'))
      .set(auth)
      .set({ 'Idempotency-Key': key })
      .send({ preferred_language: 'EN' })
      .expect(200);
    expect(updated.body.preferred_language).toBe('EN');

    const replay = await request(app.getHttpServer())
      .patch(go('/driver/profile'))
      .set(auth)
      .set({ 'Idempotency-Key': key })
      .send({ preferred_language: 'EN' })
      .expect(200);
    expect(replay.body.preferred_language).toBe('EN');

    const me = await request(app.getHttpServer()).get(go('/auth/me')).set(auth).expect(200);
    expect(me.body.preferred_language).toBe('EN');
  });

  it('lists empty inbox, then broadcast DRIVERS + mark-read', async () => {
    const phone = randomPhone();
    await makeDriver(phone);
    const auth = await login(phone);

    const empty = await request(app.getHttpServer()).get(go('/driver/notifications')).set(auth).expect(200);
    expect(empty.body).toMatchObject({
      items: [],
      unread_count: 0,
      page: 1,
      has_more: false,
    });

    await request(app.getHttpServer())
      .post(go('/admin/notifications'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ audience: 'DRIVERS', title: 'تنبيه السائقين', body: 'تحديث على التطبيق' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(go('/driver/notifications'))
      .query({ page: 1, limit: 20 })
      .set(auth)
      .expect(200);
    expect(list.body.unread_count).toBeGreaterThanOrEqual(1);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const top = list.body.items[0];
    expect(top).toMatchObject({
      id: expect.any(String),
      event: 'notification.message',
      type: 'notification.message',
      category: 'SYSTEM',
      title: 'تنبيه السائقين',
      body: 'تحديث على التطبيق',
      read_at: null,
      created_at: expect.any(String),
    });
    expect(top).toHaveProperty('data');
    expect(top).toHaveProperty('payload');

    await request(app.getHttpServer())
      .post(go('/driver/notifications/read'))
      .set(auth)
      .send({ up_to_id: randomUUID() })
      .expect(404);

    const marked = await request(app.getHttpServer())
      .post(go('/driver/notifications/read'))
      .set(auth)
      .send({ up_to_id: top.id })
      .expect(200);
    expect(marked.body.unread_count).toBe(0);
    expect(marked.body.marked).toBeGreaterThanOrEqual(1);
  });

  it('creates and lists driver support messages', async () => {
    const phone = randomPhone();
    await makeDriver(phone, 'سائق الدعم');
    const auth = await login(phone);
    const key = randomUUID();

    const created = await request(app.getHttpServer())
      .post(go('/driver/support/messages'))
      .set(auth)
      .set({ 'Idempotency-Key': key })
      .send({
        full_name: 'سائق الدعم',
        phone,
        message: 'أحتاج مساعدة بخصوص المحفظة والعمولة',
      })
      .expect(201);
    expect(created.body.reference).toMatch(/^SUP-/);

    const list = await request(app.getHttpServer()).get(go('/driver/support/messages')).set(auth).expect(200);
    expect(list.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);
  });

  it('soft-deletes the account, frees the phone, and blocks active rides', async () => {
    const phone = randomPhone();
    const { profileId } = await makeDriver(phone);
    const auth = await login(phone);

    const customer = await prisma.user.create({
      data: { phone: randomPhone(), role: 'CUSTOMER', full_name: 'زبون اختبار', created_at: BACKDATED },
    });
    const customerProfile = await prisma.goCustomerProfile.create({
      data: { user_id: customer.id, created_at: BACKDATED },
    });
    const categoryId = (await prisma.goRideCategory.findFirstOrThrow()).id;
    await prisma.goRide.create({
      data: {
        public_number: String(randomInt(10000, 99999)),
        customer_id: customerProfile.id,
        driver_id: profileId,
        ride_category_id: categoryId,
        branch_id: branchId,
        type: 'IMMEDIATE',
        status: 'DRIVER_EN_ROUTE',
        payment_method: 'CASH',
        pickup_lat: 33.5,
        pickup_lng: 36.3,
        pickup_address: 'المزة',
        original_destination_lat: 33.52,
        original_destination_lng: 36.32,
        original_destination_address: 'المالكي',
        created_at: BACKDATED,
      },
    });

    const blocked = await request(app.getHttpServer())
      .delete(go('/driver/account'))
      .set(auth)
      .set({ 'Idempotency-Key': randomUUID() })
      .expect(409);
    expect(blocked.body.code).toBe('ACTIVE_RIDE_EXISTS');

    await prisma.goRide.updateMany({
      where: { driver_id: profileId, status: 'DRIVER_EN_ROUTE' },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    const deleted = await request(app.getHttpServer())
      .delete(go('/driver/account'))
      .set(auth)
      .set({ 'Idempotency-Key': randomUUID() })
      .expect(200);
    expect(deleted.body).toMatchObject({ ok: true });
    expect(deleted.body.deleted_at).toBeTruthy();

    await request(app.getHttpServer()).get(go('/driver/profile')).set(auth).expect(401);

    const user = await prisma.user.findFirst({
      where: { id: auth.userId },
      select: { phone: true, is_active: true, deleted_at: true },
    });
    expect(user?.phone).toBeNull();
    expect(user?.is_active).toBe(false);
    expect(user?.deleted_at).toBeTruthy();

    const otp = await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone, app: 'DRIVER' })
      .expect(404);
    expect(otp.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('requires Idempotency-Key for DELETE /driver/account', async () => {
    const phone = randomPhone();
    await makeDriver(phone);
    const auth = await login(phone);
    const res = await request(app.getHttpServer()).delete(go('/driver/account')).set(auth).expect(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

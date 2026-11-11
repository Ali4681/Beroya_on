import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Customer account delete (e2e) — Ticket §27', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminAuth: { Authorization: string };
  const phoneA = `+9639555${String(Date.now()).slice(-6)}`;
  const phoneB = `+9639556${String(Date.now()).slice(-6)}`;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const server = app.getHttpServer();
    const admin = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminAuth = { Authorization: `Bearer ${admin.body.access_token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginCustomer(phone: string) {
    const server = app.getHttpServer();
    await prisma.goOtpRequest.deleteMany({ where: { phone } });
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    return { Authorization: `Bearer ${login.body.access_token}` as string, userId: login.body.user.id as string };
  }

  it('soft-deletes the account, frees the phone, and hides from ERP list', async () => {
    const auth = await loginCustomer(phoneA);
    const key = randomUUID();

    const deleted = await request(app.getHttpServer())
      .delete(go('/customer/account'))
      .set(auth)
      .set({ 'Idempotency-Key': key })
      .expect(200);
    expect(deleted.body).toMatchObject({ ok: true });
    expect(deleted.body.deleted_at).toBeTruthy();

    await request(app.getHttpServer()).get(go('/customer/profile')).set(auth).expect(401);

    const again = await loginCustomer(phoneA);
    expect(again.userId).not.toBe(auth.userId);
    const profile = await request(app.getHttpServer()).get(go('/customer/profile')).set(again).expect(200);
    expect(profile.body.phone).toBe(phoneA);

    const erpHidden = await request(app.getHttpServer()).get(go('/erp/customers')).set(adminAuth).expect(200);
    expect(erpHidden.body.every((c: { user: { deleted_at: string | null } }) => c.user.deleted_at == null)).toBe(
      true,
    );

    const erpAll = await request(app.getHttpServer())
      .get(go('/erp/customers?include_deleted=true'))
      .set(adminAuth)
      .expect(200);
    expect(erpAll.body.some((c: { user: { deleted_at: string | null } }) => c.user.deleted_at != null)).toBe(true);
  });

  it('requires Idempotency-Key', async () => {
    const auth = await loginCustomer(phoneB);
    const res = await request(app.getHttpServer()).delete(go('/customer/account')).set(auth).expect(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

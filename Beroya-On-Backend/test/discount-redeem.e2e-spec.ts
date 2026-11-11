import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Discount code redeem (e2e) — Ticket §23', () => {
  let app: INestApplication;
  let adminAuth: { Authorization: string };
  let customerAuth: { Authorization: string };
  const created: string[] = [];
  const suffix = Date.now().toString(36).toUpperCase();

  const createCode = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/discount-codes'))
      .set(adminAuth)
      .send({
        name: 'E2E secret promo',
        percentage: 15,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        usage_limit: 50,
        audience: 'ALL',
        listed: false,
        ...body,
      })
      .expect(201);
    created.push(res.body.id);
    return res.body as { id: string; code: string; listed: boolean; usage_count: number };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    const server = app.getHttpServer();
    const admin = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminAuth = { Authorization: `Bearer ${admin.body.access_token}` };

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500023', app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500023', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    customerAuth = { Authorization: `Bearer ${login.body.access_token}` };
  });

  afterAll(async () => {
    for (const id of created) {
      await request(app.getHttpServer()).delete(go(`/admin/discount-codes/${id}`)).set(adminAuth);
    }
    await app.close();
  });

  it('hides unlisted codes until redeem, then lists them with redeemed_at; idempotent', async () => {
    const secret = await createCode({ code: `SECRET${suffix}` });
    expect(secret.listed).toBe(false);

    const before = await request(app.getHttpServer())
      .get(go('/customer/discount-codes'))
      .set(customerAuth)
      .expect(200);
    expect(before.body.some((c: { id: string }) => c.id === secret.id)).toBe(false);

    const redeemed = await request(app.getHttpServer())
      .post(go('/customer/discount-codes/redeem'))
      .set(customerAuth)
      .send({ code: secret.code.toLowerCase() })
      .expect(200);
    expect(redeemed.body).toMatchObject({
      id: secret.id,
      code: secret.code,
      percentage: 15,
    });
    expect(redeemed.body.redeemed_at).toBeTruthy();
    expect(secret.usage_count ?? 0).toBe(0);

    const again = await request(app.getHttpServer())
      .post(go('/customer/discount-codes/redeem'))
      .set(customerAuth)
      .send({ code: secret.code })
      .expect(200);
    expect(again.body.redeemed_at).toBe(redeemed.body.redeemed_at);

    const listed = await createCode({ code: `LISTED${suffix}`, listed: true, name: 'Listed promo' });
    const mine = await request(app.getHttpServer())
      .get(go('/customer/discount-codes'))
      .set(customerAuth)
      .expect(200);
    const ids = mine.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(secret.id);
    expect(ids).toContain(listed.id);
    expect(ids.indexOf(secret.id)).toBeLessThan(ids.indexOf(listed.id));
    const secretRow = mine.body.find((c: { id: string }) => c.id === secret.id);
    expect(secretRow.redeemed_at).toBeTruthy();
    const listedRow = mine.body.find((c: { id: string }) => c.id === listed.id);
    expect(listedRow.redeemed_at).toBeNull();
  });

  it('rejects empty / unknown / expired codes with the documented codes', async () => {
    await request(app.getHttpServer())
      .post(go('/customer/discount-codes/redeem'))
      .set(customerAuth)
      .send({ code: '' })
      .expect(400);

    const bad = await request(app.getHttpServer())
      .post(go('/customer/discount-codes/redeem'))
      .set(customerAuth)
      .send({ code: `NOPE${suffix}` })
      .expect(422);
    expect(bad.body.code).toBe('DISCOUNT_CODE_INVALID');

    const expired = await createCode({
      code: `OLD${suffix}`,
      valid_from: new Date(Date.now() - 172_800_000).toISOString(),
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const expiredRes = await request(app.getHttpServer())
      .post(go('/customer/discount-codes/redeem'))
      .set(customerAuth)
      .send({ code: expired.code })
      .expect(422);
    expect(expiredRes.body.code).toBe('DISCOUNT_CODE_EXPIRED');
  });
});

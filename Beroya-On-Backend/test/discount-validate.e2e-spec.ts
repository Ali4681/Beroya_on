import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

const PICKUP = { lat: 33.5, lng: 36.3 };
const DESTINATION = { lat: 33.52, lng: 36.32 };

describe('Discount code validation (e2e)', () => {
  let app: INestApplication;
  let adminAuth: { Authorization: string };
  let customerAuth: { Authorization: string };
  let economyId: string;
  let vipId: string;
  const created: string[] = [];
  const suffix = Date.now().toString(36).toUpperCase();

  const createCode = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/discount-codes'))
      .set(adminAuth)
      .send({
        name: 'E2E public code',
        percentage: 10,
        maximum_discount_amount: 2000,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        usage_limit: 5,
        audience: 'ALL',
        ...body,
      })
      .expect(201);
    created.push(res.body.id);
    return res.body as { id: string; code: string };
  };

  const validate = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(go('/customer/discount-codes/validate')).set(customerAuth).send(body);

  beforeAll(async () => {
    app = await createE2eApp();
    const server = app.getHttpServer();
    const admin = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminAuth = { Authorization: `Bearer ${admin.body.access_token}` };

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500006', app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500006', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    customerAuth = { Authorization: `Bearer ${login.body.access_token}` };

    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    economyId = cats.body.find((c: { code: string }) => c.code === 'ECONOMY').id;
    vipId = cats.body.find((c: { code: string }) => c.code === 'VIP').id;
  });

  afterAll(async () => {
    for (const id of created) {
      await request(app.getHttpServer()).delete(go(`/admin/discount-codes/${id}`)).set(adminAuth);
    }
    await app.close();
  });

  it('accepts a public code not linked to the customer and prices it on the server', async () => {
    const code = await createCode({ code: `E2EPUB${suffix}`, ride_category_ids: [economyId], scheduled_allowed: false });

    const ok = await validate({
      code: code.code.toLowerCase(),
      ride_category_id: economyId,
      ride_type: 'IMMEDIATE',
      estimated_fare: 5000,
    }).expect(200);
    expect(ok.body).toMatchObject({
      discount_code_id: code.id,
      code: code.code,
      percentage: 10,
      maximum_discount_amount: 2000,
      discount_amount: 500,
      final_fare: 4500,
    });

    const capped = await validate({
      code: code.code,
      ride_category_id: economyId,
      ride_type: 'IMMEDIATE',
      estimated_fare: 50000,
    }).expect(200);
    expect(capped.body.discount_amount).toBe(2000);
    expect(capped.body.final_fare).toBe(48000);

    const noFare = await validate({ code: code.code, ride_category_id: economyId, ride_type: 'IMMEDIATE' }).expect(200);
    expect(noFare.body.discount_amount).toBeNull();
    expect(noFare.body.final_fare).toBeNull();

    const wrongCategory = await validate({ code: code.code, ride_category_id: vipId, ride_type: 'IMMEDIATE' }).expect(422);
    expect(wrongCategory.body.code).toBe('DISCOUNT_CODE_NOT_ALLOWED_FOR_CATEGORY');

    const wrongType = await validate({ code: code.code, ride_category_id: economyId, ride_type: 'SCHEDULED' }).expect(422);
    expect(wrongType.body.code).toBe('DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE');
  });

  it('rejects unknown, expired and other-customer codes', async () => {
    const unknown = await validate({ code: `NOPE${suffix}`, ride_category_id: economyId, ride_type: 'IMMEDIATE' }).expect(422);
    expect(unknown.body.code).toBe('DISCOUNT_CODE_INVALID');

    const expired = await createCode({
      code: `E2EEXP${suffix}`,
      valid_from: new Date(Date.now() - 86_400_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const expiredRes = await validate({ code: expired.code, ride_category_id: economyId, ride_type: 'IMMEDIATE' }).expect(422);
    expect(expiredRes.body.code).toBe('DISCOUNT_CODE_EXPIRED');

    const customers = await request(app.getHttpServer()).get(go('/erp/customers')).set(adminAuth).expect(200);
    const other = customers.body.find((c: { user: { phone: string } }) => c.user.phone !== '+963955500006');
    const personal = await createCode({ code: `E2EPRV${suffix}`, audience: 'CUSTOMERS', customer_ids: [other.id] });
    const res = await validate({ code: personal.code, ride_category_id: economyId, ride_type: 'IMMEDIATE' }).expect(422);
    expect(res.body.code).toBe('DISCOUNT_CODE_INVALID');

    await validate({ code: '', ride_category_id: economyId, ride_type: 'IMMEDIATE' }).expect(400);
  });

  it('estimate with discount_code returns discount_amount and final_fare per route', async () => {
    const code = await createCode({ code: `E2EEST${suffix}` });
    const server = app.getHttpServer();
    const body = { ride_category_id: economyId, ride_type: 'IMMEDIATE', pickup: PICKUP, destination: DESTINATION };

    const plain = await request(server).post(go('/customer/rides/estimate')).set(customerAuth).send(body).expect(200);
    expect(plain.body.discount).toBeNull();
    expect(plain.body.discount_amount).toBe(0);
    expect(plain.body.final_fare).toBe(plain.body.estimated_fare);

    const discounted = await request(server)
      .post(go('/customer/rides/estimate'))
      .set(customerAuth)
      .send({ ...body, discount_code: code.code.toLowerCase() })
      .expect(200);
    expect(discounted.body.discount.discount_code_id).toBe(code.id);
    expect(discounted.body.routes.length).toBeGreaterThan(0);
    for (const route of discounted.body.routes) {
      expect(route.discount_amount).toBeGreaterThan(0);
      expect(route.final_fare).toBe(route.estimated_fare - route.discount_amount);
    }
    expect(discounted.body.final_fare).toBe(discounted.body.routes[0].final_fare);

    const bad = await request(server)
      .post(go('/customer/rides/estimate'))
      .set(customerAuth)
      .send({ ...body, discount_code: `NOPE${suffix}` })
      .expect(422);
    expect(bad.body.code).toBe('DISCOUNT_CODE_INVALID');
  });
});

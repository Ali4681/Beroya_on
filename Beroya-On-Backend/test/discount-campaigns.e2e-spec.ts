import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { createE2eApp, go } from './helpers/e2e-app';

const DAMASCUS_PICKUP = { lat: 33.5, lng: 36.3 };
const DAMASCUS_DEST = { lat: 33.52, lng: 36.32 };
const ALEPPO_PICKUP = { lat: 36.2, lng: 37.15 };
const VENUE = {
  type: 'Polygon',
  coordinates: [[[36.31, 33.51], [36.33, 33.51], [36.33, 33.53], [36.31, 33.53], [36.31, 33.51]]],
};

describe('Discount campaigns: first N people, new users, governorate, event (e2e)', () => {
  let app: INestApplication;
  let adminAuth: { Authorization: string };
  let firstAuth: { Authorization: string };
  let lateAuth: { Authorization: string };
  let economyId: string;
  let branches: { id: string; code: string }[];
  const created: string[] = [];
  const suffix = Date.now().toString(36).toUpperCase();

  const login = async (phone: string) => {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const res = await request(server).post(go('/auth/otp/verify')).send({ phone, app: 'CUSTOMER', code: '123456' }).expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  const createCode = async (body: Record<string, unknown>, status = 201) => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/discount-codes'))
      .set(adminAuth)
      .send({
        name: 'E2E campaign',
        percentage: 10,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        audience: 'ALL',
        ...body,
      })
      .expect(status);
    if (status === 201) created.push(res.body.id);
    return res.body as { id: string; code: string; usage_limit: number };
  };

  const validate = (auth: { Authorization: string }, code: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(go('/customer/discount-codes/validate'))
      .set(auth)
      .send({ code, ride_category_id: economyId, ride_type: 'IMMEDIATE', ...extra });

  beforeAll(async () => {
    app = await createE2eApp();
    const server = app.getHttpServer();
    const admin = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminAuth = { Authorization: `Bearer ${admin.body.access_token}` };
    const stamp = String(Date.now()).slice(-7);
    firstAuth = await login(`+96394${stamp}`);
    lateAuth = await login(`+96393${stamp}`);
    await clearActiveCustomerRide(app, firstAuth.Authorization.slice(7));

    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    economyId = cats.body.find((c: { code: string }) => c.code === 'ECONOMY').id;
    const list = await request(server).get(go('/erp/branches')).set(adminAuth).expect(200);
    branches = list.body;
  });

  afterAll(async () => {
    await clearActiveCustomerRide(app, firstAuth.Authorization.slice(7));
    for (const id of created) {
      await request(app.getHttpServer()).delete(go(`/admin/discount-codes/${id}`)).set(adminAuth);
    }
    await app.close();
  });

  it('first N people: the next customer is told the offer has ended, and a cancelled ride frees the slot', async () => {
    const code = await createCode({ code: `E2EFIRST${suffix}`, max_customers: 1, per_customer_limit: 1 });
    expect(code.usage_limit).toBe(1);

    await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set(firstAuth)
      .set('Idempotency-Key', `e2e-first-${randomUUID()}`)
      .send({
        ride_category_id: economyId,
        type: 'IMMEDIATE',
        pickup: DAMASCUS_PICKUP,
        destination: DAMASCUS_DEST,
        discount_code_id: code.id,
      })
      .expect(201);

    const late = await validate(lateAuth, code.code).expect(422);
    expect(late.body).toMatchObject({ code: 'DISCOUNT_CODE_EXPIRED', message: 'انتهت المدة', reason: 'CUSTOMER_LIMIT_REACHED' });

    const again = await validate(firstAuth, code.code).expect(422);
    expect(again.body).toMatchObject({ code: 'DISCOUNT_CODE_USAGE_EXHAUSTED', reason: 'PER_CUSTOMER_LIMIT_REACHED' });

    const detail = await request(app.getHttpServer()).get(go(`/admin/discount-codes/${code.id}`)).set(adminAuth).expect(200);
    expect(detail.body.customers_count).toBe(1);

    await clearActiveCustomerRide(app, firstAuth.Authorization.slice(7));
    await validate(lateAuth, code.code).expect(200);
  });

  it('new users only: accepted without completed rides, rejected with one', async () => {
    const code = await createCode({ code: `E2ENEW${suffix}`, usage_limit: 100, new_users_only: true });
    await validate(lateAuth, code.code).expect(200);
    const mine = await request(app.getHttpServer()).get(go('/customer/discount-codes')).set(lateAuth).expect(200);
    expect(mine.body.some((c: { code: string }) => c.code === code.code)).toBe(true);

    // Seeded customer Layla has completed rides.
    const layla = await login('+963911111112');
    const rejected = await validate(layla, code.code).expect(422);
    expect(rejected.body).toMatchObject({ code: 'DISCOUNT_CODE_NEW_USERS_ONLY', message: 'هذا الكود للمستخدمين الجدد فقط' });
    const hers = await request(app.getHttpServer()).get(go('/customer/discount-codes')).set(layla).expect(200);
    expect(hers.body.some((c: { code: string }) => c.code === code.code)).toBe(false);
  });

  it('governorate: only pickups inside the branch area are accepted', async () => {
    const aleppo = branches.find((b) => b.code === 'ALEPPO')!;
    const code = await createCode({ code: `E2EGOV${suffix}`, usage_limit: 100, branch_id: aleppo.id });

    const wrong = await validate(lateAuth, code.code, { pickup: DAMASCUS_PICKUP }).expect(422);
    expect(wrong.body).toMatchObject({ code: 'DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA', reason: 'BRANCH' });
    await validate(lateAuth, code.code, { pickup: ALEPPO_PICKUP }).expect(200);

    const estimate = await request(app.getHttpServer())
      .post(go('/customer/rides/estimate'))
      .set(lateAuth)
      .send({ ride_category_id: economyId, ride_type: 'IMMEDIATE', pickup: DAMASCUS_PICKUP, destination: DAMASCUS_DEST, discount_code: code.code })
      .expect(422);
    expect(estimate.body.code).toBe('DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA');
  });

  it('event: rides to or from the venue are accepted, others are not', async () => {
    await createCode({ code: `E2EEVX${suffix}`, usage_limit: 100, event_name: 'معرض' }, 400);
    const code = await createCode({ code: `E2EEV${suffix}`, usage_limit: 100, event_name: 'معرض دمشق الدولي', event_area: VENUE });

    const far = { lat: 33.45, lng: 36.25 };
    await validate(lateAuth, code.code, { pickup: far, destination: DAMASCUS_DEST }).expect(200);
    const away = await validate(lateAuth, code.code, { pickup: far, destination: { lat: 33.46, lng: 36.26 } }).expect(422);
    expect(away.body).toMatchObject({ code: 'DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA', reason: 'EVENT' });
  });
});

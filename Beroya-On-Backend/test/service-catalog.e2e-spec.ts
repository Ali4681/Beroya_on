import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type Service = {
  code: string;
  name_ar: string;
  image_url: string | null;
  is_available: boolean;
  is_visible: boolean;
  sort_order: number;
  promotion_label_ar: string | null;
  promotion_percentage: number | null;
  promotion_expires_at: string | null;
  active_discount_codes: number;
  offer: null | { type: string; percentage: number | null; label_ar: string; discount_code_id: string | null; code: string | null };
};

describe('Service catalog and per-customer offers (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let customer: { Authorization: string };
  let original: Service[];
  const codeIds: string[] = [];
  const suffix = Date.now().toString(36).toUpperCase();

  const byCode = (list: Service[], code: string) => list.find((s) => s.code === code)!;
  const customerList = async (auth?: { Authorization: string }) =>
    (await request(app.getHttpServer()).get(go('/customer/services')).set(auth ?? {}).expect(200)).body as Service[];
  const patch = (code: string, body: Record<string, unknown>, status = 200) =>
    request(app.getHttpServer()).patch(go(`/admin/services/${code}`)).set(admin).send(body).expect(status);
  const createCode = async (body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/discount-codes'))
      .set(admin)
      .send({
        name: 'E2E service offer',
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        audience: 'ALL',
        ...body,
      })
      .expect(201);
    codeIds.push(res.body.id);
    return res.body as { id: string; code: string };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    const server = app.getHttpServer();
    const login = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    admin = { Authorization: `Bearer ${login.body.access_token}` };
    const phone = `+96395550${String(Date.now()).slice(-4)}`;
    await request(server).post(go('/auth/otp/request')).send({ phone, app: 'CUSTOMER' }).expect(200);
    const otp = await request(server).post(go('/auth/otp/verify')).send({ phone, app: 'CUSTOMER', code: '123456' }).expect(200);
    customer = { Authorization: `Bearer ${otp.body.access_token}` };
    original = (await request(server).get(go('/admin/services')).set(admin).expect(200)).body;
  });

  afterAll(async () => {
    const server = app.getHttpServer();
    for (const id of codeIds) await request(server).delete(go(`/admin/discount-codes/${id}`)).set(admin);
    for (const s of original ?? []) {
      await request(server)
        .patch(go(`/admin/services/${s.code}`))
        .set(admin)
        .send({
          is_available: s.is_available,
          is_visible: s.is_visible,
          sort_order: s.sort_order,
          promotion_label_ar: s.promotion_label_ar,
          promotion_percentage: s.promotion_percentage,
          promotion_expires_at: s.promotion_expires_at,
          ...(s.image_url ? {} : { remove_image: true }),
        });
    }
    await app.close();
  });

  it('lists services in admin order with promotion and personal discount badges', async () => {
    const server = app.getHttpServer();
    expect(original.map((s) => s.code).sort()).toEqual(
      ['ACCESSIBILITY', 'AIRPORT', 'DAILY', 'FLEET', 'INTERCITY', 'RENTAL', 'TOURIST'].sort(),
    );
    expect(byCode(original, 'DAILY').is_available).toBe(true);

    await patch('TOURIST', {
      is_available: true,
      image: PNG,
      promotion_label_ar: '  عرض ترويجي  ',
      promotion_percentage: 15,
      promotion_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    // Hide FLEET for the guest “not listed” assertion below (seed/migration make it visible for booking).
    await patch('FLEET', { is_visible: false });
    await patch('AIRPORT', { promotion_label_ar: 'قديم', promotion_expires_at: new Date(Date.now() - 60_000).toISOString() });
    await patch('DAILY', { promotion_label_ar: 'x'.repeat(41) }, 400);
    await request(server).patch(go('/admin/services/NOPE')).set(admin).send({}).expect(400);

    const tourist = await createCode({ code: `E2ETOUR${suffix}`, percentage: 97, service_codes: ['TOURIST'] });
    const daily = await createCode({ code: `E2EDAILY${suffix}`, percentage: 96 });
    await createCode({ code: `E2ESOON${suffix}`, percentage: 95, service_codes: ['RENTAL'] });

    // Guest (and a broken token): promotions only
    for (const guest of [await customerList(), await customerList({ Authorization: 'Bearer nope' })]) {
      expect(guest.map((s) => s.code)).not.toContain('FLEET');
      expect(guest.map((s) => s.sort_order)).toEqual([...guest.map((s) => s.sort_order)].sort((a, b) => a - b));
      expect(byCode(guest, 'TOURIST')).toMatchObject({
        is_available: true,
        offer: { type: 'PROMOTION', percentage: 15, label_ar: 'عرض ترويجي', discount_code_id: null, code: null },
      });
      expect(byCode(guest, 'AIRPORT').offer).toBeNull();
      expect(byCode(guest, 'RENTAL')).toMatchObject({ is_available: false, offer: null });
      expect(Object.keys(byCode(guest, 'DAILY')).sort()).toEqual(
        ['code', 'image_url', 'is_available', 'name_ar', 'name_en', 'offer', 'sort_order'].sort(),
      );
    }
    const image = await request(server).get(byCode(await customerList(), 'TOURIST').image_url!).expect(200);
    expect(image.headers['content-type']).toContain('image/png');

    // Customer: best personal code beats the promotion; unavailable services get no discount badge
    const mine = await customerList(customer);
    expect(byCode(mine, 'TOURIST').offer).toMatchObject({
      type: 'DISCOUNT',
      percentage: 97,
      discount_code_id: tourist.id,
      code: tourist.code,
    });
    expect(byCode(mine, 'DAILY').offer).toMatchObject({ type: 'DISCOUNT', discount_code_id: daily.id });
    expect(byCode(mine, 'RENTAL').offer).toBeNull();

    // Default validate is DAILY; TOURIST-only code needs service_type=TOURIST
    const codes = (await request(server).get(go('/customer/discount-codes?service=DAILY')).set(customer).expect(200)).body;
    expect(codes.map((c: { id: string }) => c.id)).toContain(daily.id);
    expect(codes.map((c: { id: string }) => c.id)).not.toContain(tourist.id);
    expect(codes.find((c: { id: string }) => c.id === daily.id).services).toEqual(['DAILY']);
    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const economy = cats.body.find((c: { code: string }) => c.code === 'ECONOMY').id;
    const refused = await request(server)
      .post(go('/customer/discount-codes/validate'))
      .set(customer)
      .send({ code: tourist.code, ride_category_id: economy, ride_type: 'IMMEDIATE' })
      .expect(422);
    expect(refused.body.code).toBe('DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE');
    await request(server)
      .post(go('/customer/discount-codes/validate'))
      .set(customer)
      .send({ code: tourist.code, ride_category_id: economy, ride_type: 'IMMEDIATE', service_type: 'TOURIST' })
      .expect(200);

    // Coming soon: the personal code is hidden, the promotion stays
    await patch('TOURIST', { is_available: false });
    expect(byCode(await customerList(customer), 'TOURIST').offer).toMatchObject({ type: 'PROMOTION' });

    const adminList = (await request(server).get(go('/admin/services')).set(admin).expect(200)).body as Service[];
    expect(byCode(adminList, 'TOURIST').active_discount_codes).toBeGreaterThanOrEqual(1);
    expect(byCode(adminList, 'FLEET').is_visible).toBe(false);
  });

  it('reorders services', async () => {
    const server = app.getHttpServer();
    const codes = original.map((s) => s.code);
    await request(server).put(go('/admin/services/order')).set(admin).send({ codes: codes.slice(1) }).expect(400);
    await request(server).put(go('/admin/services/order')).set(admin).send({ codes: [...codes, codes[0]] }).expect(400);
    const reversed = [...codes].reverse();
    await request(server).put(go('/admin/services/order')).set(admin).send({ codes: reversed }).expect(200);
    const visible = reversed.filter((code) => code !== 'FLEET');
    expect((await customerList()).map((s) => s.code)).toEqual(visible);
    await request(server).put(go('/admin/services/order')).set(admin).send({ codes }).expect(200);
  });
});

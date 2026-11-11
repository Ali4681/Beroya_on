import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Packages (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };

  beforeAll(async () => {
    app = await createE2eApp();
    const admin = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    auth = { Authorization: `Bearer ${admin.body.access_token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists active packages for the home screen without login', async () => {
    const res = await request(app.getHttpServer()).get(go('/customer/packages')).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const pkg of res.body) {
      expect(typeof pkg.price).toBe('number');
      expect(pkg.duration_days).toBeGreaterThan(0);
      expect(pkg.ride_count != null || pkg.discount_percentage != null).toBe(true);
      expect(pkg).toHaveProperty('image_url');
      expect(pkg).not.toHaveProperty('image_key');
      expect(pkg).not.toHaveProperty('is_active');
    }
    const orders = res.body.map((p: { sort_order: number }) => p.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('admin manages packages and the customer list follows', async () => {
    const server = app.getHttpServer();
    const list = () => request(server).get(go('/customer/packages')).expect(200);

    await request(server)
      .post(go('/admin/packages'))
      .set(auth)
      .send({ name_ar: 'بدون ميزة', price: 1000, duration_days: 7 })
      .expect(400);

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500008', app: 'CUSTOMER' }).expect(200);
    const customer = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500008', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    await request(server)
      .post(go('/admin/packages'))
      .set({ Authorization: `Bearer ${customer.body.access_token}` })
      .send({ name_ar: 'x', price: 1, duration_days: 1, ride_count: 1 })
      .expect(403);

    const created = await request(server)
      .post(go('/admin/packages'))
      .set(auth)
      .send({
        name_ar: 'باقة E2E',
        name_en: 'E2E pack',
        description_ar: 'وصف',
        price: 30000,
        duration_days: 14,
        ride_count: 8,
        discount_percentage: 10,
        sort_order: 99,
        image: `data:image/png;base64,${PNG}`,
      })
      .expect(201);
    const id = created.body.id as string;

    try {
      expect(created.body).toMatchObject({ price: 30000, ride_count: 8, discount_percentage: 10, is_active: true });
      expect(created.body.image_url).toContain(`/customer/packages/${id}/image`);

      const shown = (await list()).body.find((p: { id: string }) => p.id === id);
      expect(shown).toMatchObject({ name_ar: 'باقة E2E', currency: 'SYP', duration_days: 14 });
      const img = await request(server).get(go(`/customer/packages/${id}/image`)).expect(200);
      expect(img.headers['content-type']).toContain('image/png');

      await request(server)
        .patch(go(`/admin/packages/${id}`))
        .set(auth)
        .send({ ride_count: null, discount_percentage: null })
        .expect(400);

      const edited = await request(server)
        .patch(go(`/admin/packages/${id}`))
        .set(auth)
        .send({ ride_count: null, price: 27500, remove_image: true })
        .expect(200);
      expect(edited.body).toMatchObject({ ride_count: null, discount_percentage: 10, price: 27500, image_url: null });

      await request(server).patch(go(`/admin/packages/${id}`)).set(auth).send({ is_active: false }).expect(200);
      expect((await list()).body.some((p: { id: string }) => p.id === id)).toBe(false);
      const adminList = await request(server).get(go('/admin/packages')).set(auth).expect(200);
      expect(adminList.body.find((p: { id: string }) => p.id === id).is_active).toBe(false);
    } finally {
      await request(server).delete(go(`/admin/packages/${id}`)).set(auth).expect(200);
    }
    await request(server).get(go(`/admin/packages/${id}`)).set(auth).expect(404);
  });
});

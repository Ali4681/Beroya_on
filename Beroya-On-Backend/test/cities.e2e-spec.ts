import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

const PHONE = '+963955500016';

describe('Cities catalog (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: PHONE, app: 'CUSTOMER' }).expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: PHONE, app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists public cities, links profile via city_id, keeps inactive on profile', async () => {
    const pub = await request(app.getHttpServer()).get(go('/customer/cities')).expect(200);
    expect(pub.body.items.length).toBeGreaterThanOrEqual(6);
    expect(pub.body.items[0]).toMatchObject({
      id: expect.any(String),
      name_ar: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
    expect(pub.body.items[0]).not.toHaveProperty('is_active');

    const damascus = (
      pub.body.items as { id: string; name_ar: string; lat: number | null; lng: number | null }[]
    ).find((c) => c.name_ar === 'دمشق');
    expect(damascus).toBeTruthy();
    expect(damascus!.lat).toBeCloseTo(33.5138, 3);
    expect(damascus!.lng).toBeCloseTo(36.2765, 3);

    const linked = await request(app.getHttpServer())
      .patch(go('/customer/profile'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ city_id: damascus!.id })
      .expect(200);
    expect(linked.body).toMatchObject({ city_id: damascus!.id, city: 'دمشق' });

    const me = await request(app.getHttpServer())
      .get(go('/auth/me'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ city_id: damascus!.id, city: 'دمشق' });

    await request(app.getHttpServer())
      .patch(go('/customer/profile'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ city_id: randomUUID() })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors?.[0]?.field).toBe('city_id');
      });

    const created = await request(app.getHttpServer())
      .post(go('/admin/cities'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name_ar: `مدينة-تجريبية-${randomUUID().slice(0, 6)}`, name_en: 'Temp', sort_order: 99 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(go(`/admin/cities/${created.body.id}`))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(200);

    await request(app.getHttpServer())
      .patch(go('/customer/profile'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ city_id: created.body.id })
      .expect(400);

    // Legacy free-text still works and links when it matches
    const byName = await request(app.getHttpServer())
      .patch(go('/customer/profile'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ city: 'حلب' })
      .expect(200);
    expect(byName.body.city).toBe('حلب');
    expect(byName.body.city_id).toBeTruthy();
  });
});

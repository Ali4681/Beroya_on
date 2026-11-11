import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

const CUSTOMER_PHONE = '+963955500015';

describe('Customer notifications inbox (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: CUSTOMER_PHONE, app: 'CUSTOMER' }).expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: CUSTOMER_PHONE, app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists empty inbox, then shows broadcast + mark-read up_to_id', async () => {
    const empty = await request(app.getHttpServer())
      .get(go('/customer/notifications'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(empty.body).toEqual({ items: [], unread_count: 0 });

    await request(app.getHttpServer())
      .post(go('/admin/notifications'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ audience: 'CUSTOMERS', title: 'عرض خاص', body: 'خصم اليوم على الرحلات' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(go('/customer/notifications'))
      .query({ page: 1, limit: 20 })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(list.body.unread_count).toBeGreaterThanOrEqual(1);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const top = list.body.items[0];
    expect(top).toMatchObject({
      id: expect.any(String),
      event: 'notification.message',
      title: 'عرض خاص',
      body: 'خصم اليوم على الرحلات',
      read_at: null,
      created_at: expect.any(String),
    });

    await request(app.getHttpServer())
      .post(go('/customer/notifications/read'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ up_to_id: randomUUID() })
      .expect(404);

    const marked = await request(app.getHttpServer())
      .post(go('/customer/notifications/read'))
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ up_to_id: top.id })
      .expect(200);
    expect(marked.body.unread_count).toBe(0);
    expect(marked.body.marked).toBeGreaterThanOrEqual(1);

    const after = await request(app.getHttpServer())
      .get(go('/customer/notifications'))
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(after.body.unread_count).toBe(0);
    expect(after.body.items[0].read_at).toBeTruthy();
  });
});

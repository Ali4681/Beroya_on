import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

const PHONE = '+963955500017';

describe('Customer saved places (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createE2eApp();
    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: PHONE, app: 'CUSTOMER' }).expect(200);
    token = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: PHONE, app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('creates, upserts HOME by kind/name, lists, patches, deletes', async () => {
    const empty = await request(app.getHttpServer()).get(go('/customer/saved-places')).set(auth()).expect(200);
    expect(empty.body).toEqual({ items: [] });

    const created = await request(app.getHttpServer())
      .post(go('/customer/saved-places'))
      .set(auth())
      .send({
        name: '  المنزل  ',
        kind: 'HOME',
        lat: 33.5138,
        lng: 36.2765,
        address: 'دمشق، المزة',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      id: expect.any(String),
      name: 'المنزل',
      kind: 'HOME',
      lat: 33.5138,
      lng: 36.2765,
      address: 'دمشق، المزة',
    });

    const upserted = await request(app.getHttpServer())
      .post(go('/customer/saved-places'))
      .set(auth())
      .send({
        name: 'البيت',
        kind: 'HOME',
        lat: 33.52,
        lng: 36.28,
      })
      .expect(200);
    expect(upserted.body.id).toBe(created.body.id);
    expect(upserted.body).toMatchObject({ name: 'البيت', kind: 'HOME', lat: 33.52 });

    const byName = await request(app.getHttpServer())
      .post(go('/customer/saved-places'))
      .set(auth())
      .send({ name: 'البيت', kind: 'OTHER', lat: 33.5, lng: 36.3 })
      .expect(200);
    expect(byName.body.id).toBe(created.body.id);
    expect(byName.body.kind).toBe('OTHER');

    await request(app.getHttpServer())
      .post(go('/customer/saved-places'))
      .set(auth())
      .send({ name: 'العمل', kind: 'WORK', lat: 33.51, lng: 36.29 })
      .expect(201);

    const list = await request(app.getHttpServer()).get(go('/customer/saved-places')).set(auth()).expect(200);
    expect(list.body.items.length).toBe(2);

    const patched = await request(app.getHttpServer())
      .patch(go(`/customer/saved-places/${created.body.id}`))
      .set(auth())
      .send({ address: 'عنوان جديد' })
      .expect(200);
    expect(patched.body.address).toBe('عنوان جديد');

    await request(app.getHttpServer())
      .delete(go(`/customer/saved-places/${created.body.id}`))
      .set(auth())
      .expect(204);

    await request(app.getHttpServer())
      .delete(go(`/customer/saved-places/${randomUUID()}`))
      .set(auth())
      .expect(404);

    await request(app.getHttpServer())
      .post(go('/customer/saved-places'))
      .set(auth())
      .send({ name: 'x', lat: 100, lng: 0 })
      .expect(400);
  });
});

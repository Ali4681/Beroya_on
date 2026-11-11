import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Ride categories — passengers + image (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const admin = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    adminToken = admin.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the six design categories, each with a working estimate', async () => {
    const server = app.getHttpServer();
    const res = await request(server).get(go('/customer/ride-categories')).expect(200);
    const codes = res.body.map((c: { code: string }) => c.code);
    expect(codes).toEqual(['ECONOMY', 'VIP', 'FAMILY', 'WOMEN', 'XL', 'TAXI']);

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500004', app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500004', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    for (const cat of res.body) {
      expect(cat.pricing).not.toBeNull();
      const estimate = await request(server)
        .post(go('/customer/rides/estimate'))
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({
          ride_category_id: cat.id,
          ride_type: 'IMMEDIATE',
          pickup: { lat: 33.5, lng: 36.3 },
          destination: { lat: 33.52, lng: 36.32 },
        })
        .expect(200);
      expect(estimate.body.estimated_fare).toBeGreaterThan(0);
    }
  });

  it('WOMEN ride always requires a female driver and refuses a manual male assign', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const women = cats.body.find((c: { code: string }) => c.code === 'WOMEN');

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500005', app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500005', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const token = login.body.access_token as string;
    await clearActiveCustomerRide(app, token);

    const ride = await request(server)
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `e2e-women-${randomUUID()}`)
      .send({
        ride_category_id: women.id,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(201);
    expect(ride.body.requirements.map((r: { type: string }) => r.type)).toEqual(['FEMALE_DRIVER']);

    try {
      const drivers = await request(server).get(go('/erp/drivers')).set(auth).expect(200);
      const male = drivers.body.find((d: { gender: string }) => d.gender !== 'FEMALE');
      if (male) {
        const refused = await request(server)
          .post(go(`/erp/rides/${ride.body.id}/assign`))
          .set(auth)
          .set('Idempotency-Key', `e2e-women-assign-${randomUUID()}`)
          .send({ driver_id: male.id })
          .expect(409);
        expect(refused.body.code).toBe('DRIVER_NOT_ELIGIBLE');
        expect(refused.body.reasons).toEqual(['FEMALE_DRIVER_REQUIRED']);
      }
    } finally {
      await clearActiveCustomerRide(app, token);
    }
  });

  it('every category returns max_passengers and image_url', async () => {
    const res = await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const cat of res.body) {
      expect(Number.isInteger(cat.max_passengers)).toBe(true);
      expect(cat.max_passengers).toBeGreaterThan(0);
      expect(cat).toHaveProperty('image_url');
      expect(cat).not.toHaveProperty('image_key');
    }
  });

  it('admin edits to passengers and image show up in the customer API', async () => {
    const server = app.getHttpServer();
    const list = await request(server).get(go('/customer/ride-categories')).expect(200);
    const target = list.body[0];
    const auth = { Authorization: `Bearer ${adminToken}` };

    await request(server)
      .patch(go(`/admin/ride-categories/${target.id}`))
      .set(auth)
      .send({ max_passengers: 0 })
      .expect(400);

    try {
      const updated = await request(server)
        .patch(go(`/admin/ride-categories/${target.id}`))
        .set(auth)
        .send({ max_passengers: 9, image: `data:image/png;base64,${PNG}` })
        .expect(200);
      expect(updated.body.max_passengers).toBe(9);
      expect(updated.body.image_url).toContain(`/ride-categories/${target.id}/image`);

      const after = await request(server).get(go('/customer/ride-categories')).expect(200);
      const row = after.body.find((c: { id: string }) => c.id === target.id);
      expect(row.max_passengers).toBe(9);
      expect(row.image_url).toBe(updated.body.image_url);

      const img = await request(server).get(go(`/customer/ride-categories/${target.id}/image`)).expect(200);
      expect(img.headers['content-type']).toContain('image/png');

      const removed = await request(server)
        .patch(go(`/admin/ride-categories/${target.id}`))
        .set(auth)
        .send({ remove_image: true })
        .expect(200);
      expect(removed.body.image_url).toBeNull();
      await request(server).get(go(`/customer/ride-categories/${target.id}/image`)).expect(404);
    } finally {
      await request(server)
        .patch(go(`/admin/ride-categories/${target.id}`))
        .set(auth)
        .send({ max_passengers: target.max_passengers });
    }
  });
});

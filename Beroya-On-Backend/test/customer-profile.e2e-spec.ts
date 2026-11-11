import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

const PHONE = '+963955500007';
// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Customer personal profile (e2e)', () => {
  let app: INestApplication;

  const login = async () => {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone: PHONE, app: 'CUSTOMER' }).expect(200);
    const res = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: PHONE, app: 'CUSTOMER', code: '123456' })
      .expect(200);
    return res.body as { access_token: string; user: Record<string, unknown> };
  };

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('saves personal data after OTP and returns it from profile, /auth/me and the next login', async () => {
    const server = app.getHttpServer();
    const { access_token } = await login();
    const auth = { Authorization: `Bearer ${access_token}` };

    const saved = await request(server)
      .patch(go('/customer/profile'))
      .set(auth)
      .send({
        full_name: '  عمر الأحمد  ',
        email: ' Omar.E2E@Example.com ',
        city: 'دمشق',
        gender: 'MALE',
        date_of_birth: '1995-04-21',
        preferred_currency: 'usd',
      })
      .expect(200);
    const expected = {
      full_name: 'عمر الأحمد',
      email: 'omar.e2e@example.com',
      city: 'دمشق',
      city_id: expect.any(String),
      gender: 'MALE',
      date_of_birth: '1995-04-21',
      preferred_currency: 'USD',
    };
    expect(saved.body).toMatchObject({ ...expected, phone: PHONE });
    expect(saved.body).not.toHaveProperty('notes');

    const profile = await request(server).get(go('/customer/profile')).set(auth).expect(200);
    expect(profile.body).toMatchObject(expected);

    const me = await request(server).get(go('/auth/me')).set(auth).expect(200);
    expect(me.body).toMatchObject({ ...expected, role: 'CUSTOMER' });

    const again = await login();
    expect(again.user).toMatchObject(expected);

    const partial = await request(server).patch(go('/customer/profile')).set(auth).send({ city: 'حلب' }).expect(200);
    expect(partial.body).toMatchObject({ ...expected, city: 'حلب', city_id: expect.any(String) });

    const cleared = await request(server)
      .patch(go('/customer/profile'))
      .set(auth)
      .send({ email: null, city: null, city_id: null, date_of_birth: null, gender: 'UNSPECIFIED', preferred_currency: 'SYP' })
      .expect(200);
    expect(cleared.body).toMatchObject({
      email: null,
      city: null,
      city_id: null,
      date_of_birth: null,
      gender: 'UNSPECIFIED',
      preferred_currency: 'SYP',
      full_name: 'عمر الأحمد',
    });
  });

  it('validates email, birth date and the other fields', async () => {
    const server = app.getHttpServer();
    const { access_token } = await login();
    const patch = (body: Record<string, unknown>) =>
      request(server).patch(go('/customer/profile')).set({ Authorization: `Bearer ${access_token}` }).send(body);

    const bad: Record<string, unknown>[] = [
      { email: 'not-an-email' },
      { date_of_birth: '1995-02-30' },
      { date_of_birth: '21-04-1995' },
      { date_of_birth: '1995-04-21T00:00:00Z' },
      { date_of_birth: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) },
      { date_of_birth: '1899-12-31' },
      { full_name: ' ' },
      { full_name: null },
      { gender: 'OTHER' },
      { preferred_currency: 'EUR' },
      { city: 'x'.repeat(81) },
      { avatar_url: 'https://example.com/a.png' },
    ];
    for (const body of bad) {
      const res = await patch(body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('uploads, serves and removes the avatar', async () => {
    const server = app.getHttpServer();
    const { access_token } = await login();
    const auth = { Authorization: `Bearer ${access_token}` };

    await request(server).post(go('/customer/profile/avatar')).set(auth).send({ image: 'aGVsbG8=' }).expect(400);

    const uploaded = await request(server)
      .post(go('/customer/profile/avatar'))
      .set(auth)
      .send({ image: `data:image/png;base64,${PNG}` })
      .expect(200);
    expect(uploaded.body.avatar_url).toContain('/customer/profile/avatar?v=');

    const me = await request(server).get(go('/auth/me')).set(auth).expect(200);
    expect(me.body.avatar_url).toBe(uploaded.body.avatar_url);

    const img = await request(server).get(go('/customer/profile/avatar')).set(auth).expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    await request(server).get(go('/customer/profile/avatar')).expect(401);

    const removed = await request(server).delete(go('/customer/profile/avatar')).set(auth).expect(200);
    expect(removed.body.avatar_url).toBeNull();
    await request(server).get(go('/customer/profile/avatar')).set(auth).expect(404);
  });

  it('staff /auth/me is unchanged', async () => {
    const server = app.getHttpServer();
    const admin = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    expect(admin.body.user.email).toBe('superadmin@beroyaon.com');
    expect(admin.body.user).not.toHaveProperty('city');
  });
});

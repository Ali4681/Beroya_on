import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createE2eApp, go } from './helpers/e2e-app';

describe('Support messages (e2e) — Ticket §26', () => {
  let app: INestApplication;
  let customerAuth: { Authorization: string };
  let csAuth: { Authorization: string };

  beforeAll(async () => {
    app = await createE2eApp();
    const server = app.getHttpServer();

    await request(server).post(go('/auth/otp/request')).send({ phone: '+963955500026', app: 'CUSTOMER' }).expect(200);
    const login = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963955500026', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    customerAuth = { Authorization: `Bearer ${login.body.access_token}` };

    const staff = await request(server)
      .post(go('/auth/staff/login'))
      .send({ identifier: 'cs.dam@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    csAuth = { Authorization: `Bearer ${staff.body.access_token}` };
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a support message idempotently and lists it; ERP can claim/close', async () => {
    const key = randomUUID();
    const body = {
      full_name: 'عمر الدعم',
      phone: '+963955500026',
      email: 'support-e2e@example.com',
      message: 'أحتاج مساعدة بخصوص الحساب والخصومات.',
    };

    const created = await request(app.getHttpServer())
      .post(go('/customer/support/messages'))
      .set(customerAuth)
      .set({ 'Idempotency-Key': key })
      .send(body)
      .expect(201);
    expect(created.body).toMatchObject({
      id: expect.any(String),
      reference: expect.stringMatching(/^SUP-/),
      status: 'OPEN',
    });
    expect(created.body.created_at).toBeTruthy();

    const replay = await request(app.getHttpServer())
      .post(go('/customer/support/messages'))
      .set(customerAuth)
      .set({ 'Idempotency-Key': key })
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    const mine = await request(app.getHttpServer())
      .get(go('/customer/support/messages'))
      .set(customerAuth)
      .expect(200);
    expect(mine.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);

    const erp = await request(app.getHttpServer())
      .get(go('/erp/support-messages?status=OPEN'))
      .set(csAuth)
      .expect(200);
    expect(erp.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);

    await request(app.getHttpServer())
      .post(go(`/erp/support-messages/${created.body.id}/claim`))
      .set(csAuth)
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('IN_PROGRESS'));

    await request(app.getHttpServer())
      .post(go(`/erp/support-messages/${created.body.id}/close`))
      .set(csAuth)
      .send({ reply: 'تم حل الموضوع.' })
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('CLOSED');
        expect(res.body.reply).toBe('تم حل الموضوع.');
        expect(res.body.closed_at).toBeTruthy();
      });
  });

  it('rejects short messages with VALIDATION_ERROR field errors', async () => {
    const bad = await request(app.getHttpServer())
      .post(go('/customer/support/messages'))
      .set(customerAuth)
      .set({ 'Idempotency-Key': randomUUID() })
      .send({ full_name: 'أ', phone: 'bad', message: 'قصير' })
      .expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(bad.body.errors)).toBe(true);
    expect(bad.body.errors.some((e: { field: string }) => e.field === 'message')).toBe(true);
  });

  it('lists customer complaints with the ticket §20 shape', async () => {
    const res = await request(app.getHttpServer()).get(go('/customer/complaints?page=1')).set(customerAuth).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(item).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          ride_id: expect.any(String),
          reason_code: expect.any(String),
          status: expect.stringMatching(/^(OPEN|IN_REVIEW|RESOLVED|REJECTED)$/),
          created_at: expect.anything(),
          updated_at: expect.anything(),
        }),
      );
      expect(item).toHaveProperty('notes');
      expect(item).toHaveProperty('resolution_note');
    }
  });
});

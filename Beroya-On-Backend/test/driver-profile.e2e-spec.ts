import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const BACKDATED = new Date('2000-01-01T00:00:00Z');
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CODE = process.env.OTP_DEV_CODE ?? '123456';

describe('Driver profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let phone = randomPhone();
  let accessToken = '';
  let profileId = '';
  let adminToken = '';

  async function makeDriver(driverPhone: string) {
    const branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    const user = await prisma.user.create({
      data: {
        phone: driverPhone,
        role: 'DRIVER',
        full_name: 'سائق الملف الشخصي',
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const profile = await prisma.goDriverProfile.create({
      data: { user_id: user.id, branch_id: branchId, gender: 'MALE', created_at: BACKDATED },
    });
    return profile.id;
  }

  async function login(driverPhone: string) {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone: driverPhone, app: 'DRIVER' }).expect(200);
    const res = await request(server)
      .post(go('/auth/otp/verify'))
      .send({ phone: driverPhone, app: 'DRIVER', code: CODE })
      .expect(200);
    return res.body as { access_token: string; user: Record<string, unknown> };
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    profileId = await makeDriver(phone);
    const logged = await login(phone);
    accessToken = logged.access_token;

    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    await app.close();
  }, 30_000);

  it('GET /auth/me returns gender, rating_*, and avatar_url for DRIVER', async () => {
    const me = await request(app.getHttpServer())
      .get(go('/auth/me'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    expect(me.body.role).toBe('DRIVER');
    expect(me.body.gender).toBe('MALE');
    expect(me.body).toHaveProperty('rating_avg');
    expect(typeof me.body.rating_count).toBe('number');
    expect(me.body).toHaveProperty('avatar_url');
    expect(me.body).not.toHaveProperty('date_of_birth');
    expect(me.body).not.toHaveProperty('preferred_currency');

    const profile = await request(app.getHttpServer())
      .get(go('/driver/profile'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    expect(profile.body.gender).toBe('MALE');
    expect(profile.body.phone).toBe(phone);
    expect(profile.body.phone_change_request).toBeNull();
  });

  it('uploads avatar and serves it via avatar_url', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const server = app.getHttpServer();

    const uploaded = await request(server).post(go('/driver/profile/avatar')).set(auth).send({ image: PNG }).expect(200);
    expect(uploaded.body.avatar_url).toContain('/driver/profile/avatar?v=');

    const me = await request(server).get(go('/auth/me')).set(auth).expect(200);
    expect(me.body.avatar_url).toBe(uploaded.body.avatar_url);

    await request(server).get(go('/driver/profile/avatar')).set(auth).expect(200);

    const removed = await request(server).delete(go('/driver/profile/avatar')).set(auth).expect(200);
    expect(removed.body.avatar_url).toBeNull();
    await request(server).get(go('/driver/profile/avatar')).set(auth).expect(404);
  });

  it('OTP confirm creates pending request; approve applies phone; reject leaves phone', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };
    const admin = { Authorization: `Bearer ${adminToken}` };
    const server = app.getHttpServer();
    const newPhone = randomPhone();
    const takenPhone = randomPhone();
    await makeDriver(takenPhone);

    await request(server).post(go('/driver/profile/phone/request')).set(auth).send({ phone }).expect(400);

    const conflict = await request(server)
      .post(go('/driver/profile/phone/request'))
      .set(auth)
      .send({ phone: takenPhone })
      .expect(409);
    expect(conflict.body.code).toBe('CONFLICT');

    const requested = await request(server)
      .post(go('/driver/profile/phone/request'))
      .set(auth)
      .send({ phone: newPhone })
      .expect(200);
    expect(requested.body.sent).toBe(true);

    const confirmed = await request(server)
      .post(go('/driver/profile/phone/confirm'))
      .set(auth)
      .send({ phone: newPhone, code: CODE })
      .expect(200);
    expect(confirmed.body.status).toBe('PENDING_APPROVAL');
    expect(confirmed.body.request_id).toBeTruthy();
    expect(String(confirmed.body.requested_phone)).toContain('*');
    expect(String(confirmed.body.requested_phone)).not.toBe(newPhone);

    // Phone must NOT change yet
    const profilePending = await request(server).get(go('/driver/profile')).set(auth).expect(200);
    expect(profilePending.body.phone).toBe(phone);
    expect(profilePending.body.phone_change_request?.request_id).toBe(confirmed.body.request_id);
    expect(profilePending.body.phone_change_request?.status).toBe('PENDING');

    const mePending = await request(server).get(go('/auth/me')).set(auth).expect(200);
    expect(mePending.body.phone).toBe(phone);

    const listed = await request(server)
      .get(go('/admin/drivers/phone-change-requests'))
      .query({ status: 'PENDING' })
      .set(admin)
      .expect(200);
    expect(listed.body.items.some((r: { id: string }) => r.id === confirmed.body.request_id)).toBe(true);

    const auditRequested = await prisma.goAuditLog.findFirstOrThrow({
      where: { action: 'driver.phone_change_requested', entity_id: confirmed.body.request_id },
    });
    expect(JSON.stringify(auditRequested.metadata)).not.toContain(newPhone);

    await request(server)
      .post(go(`/admin/drivers/phone-change-requests/${confirmed.body.request_id}/approve`))
      .set(admin)
      .set('Idempotency-Key', `e2e-phone-approve-${randomUUID()}`)
      .expect(200);

    // After approve, login with new phone (sessions revoked)
    const relogged = await login(newPhone);
    accessToken = relogged.access_token;
    phone = newPhone;

    const meAfter = await request(server)
      .get(go('/driver/profile'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    expect(meAfter.body.phone).toBe(newPhone);
    expect(meAfter.body.phone_change_request).toBeNull();

    const auditChanged = await prisma.goAuditLog.findFirstOrThrow({
      where: { action: 'driver.phone_changed', entity_id: profileId },
      orderBy: { created_at: 'desc' },
    });
    expect(auditChanged.metadata).toMatchObject({ sessions_revoked: true, via: 'staff_approval' });
    expect(JSON.stringify(auditChanged.metadata)).not.toContain(newPhone);

    // Reject path: request another change then reject
    const rejectPhone = randomPhone();
    await request(server)
      .post(go('/driver/profile/phone/request'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ phone: rejectPhone })
      .expect(200);
    const pendingReject = await request(server)
      .post(go('/driver/profile/phone/confirm'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ phone: rejectPhone, code: CODE })
      .expect(200);

    await request(server)
      .post(go(`/admin/drivers/phone-change-requests/${pendingReject.body.request_id}/reject`))
      .set(admin)
      .set('Idempotency-Key', `e2e-phone-reject-${randomUUID()}`)
      .send({ reason: 'e2e reject' })
      .expect(200);

    const stillOld = await request(server)
      .get(go('/driver/profile'))
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    expect(stillOld.body.phone).toBe(newPhone);
    expect(stillOld.body.phone_change_request).toBeNull();
  });
});

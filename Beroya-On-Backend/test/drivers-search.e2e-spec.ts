import { INestApplication } from '@nestjs/common';
import { randomInt } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2eApp, go } from './helpers/e2e-app';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
// Backdated so these rows never push seed drivers off the first page of `/erp/drivers` in other suites.
const BACKDATED = new Date('2000-01-01T00:00:00Z');

describe('Driver list search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const tag = String(randomInt(1000, 9999));
  const ahmad = { phone: randomPhone(), id: '' };
  const fatima = { phone: randomPhone(), id: '' };

  async function makeDriver(phone: string, fullName: string, suspended = false) {
    const branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;
    const user = await prisma.user.create({
      data: { phone, role: 'DRIVER', full_name: fullName, branch_id: branchId, created_at: BACKDATED },
    });
    const profile = await prisma.goDriverProfile.create({
      data: { user_id: user.id, branch_id: branchId, gender: 'MALE', is_suspended: suspended, created_at: BACKDATED },
    });
    return profile.id;
  }

  async function search(query: Record<string, string>) {
    const res = await request(app.getHttpServer())
      .get(go('/erp/drivers'))
      .query({ limit: 100, ...query })
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);
    return (res.body as { id: string }[]).map((row) => row.id);
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    adminToken = (
      await request(app.getHttpServer()).post(go('/auth/staff/login')).send({ identifier: 'admin@beroyaon.com', password: 'Beroya@12345' }).expect(200)
    ).body.access_token;
    ahmad.id = await makeDriver(ahmad.phone, `أحمد الإختبار ${tag}`);
    fatima.id = await makeDriver(fatima.phone, `فاطمة البحث ${tag}`, true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds drivers beyond the first page by name, ignoring Arabic spelling variants', async () => {
    expect(await search({ q: `احمد الاختبار ${tag}` })).toEqual([ahmad.id]);
    expect(await search({ q: `فاطمه ${tag}` })).toEqual([fatima.id]);
    expect(await search({ q: `${tag} احمد` })).toEqual([ahmad.id]);
    expect(await search({ q: `احمد ${fatima.phone.slice(-6)}` })).toEqual([]);
  });

  it('finds drivers by phone in local, international, partial and Arabic-Indic forms', async () => {
    const local = `0${ahmad.phone.slice(4)}`;
    expect(await search({ q: local })).toContain(ahmad.id);
    expect(await search({ q: ahmad.phone })).toContain(ahmad.id);
    expect(await search({ q: ahmad.phone.slice(-7) })).toContain(ahmad.id);
    const arabicDigits = local.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
    expect(await search({ q: arabicDigits })).toContain(ahmad.id);
  });

  it('filters by state and treats LIKE wildcards literally', async () => {
    const suspended = await search({ q: tag, state: 'suspended' });
    expect(suspended).toContain(fatima.id);
    expect(suspended).not.toContain(ahmad.id);
    const active = await search({ q: tag, state: 'active' });
    expect(active).toContain(ahmad.id);
    expect(active).not.toContain(fatima.id);
    expect(await search({ q: '%%%' })).toEqual([]);
    await request(app.getHttpServer())
      .get(go('/erp/drivers'))
      .query({ state: 'nope' })
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(400);
  });

  it('lets staff change the driver login phone and signs the driver out everywhere', async () => {
    const code = process.env.OTP_DEV_CODE ?? '123456';
    const server = app.getHttpServer();
    const oldPhone = randomPhone();
    const driverId = await makeDriver(oldPhone, `سائق الرقم ${tag}`);
    await request(server).post(go('/auth/otp/request')).send({ phone: oldPhone, app: 'DRIVER' }).expect(200);
    const oldToken = (await request(server).post(go('/auth/otp/verify')).send({ phone: oldPhone, app: 'DRIVER', code }).expect(200)).body
      .access_token as string;
    await request(server).get(go('/driver/eligibility')).set({ Authorization: `Bearer ${oldToken}` }).expect(200);

    const conflict = await request(server)
      .patch(go(`/admin/drivers/${driverId}`))
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ phone: ahmad.phone })
      .expect(409);
    expect(conflict.body.code).toBe('CONFLICT');
    expect(conflict.body.errors).toEqual([{ field: 'phone', messages: ['Another driver account already uses this phone'] }]);

    await request(server)
      .patch(go(`/admin/drivers/${driverId}`))
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ phone: '12' })
      .expect(400);

    const newPhone = randomPhone();
    const updated = await request(server)
      .patch(go(`/admin/drivers/${driverId}`))
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ phone: `0${newPhone.slice(4)}` })
      .expect(200);
    expect(updated.body.user.phone).toBe(newPhone);

    await request(server).get(go('/driver/eligibility')).set({ Authorization: `Bearer ${oldToken}` }).expect(401);
    await request(server).post(go('/auth/otp/request')).send({ phone: oldPhone, app: 'DRIVER' }).expect((res) => {
      expect(res.status).not.toBe(200);
    });
    await request(server).post(go('/auth/otp/request')).send({ phone: newPhone, app: 'DRIVER' }).expect(200);
    await request(server).post(go('/auth/otp/verify')).send({ phone: newPhone, app: 'DRIVER', code }).expect(200);

    const audit = await prisma.goAuditLog.findFirstOrThrow({
      where: { action: 'driver.updated', entity_id: driverId },
      orderBy: { created_at: 'desc' },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(newPhone);
    expect(audit.metadata).toMatchObject({ sessions_revoked: true });
  });
});

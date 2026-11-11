import { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client';
import { RealtimeService } from '../src/infra/realtime/realtime.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../src/modules/go/audit/audit.service';
import { createE2eApp, go } from './helpers/e2e-app';

const STAFF_PASSWORD = 'Beroya@12345';
const OPERATOR_PASSWORD = 'Store@2026x';

const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;
const local = (phone: string) => `0${phone.slice(4)}`;

describe('Stores / POS / driver wallet recharge (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let financeToken: string;
  let csToken: string;
  let walletOpToken: string;
  let financeId: string;
  let branchId: string;

  const driver1 = { phone: randomPhone(), profileId: '', userId: '', token: '' };
  const driver2 = { phone: randomPhone(), profileId: '' };
  const suspended = { phone: randomPhone(), profileId: '' };

  let storeA: { id: string; code: string };
  let storeB: { id: string; code: string };
  let opA: string;
  let opA2: string;
  let opB: string;
  let firstRecharge: { reference: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function staffLogin(identifier: string, password = STAFF_PASSWORD) {
    const res = await request(app.getHttpServer()).post(go('/auth/staff/login')).send({ identifier, password }).expect(200);
    return res.body as { access_token: string; user: Record<string, unknown> };
  }

  // Backdated so these rows never push seed drivers off the first page of `/erp/drivers` in other suites.
  const BACKDATED = new Date('2000-01-01T00:00:00Z');

  async function makeDriver(phone: string, opts: { suspended?: boolean } = {}) {
    const user = await prisma.user.create({
      data: {
        phone,
        role: 'DRIVER',
        full_name: `POS Test Driver ${phone.slice(-4)}`,
        branch_id: branchId,
        created_at: BACKDATED,
      },
    });
    const profile = await prisma.goDriverProfile.create({
      data: {
        user_id: user.id,
        branch_id: branchId,
        gender: 'MALE',
        is_suspended: opts.suspended ?? false,
        created_at: BACKDATED,
      },
    });
    return { userId: user.id, profileId: profile.id };
  }

  async function storeBalance(id: string) {
    return (await prisma.goStore.findUniqueOrThrow({ where: { id } })).balance.toFixed(2);
  }

  async function walletOf(profileId: string) {
    return prisma.goDriverWallet.findUnique({ where: { driver_id: profileId } });
  }

  function recharge(token: string, body: Record<string, unknown>, key: string | null = randomUUID()) {
    const req = request(app.getHttpServer()).post(go('/pos/recharges')).set(auth(token));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  async function createOperator(storeId: string) {
    const email = `pos.${randomUUID().slice(0, 8)}@store.test`;
    const res = await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeId}/operators`))
      .set(auth(adminToken))
      .send({ full_name: 'Cashier', email, password: OPERATOR_PASSWORD })
      .expect(201);
    expect(res.body).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain(OPERATOR_PASSWORD);
    const login = await staffLogin(email, OPERATOR_PASSWORD);
    expect(login.user.role).toBe('STORE_OPERATOR');
    expect(JSON.stringify(login.user)).not.toMatch(/password/i);
    return login.access_token;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    branchId = (await prisma.goBranch.findFirstOrThrow({ where: { code: 'DAMASCUS' } })).id;

    const admin = await staffLogin('admin@beroyaon.com');
    adminToken = admin.access_token;
    const finance = await staffLogin('finance@beroyaon.com');
    financeToken = finance.access_token;
    financeId = String(finance.user.id);
    csToken = (await staffLogin('cs.dam@beroyaon.com')).access_token;
    walletOpToken = (await staffLogin('wallet.dam@beroyaon.com')).access_token;

    Object.assign(driver1, await makeDriver(driver1.phone));
    Object.assign(driver2, await makeDriver(driver2.phone));
    Object.assign(suspended, await makeDriver(suspended.phone, { suspended: true }));

    const code = process.env.OTP_DEV_CODE ?? '123456';
    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: driver1.phone, app: 'DRIVER' }).expect(200);
    driver1.token = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: driver1.phone, app: 'DRIVER', code })
        .expect(200)
    ).body.access_token;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  // ---------------------------------------------------------------- store management

  it('1. an administrator creates a store with a zero opening balance', async () => {
    const res = await request(app.getHttpServer())
      .post(go('/admin/stores'))
      .set(auth(adminToken))
      .send({ name: 'Store A', owner_name: 'Owner A', mobile_number: '0933000001', branch_id: branchId, max_recharge_amount: '' })
      .expect(201);
    expect(res.body.code).toMatch(/^ST-/);
    expect(res.body.balance).toBe('0.00');
    expect(res.body.status).toBe('ACTIVE');
    storeA = { id: res.body.id, code: res.body.code };

    const b = await request(app.getHttpServer())
      .post(go('/admin/stores'))
      .set(auth(adminToken))
      .send({ name: 'Store B', owner_name: 'Owner B', mobile_number: '0933000002', branch_id: branchId })
      .expect(201);
    storeB = { id: b.body.id, code: b.body.code };
  });

  it('1b. a balance cannot be set through store creation or the generic update', async () => {
    await request(app.getHttpServer())
      .post(go('/admin/stores'))
      .set(auth(adminToken))
      .send({ name: 'X', owner_name: 'Y', mobile_number: '0933000003', branch_id: branchId, balance: '999' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(go(`/admin/stores/${storeA.id}`))
      .set(auth(adminToken))
      .send({ balance: '999' })
      .expect(400);
    expect(await storeBalance(storeA.id)).toBe('0.00');
  });

  it('2. users without store permissions cannot create stores', async () => {
    for (const token of [csToken, walletOpToken, financeToken]) {
      await request(app.getHttpServer())
        .post(go('/admin/stores'))
        .set(auth(token))
        .send({ name: 'Nope', owner_name: 'Nope', mobile_number: '0933000009', branch_id: branchId })
        .expect(403);
    }
  });

  it('3. duplicate store codes are rejected by the database', async () => {
    await expect(
      prisma.goStore.create({
        data: { code: storeA.code, name: 'Dup', owner_name: 'Dup', mobile_number: '+963933000004', branch_id: branchId },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // ---------------------------------------------------------------- funding

  it('7/9/10. an authorized user adds balance; ledger records actor and before/after', async () => {
    const key = randomUUID();
    const res = await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-credits`))
      .set(auth(financeToken))
      .set('Idempotency-Key', key)
      .send({ amount: '100000', currency: 'SYP', external_reference: 'TRF-1', note: 'opening float' })
      .expect(200);
    expect(res.body.balance).toBe('100000.00');
    expect(res.body.entry).toMatchObject({
      type: 'ADMIN_CREDIT',
      direction: 'CREDIT',
      amount: '100000.00',
      balance_before: '0.00',
      balance_after: '100000.00',
      external_reference: 'TRF-1',
    });
    expect(res.body.entry.performed_by.id).toBe(financeId);
    expect(await storeBalance(storeA.id)).toBe('100000.00');

    const audit = await prisma.goAuditLog.findFirst({
      where: { entity_id: storeA.id, action: AuditAction.STORE_BALANCE_CREDITED },
    });
    expect(audit?.actor_user_id).toBe(financeId);

    // 11. same key, same body: no second credit. Same key, other body: rejected.
    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-credits`))
      .set(auth(financeToken))
      .set('Idempotency-Key', key)
      .send({ amount: '100000', currency: 'SYP', external_reference: 'TRF-1', note: 'opening float' })
      .expect(200);
    const other = await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-credits`))
      .set(auth(financeToken))
      .set('Idempotency-Key', key)
      .send({ amount: '200000', currency: 'SYP' });
    expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await storeBalance(storeA.id)).toBe('100000.00');
    expect(await prisma.goStoreLedgerEntry.count({ where: { store_id: storeA.id, type: 'ADMIN_CREDIT' } })).toBe(1);

    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeB.id}/balance-credits`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '50000', currency: 'SYP' })
      .expect(200);
  });

  it('8. unauthorized users cannot add balance; negative/zero amounts are refused', async () => {
    for (const token of [csToken, walletOpToken]) {
      await request(app.getHttpServer())
        .post(go(`/admin/stores/${storeA.id}/balance-credits`))
        .set(auth(token))
        .set('Idempotency-Key', randomUUID())
        .send({ amount: '1000', currency: 'SYP' })
        .expect(403);
    }
    for (const amount of ['-500', '0', '0.00', '1e3', '12.345']) {
      await request(app.getHttpServer())
        .post(go(`/admin/stores/${storeA.id}/balance-credits`))
        .set(auth(financeToken))
        .set('Idempotency-Key', randomUUID())
        .send({ amount, currency: 'SYP' })
        .expect(400);
    }
    const usd = await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-credits`))
      .set(auth(financeToken))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '1000', currency: 'USD' });
    expect(usd.body.code).toBe('CURRENCY_MISMATCH');
    // Adjustments are admin-only and cannot overdraw.
    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-adjustments`))
      .set(auth(financeToken))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '10', direction: 'DEBIT', currency: 'SYP', reason: 'test reason' })
      .expect(403);
    const over = await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-adjustments`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '100000.01', direction: 'DEBIT', currency: 'SYP', reason: 'overdraw attempt' });
    expect(over.body.code).toBe('STORE_BALANCE_INSUFFICIENT');
    expect(await storeBalance(storeA.id)).toBe('100000.00');
  });

  it('operators are created by admins and sign in through the existing staff login', async () => {
    opA = await createOperator(storeA.id);
    opA2 = await createOperator(storeA.id);
    opB = await createOperator(storeB.id);
    const me = await request(app.getHttpServer()).get(go('/pos/me')).set(auth(opA)).expect(200);
    expect(me.body.store.id).toBe(storeA.id);
    expect(me.body.store.balance).toBe('100000.00');
    expect(me.body.fees).toBe('0.00');
    expect(me.body.commission).toBe('0.00');
    // POS is for store operators only; even a super admin (who passes every role check) has no store to act for.
    const adminPos = await request(app.getHttpServer()).get(go('/pos/me')).set(auth(adminToken)).expect(403);
    expect(adminPos.body.code).toBe('ROLE_NOT_ALLOWED');
    const superAdmin = await staffLogin(process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@beroyaon.com');
    const superPos = await request(app.getHttpServer()).get(go('/pos/me')).set(auth(superAdmin.access_token)).expect(403);
    expect(superPos.body.code).toBe('STORE_ACCOUNT_NOT_LINKED');
  });

  it('a store owner changes their own password with the current one', async () => {
    const email = `owner.${randomUUID().slice(0, 8)}@store.test`;
    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/operators`))
      .set(auth(adminToken))
      .send({ full_name: 'Owner', email, password: OPERATOR_PASSWORD })
      .expect(201);
    const owner = await staffLogin(email, OPERATOR_PASSWORD);
    const change = (body: Record<string, string>) =>
      request(app.getHttpServer()).post(go('/auth/staff/change-password')).set(auth(owner.access_token)).send(body);

    const wrong = await change({ current_password: 'Wrong@2026x', new_password: 'Owner2026new' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    await change({ current_password: OPERATOR_PASSWORD, new_password: 'short1' }).expect(400);

    const done = await change({ current_password: OPERATOR_PASSWORD, new_password: 'Owner2026new' }).expect(200);
    expect(JSON.stringify(done.body)).not.toContain('Owner2026new');
    await request(app.getHttpServer()).post(go('/auth/staff/login')).send({ identifier: email, password: OPERATOR_PASSWORD }).expect(401);
    const again = await staffLogin(email, 'Owner2026new');
    expect(again.user.role).toBe('STORE_OPERATOR');
  });

  // ---------------------------------------------------------------- lookup

  it('12-15. driver lookup by mobile number', async () => {
    const found = await request(app.getHttpServer())
      .post(go('/pos/drivers/lookup'))
      .set(auth(opA))
      .send({ mobile_number: local(driver1.phone) })
      .expect(200);
    expect(found.body.rechargeable).toBe(true);
    expect(found.body.first_recharge).toBe(true);
    expect(found.body.driver.mobile_masked).not.toBe(local(driver1.phone));
    expect(found.body.driver.mobile_masked).toContain('***');
    expect(JSON.stringify(found.body)).not.toContain(driver1.phone);
    expect(found.body).not.toHaveProperty('wallet_balance');

    const unknown = await request(app.getHttpServer())
      .post(go('/pos/drivers/lookup'))
      .set(auth(opA))
      .send({ mobile_number: '0999999990' })
      .expect(404);
    expect(unknown.body.code).toBe('NOT_FOUND');

    await request(app.getHttpServer()).post(go('/pos/drivers/lookup')).set(auth(opA)).send({ mobile_number: 'abc' }).expect(400);

    const blocked = await request(app.getHttpServer())
      .post(go('/pos/drivers/lookup'))
      .set(auth(opA))
      .send({ mobile_number: suspended.phone })
      .expect(200);
    expect(blocked.body.rechargeable).toBe(false);
    expect(blocked.body.reasons).toContain('DRIVER_SUSPENDED');
    const refused = await recharge(opA, { mobile_number: suspended.phone, amount: '20000', currency: 'SYP' });
    expect(refused.body.code).toBe('DRIVER_NOT_RECHARGEABLE');
    expect(await walletOf(suspended.profileId).then((w) => w?.balance.toFixed(2) ?? '0.00')).toBe('0.00');
  });

  // ---------------------------------------------------------------- recharge

  it('21. invalid requests are refused before any money moves', async () => {
    const body = { mobile_number: driver1.phone, currency: 'SYP' };
    for (const amount of ['0', '-100', '0.00', 'abc']) {
      await recharge(opA, { ...body, amount }).expect(400);
    }
    const noKey = await recharge(opA, { ...body, amount: '20000' }, null);
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const below = await recharge(opA, { ...body, amount: '5000' });
    expect(below.body.code).toBe('RECHARGE_BELOW_MINIMUM');
    expect(below.body.minimum).toBeDefined();
    const currency = await recharge(opA, { ...body, amount: '20000', currency: 'USD' });
    expect(currency.body.code).toBe('CURRENCY_MISMATCH');
    // A client-supplied store id is not accepted at all.
    await recharge(opA, { ...body, amount: '20000', store_id: storeB.id }).expect(400);
    expect(await storeBalance(storeA.id)).toBe('100000.00');
    expect(await storeBalance(storeB.id)).toBe('50000.00');
    expect(await prisma.goStoreLedgerEntry.count({ where: { type: 'DRIVER_RECHARGE_DEBIT', store_id: storeA.id } })).toBe(0);
  });

  it('16-19/26. a recharge debits the store and credits the driver by the same amount, atomically linked', async () => {
    const walletBefore = (await walletOf(driver1.profileId))?.balance ?? new Prisma.Decimal(0);
    const key = randomUUID();
    const res = await recharge(opA, { mobile_number: local(driver1.phone), amount: '30000', currency: 'SYP' }, key).expect(200);
    firstRecharge = { reference: res.body.reference };
    expect(res.body).toMatchObject({
      status: 'COMPLETED',
      amount: '30000.00',
      currency: 'SYP',
      fees: '0.00',
      commission: '0.00',
      driver_wallet_credit: '30000.00',
      store_debit: '30000.00',
      store_balance_before: '100000.00',
      store_balance_after: '70000.00',
      replayed: false,
    });
    expect(res.body.reference).toMatch(/^PR-/);

    expect(await storeBalance(storeA.id)).toBe('70000.00');
    const wallet = await walletOf(driver1.profileId);
    expect(wallet!.balance.minus(walletBefore).toFixed(2)).toBe('30000.00');

    const entry = await prisma.goStoreLedgerEntry.findUniqueOrThrow({
      where: { reference: res.body.reference },
      include: { wallet_transaction: true, store: true },
    });
    expect(entry.type).toBe('DRIVER_RECHARGE_DEBIT');
    expect(entry.direction).toBe('DEBIT');
    expect(entry.driver_id).toBe(driver1.profileId);
    expect(entry.wallet_transaction).not.toBeNull();
    expect(entry.wallet_transaction!.type).toBe('POS_RECHARGE');
    expect(entry.wallet_transaction!.amount.toFixed(2)).toBe('30000.00');
    expect(entry.wallet_transaction!.driver_id).toBe(driver1.profileId);
    expect(entry.wallet_transaction!.reason).toContain(res.body.reference);
    expect(entry.currency).toBe(entry.store.currency);
    expect(entry.amount.equals(entry.wallet_transaction!.amount)).toBe(true);

    // 22. Same key + same payload: same receipt, no second movement — also from another operator of the same store.
    const again = await recharge(opA, { mobile_number: local(driver1.phone), amount: '30000', currency: 'SYP' }, key).expect(200);
    expect(again.body.reference).toBe(res.body.reference);
    const viaColleague = await recharge(opA2, { mobile_number: driver1.phone, amount: '30000.00', currency: 'SYP' }, key).expect(200);
    expect(viaColleague.body.reference).toBe(res.body.reference);
    expect(viaColleague.body.replayed).toBe(true);
    expect(await storeBalance(storeA.id)).toBe('70000.00');
    expect(await prisma.goStoreLedgerEntry.count({ where: { type: 'DRIVER_RECHARGE_DEBIT', store_id: storeA.id } })).toBe(1);

    // 23. Same key + different payload: rejected.
    const reused = await recharge(opA, { mobile_number: driver1.phone, amount: '31000', currency: 'SYP' }, key);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const reusedColleague = await recharge(opA2, { mobile_number: driver1.phone, amount: '31000', currency: 'SYP' }, key);
    expect(reusedColleague.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await storeBalance(storeA.id)).toBe('70000.00');
  });

  it('20. insufficient store balance and per-recharge limit stop the recharge', async () => {
    const res = await recharge(opA, { mobile_number: driver1.phone, amount: '70000.01', currency: 'SYP' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_BALANCE_INSUFFICIENT');
    expect(res.body.available).toBe('70000.00');

    await request(app.getHttpServer())
      .patch(go(`/admin/stores/${storeA.id}`))
      .set(auth(adminToken))
      .send({ max_recharge_amount: '40000' })
      .expect(200);
    const limited = await recharge(opA, { mobile_number: driver1.phone, amount: '45000', currency: 'SYP' });
    expect(limited.body.code).toBe('RECHARGE_LIMIT_EXCEEDED');
    await request(app.getHttpServer())
      .patch(go(`/admin/stores/${storeA.id}`))
      .set(auth(adminToken))
      .send({ max_recharge_amount: '' })
      .expect(200);
    expect(await storeBalance(storeA.id)).toBe('70000.00');
  });

  it('24. concurrent recharges cannot spend the same store funds twice', async () => {
    // Store B has 50 000; five parallel 20 000 recharges across two drivers — at most two can fit.
    const results = await Promise.all(
      [driver1, driver2, driver1, driver2, driver1].map((d) =>
        recharge(opB, { mobile_number: d.phone, amount: '20000', currency: 'SYP' }),
      ),
    );
    const ok = results.filter((r) => r.status === 200);
    const failed = results.filter((r) => r.status !== 200);
    expect(ok.length).toBe(2);
    for (const f of failed) expect(['STORE_BALANCE_INSUFFICIENT', 'CONFLICT']).toContain(f.body.code);
    expect(await storeBalance(storeB.id)).toBe('10000.00');
    expect(await prisma.goStoreLedgerEntry.count({ where: { type: 'DRIVER_RECHARGE_DEBIT', store_id: storeB.id } })).toBe(2);
    expect(new Set(ok.map((r) => r.body.reference)).size).toBe(2);
  });

  it('25/30. a failure inside the transaction rolls everything back and leaves no recharge record', async () => {
    const audit = app.get(AuditService);
    const original = audit.log.bind(audit);
    const spy = jest.spyOn(audit, 'log').mockImplementation(async (entry, tx) => {
      if (entry.action === AuditAction.STORE_DRIVER_RECHARGED) throw new Error('simulated failure after debit and credit');
      return original(entry, tx);
    });
    const walletBefore = (await walletOf(driver1.profileId))!.balance.toFixed(2);
    const posTxBefore = await prisma.goDriverWalletTransaction.count({ where: { driver_id: driver1.profileId, type: 'POS_RECHARGE' } });
    const key = randomUUID();
    const body = { mobile_number: driver1.phone, amount: '10000', currency: 'SYP' };
    try {
      const res = await recharge(opA, body, key);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|SELECT|go_store/i);
    } finally {
      spy.mockRestore();
    }
    expect(await storeBalance(storeA.id)).toBe('70000.00');
    expect((await walletOf(driver1.profileId))!.balance.toFixed(2)).toBe(walletBefore);
    expect(await prisma.goDriverWalletTransaction.count({ where: { driver_id: driver1.profileId, type: 'POS_RECHARGE' } })).toBe(posTxBefore);
    expect(await prisma.goStoreLedgerEntry.count({ where: { store_id: storeA.id, idempotency_key: key } })).toBe(0);

    // Retrying the same key after the failure performs the recharge exactly once.
    const retry = await recharge(opA, body, key).expect(200);
    expect(retry.body.replayed).toBe(false);
    expect(await storeBalance(storeA.id)).toBe('60000.00');
  });

  it('33. a notification failure does not fail or repeat the financial transaction', async () => {
    const realtime = app.get(RealtimeService);
    const spy = jest.spyOn(realtime, 'emitToDriver').mockImplementation(() => {
      throw new Error('push gateway down');
    });
    const key = randomUUID();
    const body = { mobile_number: driver1.phone, amount: '5000', currency: 'SYP' };
    try {
      const res = await recharge(opA, body, key).expect(200);
      const again = await recharge(opA, body, key).expect(200);
      expect(again.body.reference).toBe(res.body.reference);
    } finally {
      spy.mockRestore();
    }
    expect(await storeBalance(storeA.id)).toBe('55000.00');
    expect(await prisma.goStoreLedgerEntry.count({ where: { store_id: storeA.id, idempotency_key: key } })).toBe(1);
  });

  // ---------------------------------------------------------------- isolation and permissions

  it('27. operators only see their own store', async () => {
    await request(app.getHttpServer())
      .get(go(`/pos/transactions/${firstRecharge.reference}`))
      .set(auth(opB))
      .expect(404);
    const mine = await request(app.getHttpServer()).get(go('/pos/transactions')).set(auth(opB)).expect(200);
    expect(mine.body.total).toBe(2);
    expect(mine.body.data.every((r: { store: { code: string } }) => r.store.code === storeB.code)).toBe(true);
    const own = await request(app.getHttpServer())
      .get(go(`/pos/transactions/${firstRecharge.reference}`))
      .set(auth(opA))
      .expect(200);
    expect(own.body.reference).toBe(firstRecharge.reference);
    for (const path of ['/admin/stores', `/admin/stores/${storeB.id}`, `/admin/stores/${storeB.id}/ledger`, '/erp/wallets']) {
      await request(app.getHttpServer()).get(go(path)).set(auth(opA)).expect(403);
    }
  });

  it('28. operators cannot change any balance', async () => {
    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-credits`))
      .set(auth(opA))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '1000000', currency: 'SYP' })
      .expect(403);
    await request(app.getHttpServer())
      .post(go(`/admin/stores/${storeA.id}/balance-adjustments`))
      .set(auth(opA))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '1000', direction: 'CREDIT', currency: 'SYP', reason: 'self credit' })
      .expect(403);
    await request(app.getHttpServer()).patch(go(`/admin/stores/${storeA.id}`)).set(auth(opA)).send({ name: 'Mine' }).expect(403);
    await request(app.getHttpServer())
      .post(go(`/erp/wallets/${driver1.profileId}/top-up`))
      .set(auth(opA))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 1000, reason: 'nope' })
      .expect(403);
    expect(await storeBalance(storeA.id)).toBe('55000.00');
  });

  it('29. financial reports are closed to unauthorized users', async () => {
    for (const token of [csToken, walletOpToken, opA, driver1.token]) {
      await request(app.getHttpServer()).get(go('/admin/stores/reconciliation')).set(auth(token)).expect(403);
      await request(app.getHttpServer()).get(go('/admin/stores/overview')).set(auth(token)).expect(403);
    }
    await request(app.getHttpServer()).get(go('/admin/stores/overview')).expect(401);
  });

  // ---------------------------------------------------------------- suspension

  it('4-6. a suspended store cannot recharge but keeps its history', async () => {
    await request(app.getHttpServer())
      .patch(go(`/admin/stores/${storeA.id}/status`))
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED', reason: 'compliance check' })
      .expect(200);
    const res = await recharge(opA, { mobile_number: driver1.phone, amount: '1000', currency: 'SYP' });
    expect(res.body.code).toBe('STORE_SUSPENDED');
    const lookup = await request(app.getHttpServer())
      .post(go('/pos/drivers/lookup'))
      .set(auth(opA))
      .send({ mobile_number: driver1.phone })
      .expect(200);
    expect(lookup.body.rechargeable).toBe(false);
    expect(lookup.body.reasons).toContain('STORE_SUSPENDED');

    const history = await request(app.getHttpServer()).get(go('/pos/transactions')).set(auth(opA)).expect(200);
    expect(history.body.total).toBe(3);
    const ledger = await request(app.getHttpServer()).get(go(`/admin/stores/${storeA.id}/ledger`)).set(auth(financeToken)).expect(200);
    expect(ledger.body.total).toBe(4);
    const audit = await request(app.getHttpServer()).get(go(`/admin/stores/${storeA.id}/audit`)).set(auth(financeToken)).expect(200);
    expect(audit.body.data.some((a: { action: string }) => a.action === AuditAction.STORE_STATUS_CHANGED)).toBe(true);
    expect(await storeBalance(storeA.id)).toBe('55000.00');

    const reactivated = await request(app.getHttpServer())
      .patch(go(`/admin/stores/${storeA.id}/status`))
      .set(auth(adminToken))
      .send({ status: 'ACTIVE', reason: '  ' })
      .expect(200);
    expect(reactivated.body.status).toBe('ACTIVE');
    expect(reactivated.body.status_reason).toBeNull();
  });

  // ---------------------------------------------------------------- driver app

  it('31/32. the driver sees the recharge and the authoritative wallet balance', async () => {
    const history = await request(app.getHttpServer())
      .get(go('/driver/wallet/pos-recharges'))
      .set(auth(driver1.token))
      .expect(200);
    const refs = history.body.data.map((r: { reference: string }) => r.reference);
    expect(refs).toContain(firstRecharge.reference);
    const first = history.body.data.find((r: { reference: string }) => r.reference === firstRecharge.reference);
    expect(first).toMatchObject({ type: 'POS_RECHARGE', amount: '30000.00', currency: 'SYP', status: 'COMPLETED', store_name: 'Store A' });

    const wallet = await request(app.getHttpServer()).get(go('/driver/wallet')).set(auth(driver1.token)).expect(200);
    const db = await walletOf(driver1.profileId);
    expect(wallet.body.balance).toBe(Number(db!.balance));
    // Operators cannot read driver histories.
    await request(app.getHttpServer()).get(go('/driver/wallet/pos-recharges')).set(auth(opA)).expect(403);
  });

  // ---------------------------------------------------------------- reversal

  it('reversal returns the exact amount to the store once, and only while the driver still holds it', async () => {
    const entry = await prisma.goStoreLedgerEntry.findUniqueOrThrow({ where: { reference: firstRecharge.reference } });

    // The generic wallet reversal must not be used for store recharges.
    const generic = await request(app.getHttpServer())
      .post(go(`/erp/wallet-transactions/${entry.wallet_transaction_id}/reverse`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'should be refused' });
    expect(generic.body.code).toBe('CONFLICT');

    await request(app.getHttpServer())
      .post(go(`/admin/stores/ledger/${entry.id}/reverse`))
      .set(auth(financeToken))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'customer error' })
      .expect(403);

    const walletBefore = (await walletOf(driver1.profileId))!.balance;
    const rev = await request(app.getHttpServer())
      .post(go(`/admin/stores/ledger/${entry.id}/reverse`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'wrong driver' })
      .expect(200);
    expect(rev.body.entry).toMatchObject({ type: 'REVERSAL_CREDIT', amount: '30000.00', reversed_entry: { id: entry.id } });
    expect(await storeBalance(storeA.id)).toBe('85000.00');
    expect(walletBefore.minus((await walletOf(driver1.profileId))!.balance).toFixed(2)).toBe('30000.00');

    const twice = await request(app.getHttpServer())
      .post(go(`/admin/stores/ledger/${entry.id}/reverse`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'again please' });
    expect(twice.body.code).toBe('CONFLICT');
    expect(await storeBalance(storeA.id)).toBe('85000.00');

    // Driver spends the money (withdrawal) → reversing another recharge is refused, nothing moves.
    const other = await prisma.goStoreLedgerEntry.findFirstOrThrow({
      where: { store_id: storeA.id, type: 'DRIVER_RECHARGE_DEBIT', reversal: { is: null } },
    });
    const available = (await walletOf(driver1.profileId))!.balance;
    await request(app.getHttpServer())
      .post(go(`/erp/wallets/${driver1.profileId}/withdraw`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ amount: Number(available), reason: 'cash out for test' })
      .expect(200);
    const spent = await request(app.getHttpServer())
      .post(go(`/admin/stores/ledger/${other.id}/reverse`))
      .set(auth(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'too late now' });
    expect(spent.body.code).toBe('WALLET_INSUFFICIENT_BALANCE');
    expect(await storeBalance(storeA.id)).toBe('85000.00');

    const receipt = await request(app.getHttpServer())
      .get(go(`/pos/transactions/${firstRecharge.reference}`))
      .set(auth(opA))
      .expect(200);
    expect(receipt.body.status).toBe('REVERSED');
  });

  // ---------------------------------------------------------------- database guarantees

  it('the ledger is append-only and balances can never go negative at the database level', async () => {
    const entry = await prisma.goStoreLedgerEntry.findFirstOrThrow({ where: { store_id: storeA.id } });
    await expect(
      prisma.$executeRaw`UPDATE go_store_ledger_entries SET amount = 1 WHERE id = ${entry.id}`,
    ).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM go_store_ledger_entries WHERE id = ${entry.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE go_stores SET balance = -1 WHERE id = ${storeA.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM go_stores WHERE id = ${storeA.id}`).rejects.toThrow();
    expect(await storeBalance(storeA.id)).toBe('85000.00');
  });

  it('reconciliation finds no discrepancies after all of the above', async () => {
    const res = await request(app.getHttpServer()).get(go('/admin/stores/reconciliation')).set(auth(financeToken)).expect(200);
    const failing = res.body.checks.filter((c: { ok: boolean }) => !c.ok);
    expect(failing).toEqual([]);
    expect(res.body.ok).toBe(true);
  });
});

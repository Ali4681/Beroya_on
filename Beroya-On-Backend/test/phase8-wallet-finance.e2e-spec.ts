import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { createE2eApp, go } from './helpers/e2e-app';

async function waitForOffer(
  app: INestApplication,
  driverToken: string,
  rideId: string,
  timeoutMs = 8000,
): Promise<{ id: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(app.getHttpServer())
      .get(go('/driver/offers'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    const hit = (res.body as { id: string; ride_id: string }[]).find((o) => o.ride_id === rideId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No offer for ${rideId}`);
}

describe('Phase 8 — Wallet / Finance (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let driverToken: string;
  let walletOpToken: string;
  let financeToken: string;
  let cssupToken: string;
  let adminToken: string;
  let categoryId: string;
  let driverProfileId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    categoryId = (await request(app.getHttpServer()).get(go('/customer/ride-categories')).expect(200)).body[0]
      .id;

    walletOpToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'wallet.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
    financeToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'finance@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
    cssupToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'cssup.dam@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'admin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963911111111', app: 'CUSTOMER' })
      .expect(200);
    customerToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: '+963911111111', app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963922222222', app: 'DRIVER' })
      .expect(200);
    driverToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: '+963922222222', app: 'DRIVER', code: '123456' })
        .expect(200)
    ).body.access_token;

    const elig = await request(app.getHttpServer())
      .get(go('/driver/eligibility'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(elig.body.wallet_balance).not.toBeNull();

    // Resolve driver profile id via admin drivers list or wallet top-up target from seed phone
    const drivers = await request(app.getHttpServer())
      .get(go('/erp/drivers'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const demo = (drivers.body as { id: string; user?: { phone?: string } }[]).find(
      (d) => d.user?.phone === '+963922222222',
    );
    driverProfileId = demo?.id ?? drivers.body[0]?.id;
    expect(driverProfileId).toBeTruthy();

    await request(app.getHttpServer())
      .post(go('/driver/availability/online'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go('/driver/location'))
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    await clearActiveCustomerRide(app, customerToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('wallet config + top-up + reverse + driver wallet view', async () => {
    const cfg = await request(app.getHttpServer())
      .get(go('/admin/wallet-config'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(cfg.body.commission_percentage)).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(go('/admin/wallet-config'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ commission_percentage: 10, low_balance_amount: 5000 })
      .expect(200);

    const before = await request(app.getHttpServer())
      .get(go('/driver/wallet'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    const balBefore = Number(before.body.balance);

    const top = await request(app.getHttpServer())
      .post(go(`/erp/wallets/${driverProfileId}/top-up`))
      .set('Authorization', `Bearer ${walletOpToken}`)
      .set('Idempotency-Key', `e2e-p8-top-${randomUUID()}`)
      .send({ amount: 25000, reason: 'e2e topup' })
      .expect(200);
    expect(top.body.type).toBe('TOP_UP');

    const after = await request(app.getHttpServer())
      .get(go('/driver/wallet'))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(Number(after.body.balance)).toBe(balBefore + 25000);
    expect(after.body.estimated_remaining_rides).toBeGreaterThanOrEqual(0);

    const rev = await request(app.getHttpServer())
      .post(go(`/erp/wallet-transactions/${top.body.id}/reverse`))
      .set('Authorization', `Bearer ${walletOpToken}`)
      .set('Idempotency-Key', `e2e-p8-rev-${randomUUID()}`)
      .send({ reason: 'mistake' })
      .expect(200);
    expect(rev.body.type).toBe('REVERSAL');

    await request(app.getHttpServer())
      .post(go(`/erp/wallet-transactions/${top.body.id}/reverse`))
      .set('Authorization', `Bearer ${walletOpToken}`)
      .set('Idempotency-Key', `e2e-p8-rev2-${randomUUID()}`)
      .send({ reason: 'again' })
      .expect(409);
  });

  it('commission hold + deduct on complete + compensation allocation', async () => {
    const walletBefore = (
      await request(app.getHttpServer())
        .get(go('/driver/wallet'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200)
    ).body;

    const created = await request(app.getHttpServer())
      .post(go('/customer/rides'))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-p8-${randomUUID()}`)
      .send({
        ride_category_id: categoryId,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
        payment_method: 'CASH',
      })
      .expect(201);
    const offer = await waitForOffer(app, driverToken, created.body.id);
    await request(app.getHttpServer())
      .post(go(`/driver/offers/${offer.id}/accept`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p8-acc-${randomUUID()}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/arrive`))
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/start`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p8-start-${randomUUID()}`)
      .send({ lat: 33.5, lng: 36.3 })
      .expect(200);

    const ended = await request(app.getHttpServer())
      .post(go(`/driver/rides/${created.body.id}/end`))
      .set('Authorization', `Bearer ${driverToken}`)
      .set('Idempotency-Key', `e2e-p8-end-${randomUUID()}`)
      .send({ lat: 33.52, lng: 36.32 })
      .expect(200);
    expect(ended.body.commission_deducted).toBeGreaterThan(0);

    const walletAfter = (
      await request(app.getHttpServer())
        .get(go('/driver/wallet'))
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200)
    ).body;
    expect(Number(walletAfter.balance)).toBeLessThan(Number(walletBefore.balance));

    const comp = await request(app.getHttpServer())
      .post(go(`/erp/rides/${created.body.id}/compensation`))
      .set('Authorization', `Bearer ${cssupToken}`)
      .send({ type: 'FIXED_AMOUNT', fixed_amount: 100, reason: 'goodwill' })
      .expect(201);

    await request(app.getHttpServer())
      .post(go(`/erp/finance/compensations/${comp.body.id}/allocation`))
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ bearer: 'BEROYA', beroya_share: 100, driver_share: 0 })
      .expect(200);

    await clearActiveCustomerRide(app, customerToken);
  });
});

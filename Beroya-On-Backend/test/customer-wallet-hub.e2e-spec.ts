import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

const SENDER = '+963955508801';
const RECIPIENT = '+963955508802';

describe('Customer wallet hub (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let senderToken: string;
  let recipientToken: string;
  let senderCustomerId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    adminToken = (
      await request(app.getHttpServer())
        .post(go('/auth/staff/login'))
        .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
        .expect(200)
    ).body.access_token;

    await clearOtpPhones([SENDER, RECIPIENT]);

    await request(app.getHttpServer()).post(go('/auth/otp/request')).send({ phone: SENDER, app: 'CUSTOMER' }).expect(200);
    senderToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: SENDER, app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;

    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: RECIPIENT, app: 'CUSTOMER' })
      .expect(200);
    recipientToken = (
      await request(app.getHttpServer())
        .post(go('/auth/otp/verify'))
        .send({ phone: RECIPIENT, app: 'CUSTOMER', code: '123456' })
        .expect(200)
    ).body.access_token;

    const me = await request(app.getHttpServer())
      .get(go('/auth/me'))
      .set('Authorization', `Bearer ${senderToken}`)
      .expect(200);
    senderCustomerId = me.body.customer_id ?? me.body.profile_id ?? me.body.id;

    // Ensure sender has a wallet row via GET
    await request(app.getHttpServer())
      .get(go('/customer/wallet'))
      .set('Authorization', `Bearer ${senderToken}`)
      .expect(200);

    const erpList = await request(app.getHttpServer())
      .get(go('/erp/customer-wallets'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (erpList.body as { customer?: { id: string }; customer_id?: string }[]).find(
      (w) => w.customer?.id === senderCustomerId || (w as { customer: { user?: { phone: string } } }).customer,
    );
    // Resolve customer id from profile list if /auth/me shape differs
    const wallets = erpList.body as { customer: { id: string; user: { phone: string } } }[];
    const senderWallet = wallets.find((w) => w.customer?.user?.phone === SENDER);
    if (senderWallet) senderCustomerId = senderWallet.customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET wallet returns month stats; redeem + transfer work with idempotency', async () => {
    const server = app.getHttpServer();

    const summary = await request(server)
      .get(go('/customer/wallet'))
      .set('Authorization', `Bearer ${senderToken}`)
      .expect(200);
    expect(summary.body).toMatchObject({
      currency: 'SYP',
      month: {
        year: expect.any(Number),
        month: expect.any(Number),
        added: expect.any(Number),
        consumed: expect.any(Number),
      },
    });
    expect(summary.body.balance).toBeGreaterThanOrEqual(0);

    const code = `E2E${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`;
    const dashed = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;

    await request(server)
      .post(go('/erp/wallet-vouchers'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: dashed, amount: 10000 })
      .expect(201);

    const redeemKey = `e2e-redeem-${randomUUID()}`;
    const redeemed = await request(server)
      .post(go('/customer/wallet/redeem'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', redeemKey)
      .send({ code: dashed })
      .expect(200);
    expect(redeemed.body).toMatchObject({
      currency: 'SYP',
      credited: 10000,
      code: dashed,
      transaction_id: expect.any(String),
    });
    const afterRedeem = redeemed.body.balance as number;

    const redeemAgain = await request(server)
      .post(go('/customer/wallet/redeem'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', redeemKey)
      .send({ code: dashed })
      .expect(200);
    expect(redeemAgain.body.transaction_id).toBe(redeemed.body.transaction_id);
    expect(redeemAgain.body.balance).toBe(afterRedeem);

    await request(server)
      .post(go('/customer/wallet/redeem'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', `e2e-redeem-dup-${randomUUID()}`)
      .send({ code: dashed })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('WALLET_CODE_ALREADY_USED');
      });

    await request(server)
      .post(go('/customer/wallet/transfer'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', `e2e-xfer-self-${randomUUID()}`)
      .send({ recipient_phone: SENDER, amount: 1000 })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('TRANSFER_TO_SELF');
      });

    await request(server)
      .post(go('/customer/wallet/transfer'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', `e2e-xfer-unknown-${randomUUID()}`)
      .send({ recipient_phone: '+963900000099', amount: 1000 })
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('RECIPIENT_NOT_FOUND');
      });

    const transferKey = `e2e-xfer-${randomUUID()}`;
    const transferred = await request(server)
      .post(go('/customer/wallet/transfer'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', transferKey)
      .send({ recipient_phone: RECIPIENT, amount: 4000 })
      .expect(200);
    expect(transferred.body.transferred).toBe(4000);
    expect(transferred.body.balance).toBe(afterRedeem - 4000);
    expect(transferred.body.recipient.phone_masked).toContain('*');

    const transferReplay = await request(server)
      .post(go('/customer/wallet/transfer'))
      .set('Authorization', `Bearer ${senderToken}`)
      .set('Idempotency-Key', transferKey)
      .send({ recipient_phone: RECIPIENT, amount: 4000 })
      .expect(200);
    expect(transferReplay.body.transaction_id).toBe(transferred.body.transaction_id);

    const recipientWallet = await request(server)
      .get(go('/customer/wallet'))
      .set('Authorization', `Bearer ${recipientToken}`)
      .expect(200);
    expect(recipientWallet.body.balance).toBeGreaterThanOrEqual(4000);
    expect(recipientWallet.body.month.added).toBeGreaterThanOrEqual(4000);

    const senderMonth = await request(server)
      .get(go('/customer/wallet'))
      .set('Authorization', `Bearer ${senderToken}`)
      .expect(200);
    expect(senderMonth.body.month.added).toBeGreaterThanOrEqual(10000);
    expect(senderMonth.body.month.consumed).toBeGreaterThanOrEqual(4000);
  });
});

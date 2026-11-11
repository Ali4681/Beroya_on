import { INestApplication } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import request from 'supertest';
import { clearActiveCustomerRide } from './helpers/clear-active-ride';
import { clearOtpPhones } from './helpers/clear-otp';
import { createE2eApp, go } from './helpers/e2e-app';

// 1x1 transparent PNG
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DRIVER_PHONE = '+963922222222';
const randomPhone = () => `+9639${String(randomInt(10_000_000, 99_999_999))}`;

function box(type: string, ...parts: Buffer[]) {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/** Smallest m4a the server accepts: ftyp + moov/mvhd with the given length, plus a dummy mdat. */
function m4a(seconds: number) {
  const ftyp = box('ftyp', Buffer.from('M4A \0\0\0\0M4A mp42isom', 'latin1'));
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  return Buffer.concat([ftyp, box('moov', box('mvhd', mvhd)), box('mdat', randomBytes(64))]).toString('base64');
}

const clientId = () => randomBytes(16).toString('hex');

describe('Ride chat between customer and driver (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let driver: { Authorization: string };

  const otpLogin = async (phone: string, appName: 'CUSTOMER' | 'DRIVER') => {
    const server = app.getHttpServer();
    await request(server).post(go('/auth/otp/request')).send({ phone, app: appName }).expect(200);
    const res = await request(server).post(go('/auth/otp/verify')).send({ phone, app: appName, code: '123456' }).expect(200);
    return { Authorization: `Bearer ${res.body.access_token}` };
  };

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post(go('/auth/staff/login'))
      .send({ identifier: 'superadmin@beroyaon.com', password: 'Beroya@12345' })
      .expect(200);
    admin = { Authorization: `Bearer ${login.body.access_token}` };
    await clearOtpPhones([DRIVER_PHONE]);
    driver = await otpLogin(DRIVER_PHONE, 'DRIVER');
  });

  afterAll(async () => {
    await app.close();
  });

  it('exchanges text, image and voice between the two parties of an active ride only', async () => {
    const server = app.getHttpServer();
    const customerPhone = randomPhone();
    const strangerPhone = randomPhone();
    await clearOtpPhones([customerPhone, strangerPhone]);
    const customer = await otpLogin(customerPhone, 'CUSTOMER');
    const stranger = await otpLogin(strangerPhone, 'CUSTOMER');
    await clearActiveCustomerRide(app, customer.Authorization.slice(7));

    const drivers = await request(server).get(go('/erp/drivers')).set(admin).expect(200);
    const profile = drivers.body.find((d: { user: { phone: string } }) => d.user.phone === DRIVER_PHONE);
    const cats = await request(server).get(go('/customer/ride-categories')).expect(200);
    const economy = cats.body.find((c: { code: string }) => c.code === 'ECONOMY');
    const created = await request(server)
      .post(go('/customer/rides'))
      .set(customer)
      .set('Idempotency-Key', `e2e-chat-${randomUUID()}`)
      .send({
        ride_category_id: economy.id,
        type: 'IMMEDIATE',
        pickup: { lat: 33.5, lng: 36.3 },
        destination: { lat: 33.52, lng: 36.32 },
      })
      .expect(201);
    const rideId = created.body.id as string;
    const customerChat = go(`/customer/rides/${rideId}/messages`);
    const driverChat = go(`/driver/rides/${rideId}/messages`);

    try {
      const tooEarly = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: clientId(), type: 'TEXT', text: 'مرحبا' })
        .expect(409);
      expect(tooEarly.body.code).toBe('RIDE_NOT_ACTIVE');

      await request(server)
        .post(go(`/erp/rides/${rideId}/assign`))
        .set(admin)
        .set('Idempotency-Key', `e2e-chat-assign-${randomUUID()}`)
        .send({ driver_id: profile.id })
        .expect(200);

      // Text + idempotent resend
      const cid = clientId();
      const first = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: cid.toUpperCase(), type: 'TEXT', text: '  انا بالموقف  ' })
        .expect(201);
      expect(first.body).toMatchObject({
        client_id: cid,
        ride_id: rideId,
        sender_role: 'CUSTOMER',
        type: 'TEXT',
        text: 'انا بالموقف',
        media_url: null,
        duration_sec: null,
        read_at: null,
      });
      const again = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: cid, type: 'TEXT', text: 'انا بالموقف' })
        .expect(201);
      expect(again.body.id).toBe(first.body.id);

      // Image from the driver
      const image = await request(server)
        .post(driverChat)
        .set(driver)
        .send({ client_id: clientId(), type: 'IMAGE', data_url: `data:image/png;base64,${PNG}` })
        .expect(201);
      expect(image.body).toMatchObject({ sender_role: 'DRIVER', type: 'IMAGE', text: null, duration_sec: null });
      expect(image.body.media_url).toMatch(/^\/api\/v1\/go\/media\/chat\/[0-9a-f-]{36}\.png$/);

      // Voice from the customer: duration comes from the file
      const voice = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: clientId(), type: 'VOICE', data_url: `data:audio/mp4;base64,${m4a(12.3)}`, duration_sec: 30 })
        .expect(201);
      expect(voice.body).toMatchObject({ type: 'VOICE', text: null, duration_sec: 12 });
      expect(voice.body.media_url).toMatch(/\.m4a$/);

      // Validation
      const invalid = async (body: Record<string, unknown>, field: string) => {
        const res = await request(server).post(customerChat).set(customer).send(body).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
      };
      await invalid({ client_id: 'xyz', type: 'TEXT', text: 'hi' }, 'client_id');
      await invalid({ client_id: clientId(), type: 'TEXT', text: 'x'.repeat(1001) }, 'text');
      await invalid({ client_id: clientId(), type: 'TEXT', text: '   ' }, 'text');
      await invalid({ client_id: clientId(), type: 'IMAGE', text: 'caption', data_url: PNG }, 'text');
      await invalid({ client_id: clientId(), type: 'IMAGE', data_url: m4a(5) }, 'data_url');
      await invalid({ client_id: clientId(), type: 'VOICE', data_url: PNG, duration_sec: 3 }, 'data_url');
      await invalid({ client_id: clientId(), type: 'VOICE', data_url: m4a(75) }, 'data_url');
      await invalid({ client_id: clientId(), type: 'VOICE', data_url: m4a(5), duration_sec: 61 }, 'duration_sec');

      // Listing, ordering, after_id, unread badge
      const all = await request(server).get(driverChat).set(driver).expect(200);
      expect(all.body.items.map((m: { id: string }) => m.id)).toEqual([first.body.id, image.body.id, voice.body.id]);
      expect(all.body.unread_count).toBe(2); // customer text + voice still unread for driver
      const newer = await request(server).get(driverChat).query({ after_id: first.body.id }).set(driver).expect(200);
      expect(newer.body.items.map((m: { id: string }) => m.id)).toEqual([image.body.id, voice.body.id]);
      expect(newer.body.unread_count).toBe(2);
      const page = await request(server).get(customerChat).query({ limit: 1 }).set(customer).expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.unread_count).toBe(1); // driver image unread for customer

      // Media: both parties yes, anyone else no
      const voiceFile = await request(server).get(voice.body.media_url).set(driver).expect(200);
      expect(voiceFile.headers['content-type']).toContain('audio/mp4');
      const imageFile = await request(server).get(image.body.media_url).set(customer).expect(200);
      expect(imageFile.headers['content-type']).toContain('image/png');
      await request(server).get(image.body.media_url).set(stranger).expect(404);
      await request(server).get(go('/media/chat/..%2F..%2F.env')).set(customer).expect(404);

      // Strangers cannot read or post
      const hidden = await request(server).get(customerChat).set(stranger).expect(404);
      expect(hidden.body.code).toBe('RIDE_NOT_FOUND');
      await request(server)
        .post(customerChat)
        .set(stranger)
        .send({ client_id: clientId(), type: 'TEXT', text: 'hi' })
        .expect(404);

      // Read receipts only touch the other party's messages
      const read = await request(server)
        .post(go(`/driver/rides/${rideId}/messages/read`))
        .set(driver)
        .send({ up_to_id: voice.body.id })
        .expect(200);
      expect(read.body).toMatchObject({
        ride_id: rideId,
        reader_role: 'DRIVER',
        up_to_id: voice.body.id,
        updated: 2,
        unread_count: 0,
      });
      const driverList = await request(server).get(driverChat).set(driver).expect(200);
      expect(driverList.body.unread_count).toBe(0);
      const afterRead = await request(server).get(customerChat).set(customer).expect(200);
      const byId = new Map(afterRead.body.items.map((m: { id: string; read_at: string | null }) => [m.id, m.read_at]));
      expect(byId.get(first.body.id)).not.toBeNull();
      expect(byId.get(voice.body.id)).not.toBeNull();
      expect(byId.get(image.body.id)).toBeNull();

      // Closed ride: reading stays, sending stops
      await request(server).post(go(`/driver/rides/${rideId}/arrive`)).set(driver).expect(200);
      await request(server)
        .post(go(`/driver/rides/${rideId}/start`))
        .set(driver)
        .set('Idempotency-Key', `e2e-chat-start-${randomUUID()}`)
        .send({ lat: 33.5, lng: 36.3 })
        .expect(200);
      await request(server)
        .post(driverChat)
        .set(driver)
        .send({ client_id: clientId(), type: 'TEXT', text: 'وصلنا تقريباً' })
        .expect(201);
      await request(server)
        .post(go(`/driver/rides/${rideId}/end`))
        .set(driver)
        .set('Idempotency-Key', `e2e-chat-end-${randomUUID()}`)
        .send({ lat: 33.52, lng: 36.32 })
        .expect(200);
      const closed = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: clientId(), type: 'TEXT', text: 'شكراً' })
        .expect(409);
      expect(closed.body.code).toBe('RIDE_NOT_ACTIVE');
      const replay = await request(server)
        .post(customerChat)
        .set(customer)
        .send({ client_id: cid, type: 'TEXT', text: 'انا بالموقف' })
        .expect(201);
      expect(replay.body.id).toBe(first.body.id);
      const history = await request(server).get(customerChat).set(customer).expect(200);
      expect(history.body.items).toHaveLength(4);
    } finally {
      await clearActiveCustomerRide(app, customer.Authorization.slice(7));
      await request(server).post(go('/driver/availability/online')).set(driver);
    }
  });
});

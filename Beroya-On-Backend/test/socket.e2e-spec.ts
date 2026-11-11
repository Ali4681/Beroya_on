import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { NAMESPACES } from '../src/infra/realtime/rooms';
import { createE2eApp, go } from './helpers/e2e-app';

function connectCustomer(port: number, token: string): Promise<{ socket: Socket; connected: { user_id: string; role: string } }> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}${NAMESPACES.CUSTOMER}`, {
      transports: ['websocket'],
      auth: { token },
    });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 10_000);
    socket.once('connected', (payload: { user_id: string; role: string }) => {
      clearTimeout(timer);
      resolve({ socket, connected: payload });
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe('Phase 0 — Socket.IO (e2e)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await createE2eApp();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('customer namespace: connected + system.ping', async () => {
    await request(app.getHttpServer())
      .post(go('/auth/otp/request'))
      .send({ phone: '+963911111111', app: 'CUSTOMER' })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post(go('/auth/otp/verify'))
      .send({ phone: '+963911111111', app: 'CUSTOMER', code: '123456' })
      .expect(200);
    const token = verify.body.access_token as string;

    const { socket, connected } = await connectCustomer(port, token);
    expect(connected.role).toBe('CUSTOMER');

    const pong = await new Promise<{ pong: boolean }>((resolve, reject) => {
      socket.emit('system.ping', {}, (ack: { pong: boolean }) => {
        if (ack?.pong) resolve(ack);
        else reject(new Error('bad ack'));
      });
      setTimeout(() => reject(new Error('ping timeout')), 5000);
    });
    expect(pong.pong).toBe(true);
    socket.disconnect();
  });
});

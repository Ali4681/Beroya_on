import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { go } from './e2e-app';

/** Cancel every current (live or scheduled) customer ride — keeps e2e suites isolated on shared DB. */
export async function clearActiveCustomerRide(app: INestApplication, customerToken: string) {
  const current = await request(app.getHttpServer())
    .get(go('/customer/rides'))
    .query({ scope: 'current', limit: 50 })
    .set('Authorization', `Bearer ${customerToken}`);
  const ids = ((current.body?.items ?? []) as { id: string }[]).map((r) => r.id);
  for (const id of ids) {
    await request(app.getHttpServer())
      .post(go(`/customer/rides/${id}/cancel`))
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `e2e-clear-${randomUUID()}`);
  }
}

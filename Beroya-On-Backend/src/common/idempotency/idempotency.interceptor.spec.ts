import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@/generated/prisma/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { GoErrorCode } from '../errors/go-error-codes';
import { IdempotencyInterceptor } from './idempotency.interceptor';

type Row = {
  id: string;
  key: string;
  user_id: string;
  request_hash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  response_status: number | null;
  response_body: unknown;
  expires_at: Date;
};

function harness() {
  const rows = new Map<string, Row>();
  let seq = 0;
  const prisma = {
    goIdempotencyKey: {
      findUnique: ({ where }: { where: { user_id_key: { user_id: string; key: string } } }) =>
        Promise.resolve(rows.get(`${where.user_id_key.user_id}:${where.user_id_key.key}`) ?? null),
      create: ({ data }: { data: Omit<Row, 'id' | 'status' | 'response_status' | 'response_body'> }) => {
        const k = `${data.user_id}:${data.key}`;
        if (rows.has(k)) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
          );
        }
        const row: Row = { ...data, id: `r${++seq}`, status: 'IN_PROGRESS', response_status: null, response_body: null };
        rows.set(k, row);
        return Promise.resolve(row);
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = [...rows.values()].find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      },
      delete: ({ where }: { where: { id: string } }) => {
        for (const [k, r] of rows) if (r.id === where.id) rows.delete(k);
        return Promise.resolve();
      },
    },
  };
  const reflector = {
    get: (key: string) => (key === 'go:idempotent' ? { required: true, ttlSeconds: 3600 } : undefined),
  } as unknown as Reflector;
  const interceptor = new IdempotencyInterceptor(reflector, prisma as never);

  function context(body: unknown, key = 'key-12345678') {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 0,
      headers,
      setHeader: (k: string, v: string) => (headers[k] = v),
      status(code: number) {
        this.statusCode = code;
        return this;
      },
    };
    const req = { headers: { 'idempotency-key': key }, user: { id: 'u1' }, originalUrl: '/wallet/top-up', method: 'POST', body };
    const ctx = {
      getType: () => 'http',
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    };
    return { ctx: ctx as never, res };
  }

  return { interceptor, context, rows };
}

describe('IdempotencyInterceptor', () => {
  it('runs the handler once and replays the stored response for a retry', async () => {
    const { interceptor, context } = harness();
    let calls = 0;
    const handler = { handle: () => of({ ok: true, n: ++calls }) };

    const first = await lastValueFrom(await interceptor.intercept(context({ amount: 10 }).ctx, handler));
    const retry = context({ amount: 10 });
    const second = await lastValueFrom(await interceptor.intercept(retry.ctx, handler));

    expect(first).toEqual({ ok: true, n: 1 });
    expect(second).toEqual({ ok: true, n: 1 });
    expect(calls).toBe(1);
    expect(retry.res.headers['Idempotent-Replayed']).toBe('true');
    expect(retry.res.statusCode).toBe(HttpStatus.CREATED);
  });

  it('rejects the same key with a different body', async () => {
    const { interceptor, context } = harness();
    const handler = { handle: () => of({ ok: true }) };
    await lastValueFrom(await interceptor.intercept(context({ amount: 10 }).ctx, handler));
    await expect(interceptor.intercept(context({ amount: 99 }).ctx, handler)).rejects.toMatchObject({
      code: GoErrorCode.IDEMPOTENCY_KEY_REUSED,
    });
  });

  it('reports in-progress instead of running a concurrent duplicate', async () => {
    const { interceptor, context } = harness();
    let calls = 0;
    const slow = { handle: () => (calls++, of({ ok: true })) };
    const pending = await interceptor.intercept(context({ amount: 10 }).ctx, slow);
    await expect(interceptor.intercept(context({ amount: 10 }).ctx, slow)).rejects.toMatchObject({
      code: GoErrorCode.IDEMPOTENCY_IN_PROGRESS,
    });
    await lastValueFrom(pending);
    expect(calls).toBe(1);
  });

  it('forgets a failed attempt so the same key can be retried', async () => {
    const { interceptor, context, rows } = harness();
    const failing = { handle: () => throwError(() => new Error('boom')) };
    await expect(lastValueFrom(await interceptor.intercept(context({ amount: 10 }).ctx, failing))).rejects.toThrow('boom');
    expect(rows.size).toBe(0);
    const ok = await lastValueFrom(await interceptor.intercept(context({ amount: 10 }).ctx, { handle: () => of({ ok: 1 }) }));
    expect(ok).toEqual({ ok: 1 });
  });

  it('maps a concurrent insert race (P2002) to in-progress', async () => {
    const { interceptor, context, rows } = harness();
    const { ctx } = context({ amount: 10 });
    const originalGet = rows.get.bind(rows);
    let raced = false;
    rows.get = (k: string) => {
      if (!raced) {
        raced = true;
        rows.set(k, {
          id: 'other',
          key: 'key-12345678',
          user_id: 'u1',
          request_hash: 'x',
          status: 'IN_PROGRESS',
          response_status: null,
          response_body: null,
          expires_at: new Date(Date.now() + 1000),
        });
        return undefined;
      }
      return originalGet(k);
    };
    await expect(interceptor.intercept(ctx, { handle: () => of({}) })).rejects.toMatchObject({
      code: GoErrorCode.IDEMPOTENCY_IN_PROGRESS,
    });
  });
});

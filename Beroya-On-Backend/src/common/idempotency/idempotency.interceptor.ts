import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@/generated/prisma/client';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_KEY, IdempotentOptions } from './idempotent.decorator';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const opts = this.reflector.get<Required<IdempotentOptions> | undefined>(IDEMPOTENT_KEY, context.getHandler());
    if (!opts) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers[IDEMPOTENCY_HEADER];

    if (typeof key !== 'string' || key.length === 0) {
      if (opts.required) throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
      return next.handle();
    }
    if (key.length < 8 || key.length > 128) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Idempotency-Key must be 8-128 characters');
    }

    const userId = req.user?.id ?? 'anonymous';
    const path = req.originalUrl.split('?')[0];
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ method: req.method, path, body: req.body ?? null }))
      .digest('hex');

    const existing = await this.prisma.goIdempotencyKey.findUnique({
      where: { user_id_key: { user_id: userId, key } },
    });
    if (existing && existing.expires_at > new Date()) {
      if (existing.request_hash !== requestHash) {
        throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key was used with a different request');
      }
      if (existing.status === 'IN_PROGRESS') {
        throw new GoException(GoErrorCode.IDEMPOTENCY_IN_PROGRESS, 'A request with this Idempotency-Key is in progress');
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.response_status ?? HttpStatus.OK);
      return of(existing.response_body);
    }
    if (existing) await this.prisma.goIdempotencyKey.delete({ where: { id: existing.id } });

    let recordId: string;
    try {
      const record = await this.prisma.goIdempotencyKey.create({
        data: {
          key,
          user_id: userId,
          method: req.method,
          path,
          request_hash: requestHash,
          expires_at: new Date(Date.now() + opts.ttlSeconds * 1000),
        },
      });
      recordId = record.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.IDEMPOTENCY_IN_PROGRESS, 'A request with this Idempotency-Key is in progress');
      }
      throw err;
    }

    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.prisma.goIdempotencyKey
            .update({
              where: { id: recordId },
              data: {
                status: 'COMPLETED',
                response_status: status,
                response_body: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              },
            })
            .then(() => body),
        ),
      ),
      catchError((err) =>
        from(this.prisma.goIdempotencyKey.delete({ where: { id: recordId } }).catch(() => undefined)).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
    );
  }
}

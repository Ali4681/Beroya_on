import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GoRole } from '@/generated/prisma/client';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';

/** Ride fields a driver must never receive, at any depth of a response or socket payload. */
const DRIVER_HIDDEN_KEYS = new Set(['other_passenger_phone', 'tracking_token']);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Copy without driver-hidden keys. Class instances (Decimal, Date, StreamableFile) pass through untouched. */
export function redactForDriver<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactForDriver(v)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!DRIVER_HIDDEN_KEYS.has(key)) out[key] = redactForDriver(v);
  }
  return out as T;
}

/** Applies `redactForDriver` to every HTTP response sent to a DRIVER token. */
@Injectable()
export class DriverRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (user?.role !== GoRole.DRIVER) return next.handle();
    return next.handle().pipe(map((body: unknown) => redactForDriver(body)));
  }
}

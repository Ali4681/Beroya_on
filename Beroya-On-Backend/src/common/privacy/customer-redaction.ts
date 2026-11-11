import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GoRole } from '@/generated/prisma/client';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';
import { isPlainObject } from './driver-redaction';

/**
 * Customer responses keep driver.user.phone / call_url after assignment (Call button).
 * Pass-through copy for now; reserved if we need to strip other staff-only fields later.
 */
export function redactForCustomer<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactForCustomer(v)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = redactForCustomer(v);
  }
  return out as T;
}

/** Applies `redactForCustomer` to every HTTP response sent to a CUSTOMER token. */
@Injectable()
export class CustomerRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (user?.role !== GoRole.CUSTOMER) return next.handle();
    return next.handle().pipe(map((body: unknown) => redactForCustomer(body)));
  }
}

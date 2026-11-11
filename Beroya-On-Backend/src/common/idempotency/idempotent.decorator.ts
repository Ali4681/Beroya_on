import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const IDEMPOTENT_KEY = 'go:idempotent';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface IdempotentOptions {
  /** Reject requests without the header (default true). */
  required?: boolean;
  /** How long a stored response can be replayed (default 24h). */
  ttlSeconds?: number;
}

/**
 * Ticket §42: retries with the same `Idempotency-Key` replay the first response instead of
 * repeating the action. Same key with a different body -> 422 IDEMPOTENCY_KEY_REUSED.
 */
export const Idempotent = (options: IdempotentOptions = {}) =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, { required: true, ttlSeconds: 86_400, ...options }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: options.required ?? true,
      description: 'Unique key per logical operation (UUID recommended, 8-128 chars). Retries must reuse the same key.',
    }),
  );

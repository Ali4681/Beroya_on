import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GoErrorCode } from '../../common/errors/go-error-codes';
import { GoException } from '../../common/errors/go.exception';
import { RedisService } from './redis.service';

export interface LockOptions {
  ttlMs?: number;
  /** How long to keep retrying before giving up. 0 = fail immediately. */
  waitMs?: number;
  retryDelayMs?: number;
}

/**
 * Distributed lock (Ticket §41). Used together with DB transactions for offer acceptance,
 * ride finalization, wallet movements, discount consumption, replacement creation, etc.
 */
@Injectable()
export class LockService {
  constructor(private readonly redis: RedisService) {}

  async acquire(key: string, opts: LockOptions = {}): Promise<string | null> {
    const { ttlMs = 10_000, waitMs = 0, retryDelayMs = 50 } = opts;
    const token = randomUUID();
    const deadline = Date.now() + waitMs;
    do {
      if (await this.redis.setIfAbsent(`lock:${key}`, token, ttlMs)) return token;
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    } while (Date.now() < deadline);
    return null;
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.deleteIfEquals(`lock:${key}`, token);
  }

  /** Run `fn` while holding the lock; throws CONFLICT if the lock cannot be obtained. */
  async withLock<T>(key: string, fn: () => Promise<T>, opts: LockOptions = {}): Promise<T> {
    const token = await this.acquire(key, opts);
    if (!token) throw new GoException(GoErrorCode.CONFLICT, 'Resource is busy, retry shortly');
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../../config/configuration';
import { ensureEmbeddedRedis } from './embedded-redis';

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Redis access.
 *
 * - `REDIS_MOCK=true`: auto-starts portable Redis under `.tools/redis` (Windows) when
 *   `REDIS_URL` is unreachable, then connects normally. No manual redis install.
 * - Real Redis down: KV ops fall back to per-process memory (locks/OTP/cache).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  client: Redis | null = null;
  readonly keyPrefix: string;
  readonly mock: boolean;
  private readonly url: string;
  private readonly memory = new Map<string, MemoryEntry>();
  private fallbackLogged = false;

  constructor(config: ConfigService) {
    const { url, keyPrefix, mock } = config.getOrThrow<AppConfig>('app').redis;
    this.url = url;
    this.keyPrefix = keyPrefix;
    this.mock = mock;
    if (!mock) this.attachClient(url);
  }

  async onModuleInit() {
    if (!this.mock) return;
    await ensureEmbeddedRedis(this.url);
    if (!this.client) this.attachClient(this.url);
  }

  private attachClient(url: string) {
    this.client = new Redis(url, {
      keyPrefix: this.keyPrefix,
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.client.on('ready', () => {
      this.fallbackLogged = false;
      this.logger.log(this.mock ? 'Connected to Redis (REDIS_MOCK / embedded)' : 'Connected to Redis');
    });
    this.client.on('error', (err) => {
      if (!this.fallbackLogged) {
        this.logger.warn(`Redis unavailable (${err.message}). Using in-memory fallback.`);
        this.fallbackLogged = true;
      }
    });
  }

  get isReady(): boolean {
    return this.client?.status === 'ready';
  }

  async ping(): Promise<boolean> {
    if (!this.isReady || !this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isReady && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        /* fall through */
      }
    }
    return this.memGet(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isReady && this.client) {
      try {
        if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
        else await this.client.set(key, value);
        return;
      } catch {
        /* fall through */
      }
    }
    this.memory.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.isReady && this.client) {
      try {
        return (await this.client.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
      } catch {
        /* fall through */
      }
    }
    if (this.memGet(key) !== null) return false;
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  async deleteIfEquals(key: string, value: string): Promise<boolean> {
    if (this.isReady && this.client) {
      try {
        const script =
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
        return (await this.client.eval(script, 1, key, value)) === 1;
      } catch {
        /* fall through */
      }
    }
    if (this.memGet(key) !== value) return false;
    this.memory.delete(key);
    return true;
  }

  async del(key: string): Promise<void> {
    if (this.isReady && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        /* fall through */
      }
    }
    this.memory.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isReady && this.client) {
      try {
        const value = await this.client.incr(key);
        if (ttlSeconds && value === 1) await this.client.expire(key, ttlSeconds);
        return value;
      } catch {
        /* fall through */
      }
    }
    const next = Number(this.memGet(key) ?? 0) + 1;
    const existing = this.memory.get(key);
    this.memory.set(key, {
      value: String(next),
      expiresAt: existing?.expiresAt ?? (ttlSeconds ? Date.now() + ttlSeconds * 1000 : null),
    });
    return next;
  }

  private memGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async onModuleDestroy() {
    this.client?.disconnect();
  }
}

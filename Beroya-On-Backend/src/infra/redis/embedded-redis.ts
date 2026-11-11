import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import Redis from 'ioredis';

const log = new Logger('EmbeddedRedis');

let child: ChildProcess | null = null;

function redisServerPath(): string | null {
  const exe = join(process.cwd(), '.tools', 'redis', 'redis-server.exe');
  return existsSync(exe) ? exe : null;
}

async function pingUrl(url: string, timeoutMs = 800): Promise<boolean> {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

/**
 * When REDIS_MOCK=true and no Redis answers on REDIS_URL, start the portable
 * Windows redis-server under `.tools/redis` (dev convenience — not for production).
 */
export async function ensureEmbeddedRedis(url: string): Promise<void> {
  if (await pingUrl(url)) {
    log.log(`Redis already reachable at ${url}`);
    return;
  }

  const exe = redisServerPath();
  if (!exe) {
    log.warn(
      'REDIS_MOCK=true but no Redis at REDIS_URL and .tools/redis/redis-server.exe is missing. ' +
        'KV ops use in-memory fallback; BullMQ jobs will fail until Redis is available.',
    );
    return;
  }

  const cwd = join(process.cwd(), '.tools', 'redis');
  const conf = join(cwd, 'redis.windows.conf');
  const args = existsSync(conf) ? ['redis.windows.conf'] : ['--port', '6379'];

  log.log(`Starting embedded Redis: ${exe}`);
  child = spawn(exe, args, {
    cwd,
    windowsHide: true,
    stdio: 'ignore',
    detached: false,
  });
  child.on('exit', (code) => {
    log.warn(`Embedded Redis exited (code=${code})`);
    child = null;
  });

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await pingUrl(url)) {
      log.log('Embedded Redis is ready');
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  log.warn('Embedded Redis did not become ready in time');
}

export function stopEmbeddedRedis(): void {
  if (!child) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
}

import { Injectable, Logger } from '@nestjs/common';
import { GoDriverAvailability, GoOnlineSessionEnd } from '@/generated/prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';

const TOUCH_TTL_SEC = 60;

/** Overlap in hours between [start, end) and [from, to). */
export function overlapHours(start: Date, end: Date, from: Date, to: Date) {
  const ms = Math.min(end.getTime(), to.getTime()) - Math.max(start.getTime(), from.getTime());
  return ms > 0 ? ms / 3_600_000 : 0;
}

/** Online sessions: when a driver was available (ONLINE or BUSY). Feeds the driver score. */
@Injectable()
export class DriverSessionsService {
  private readonly logger = new Logger(DriverSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private touchKey(driverId: string) {
    return `driver:session:${driverId}`;
  }

  async open(driverId: string, at = new Date()) {
    const current = await this.prisma.goDriverOnlineSession.findFirst({
      where: { driver_id: driverId, ended_at: null },
      select: { id: true },
    });
    if (current) return current;
    return this.prisma.goDriverOnlineSession.create({ data: { driver_id: driverId, started_at: at }, select: { id: true } });
  }

  async close(driverId: string, reason: GoOnlineSessionEnd, at = new Date()) {
    await this.prisma.goDriverOnlineSession.updateMany({
      where: { driver_id: driverId, ended_at: null },
      data: { ended_at: at, end_reason: reason },
    });
    await this.redis.del(this.touchKey(driverId)).catch(() => undefined);
  }

  /** Location ping from an available driver: reopen a session closed as stale. Checked at most once a minute. */
  async touch(driverId: string, availability: GoDriverAvailability) {
    if (availability === GoDriverAvailability.OFFLINE) return;
    const key = this.touchKey(driverId);
    if (await this.redis.get(key).catch(() => null)) return;
    await this.open(driverId);
    await this.redis.set(key, '1', TOUCH_TTL_SEC).catch(() => undefined);
  }

  /** Closes open sessions whose driver sent no location for `staleSeconds`, ending them at the last ping. */
  async closeStale(staleSeconds: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - staleSeconds * 1000);
    const open = await this.prisma.goDriverOnlineSession.findMany({
      where: { ended_at: null, started_at: { lt: cutoff } },
      select: { id: true, driver_id: true, started_at: true, driver: { select: { state: { select: { last_location_at: true } } } } },
    });
    let closed = 0;
    for (const session of open) {
      const last = session.driver.state?.last_location_at ?? null;
      if (last && last >= cutoff) continue;
      const endedAt = last && last > session.started_at ? last : session.started_at;
      const res = await this.prisma.goDriverOnlineSession.updateMany({
        where: { id: session.id, ended_at: null },
        data: { ended_at: endedAt, end_reason: GoOnlineSessionEnd.STALE_LOCATION },
      });
      if (res.count) {
        closed += 1;
        await this.redis.del(this.touchKey(session.driver_id)).catch(() => undefined);
      }
    }
    if (closed) this.logger.log(`Closed ${closed} stale online sessions`);
    return closed;
  }

  /** Online hours per driver inside [from, to). Open sessions count up to `now`. */
  async hours(driverIds: string[], from: Date, to: Date, now = new Date()) {
    const out = new Map<string, number>(driverIds.map((id) => [id, 0]));
    if (!driverIds.length) return out;
    const sessions = await this.prisma.goDriverOnlineSession.findMany({
      where: {
        driver_id: { in: driverIds },
        started_at: { lt: to },
        OR: [{ ended_at: null }, { ended_at: { gt: from } }],
      },
      select: { driver_id: true, started_at: true, ended_at: true },
    });
    for (const s of sessions) {
      const end = s.ended_at ?? (now < to ? now : to);
      out.set(s.driver_id, (out.get(s.driver_id) ?? 0) + overlapHours(s.started_at, end, from, to));
    }
    return out;
  }
}

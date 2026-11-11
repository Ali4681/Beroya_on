import { InjectQueue } from '@nestjs/bullmq';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoDevicePlatform,
  GoLanguage,
  GoNotificationBroadcastStatus,
  GoRole,
  Prisma,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AppConfig } from '../../../config/configuration';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QUEUES } from '../../../infra/queue/queue.constants';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { STAFF_ROLES } from '../../../common/auth/roles';
import {
  assertFilterAudience,
  birthdaysToday,
  type BroadcastAudience,
  type BroadcastFilter,
  resolveAudiencePreview,
  resolveAudienceUserIds,
} from './audience-filters';
import type { FcmCredentials } from './fcm.client';
import { notificationCategory } from './notification-category';
import { personalizeCopy } from './personalize';
import { pushCopy, type PushAudience } from './push-catalog';
import { flattenPushData } from './push-data';

function isBirthdayFilter(filter?: BroadcastFilter | null) {
  return filter === 'CUSTOMER_BIRTHDAY_TODAY' || filter === 'DRIVER_BIRTHDAY_TODAY';
}

export {
  BROADCAST_AUDIENCES,
  BROADCAST_FILTERS,
  DEFAULT_AUDIENCE_LIMIT,
  MAX_AUDIENCE_LIMIT,
  type BroadcastAudience,
  type BroadcastFilter,
} from './audience-filters';

export const PUSH_JOB = 'deliver';
export const BROADCAST_JOB = 'broadcast';

export type BroadcastJob = {
  audience: BroadcastAudience;
  title: string;
  body: string;
  event: string;
  broadcastId?: string;
  /** When set, FCM/inbox target only these user ids (filtered segment). */
  userIds?: string[];
  /** Replace `{name}` (or prefix the name) per recipient — used for birthday sends. */
  personalizeNames?: boolean;
};

export type PushJob = {
  userId: string;
  event: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => RealtimeService)) private readonly realtime: RealtimeService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async register(userId: string, token: string, platform: GoDevicePlatform) {
    const trimmed = token.trim();
    return this.prisma.goPushToken.upsert({
      where: { token: trimmed },
      create: { user_id: userId, token: trimmed, platform },
      update: { user_id: userId, platform },
    });
  }

  async unregister(userId: string, token: string) {
    await this.prisma.goPushToken.deleteMany({ where: { user_id: userId, token: token.trim() } });
    return { success: true };
  }

  /** Queue a device push for catalogued customer/driver events. Socket delivery stays separate. */
  enqueue(audience: PushAudience, userId: string, event: string, payload: unknown) {
    void this.enqueueAsync(audience, userId, event, payload);
  }

  private async enqueueAsync(audience: PushAudience, userId: string, event: string, payload: unknown) {
    const language =
      audience === 'customer'
        ? await this.customerLanguage(userId)
        : audience === 'driver'
          ? await this.driverLanguage(userId)
          : GoLanguage.AR;
    const copy = pushCopy(audience, event, payload, language);
    if (!copy) return;
    const data = flattenPushData(payload);
    data.event = event;
    const job: PushJob = { userId, event, title: copy.title, body: copy.body, data };
    try {
      await this.queue.add(PUSH_JOB, job, { removeOnComplete: 1000 });
    } catch (err) {
      this.logger.warn(`Push enqueue failed for ${event}: ${(err as Error).message}`);
    }
  }

  /**
   * Persist a customer inbox row when the event has push copy (same set as FCM).
   * Returns the public item for `notification.created`, or null when not catalogued.
   */
  async persistCustomerInbox(userId: string, event: string, payload: unknown) {
    const language = await this.customerLanguage(userId);
    const copy = pushCopy('customer', event, payload, language);
    if (!copy) return null;
    return this.createCustomerInboxItem(userId, event, copy.title, copy.body, payload);
  }

  /**
   * Persist a driver inbox row when the event has push copy (same set as FCM).
   * Returns the public item for `notification.created`, or null when not catalogued.
   */
  async persistDriverInbox(userId: string, event: string, payload: unknown) {
    const language = await this.driverLanguage(userId);
    const copy = pushCopy('driver', event, payload, language);
    if (!copy) return null;
    return this.createDriverInboxItem(userId, event, copy.title, copy.body, payload);
  }

  private async customerLanguage(userId: string): Promise<GoLanguage> {
    const profile = await this.prisma.goCustomerProfile.findUnique({
      where: { user_id: userId },
      select: { preferred_language: true },
    });
    return profile?.preferred_language ?? GoLanguage.AR;
  }

  private async driverLanguage(userId: string): Promise<GoLanguage> {
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: { preferred_language: true },
    });
    return profile?.preferred_language ?? GoLanguage.AR;
  }

  /** Admin broadcast → inbox rows for customers and/or drivers. */
  async persistBroadcastInbox(
    audience: BroadcastAudience,
    title: string,
    body: string,
    payload: unknown,
    userIds?: string[],
    personalizeNames = false,
  ) {
    type Row = {
      user_id: string;
      channel: 'customer' | 'driver';
      item: ReturnType<NotificationsService['toInboxItem']>;
    };
    const out: Row[] = [];
    const scoped = userIds?.length
      ? { id: { in: userIds }, is_active: true as const }
      : { is_active: true as const };

    if (audience === 'CUSTOMERS' || audience === 'ALL') {
      const users = await this.prisma.user.findMany({
        where: { role: GoRole.CUSTOMER, ...scoped },
        select: { id: true, full_name: true },
      });
      for (const user of users) {
        const copy = personalizeNames ? personalizeCopy(title, body, user.full_name) : { title, body };
        const itemPayload =
          personalizeNames && payload && typeof payload === 'object'
            ? { ...(payload as Record<string, unknown>), title: copy.title, body: copy.body }
            : payload;
        const item = await this.createCustomerInboxItem(
          user.id,
          'notification.message',
          copy.title,
          copy.body,
          itemPayload,
        );
        out.push({ user_id: user.id, channel: 'customer', item });
      }
    }

    if (audience === 'DRIVERS' || audience === 'ALL') {
      const users = await this.prisma.user.findMany({
        where: { role: GoRole.DRIVER, ...scoped },
        select: { id: true, full_name: true },
      });
      for (const user of users) {
        const copy = personalizeNames ? personalizeCopy(title, body, user.full_name) : { title, body };
        const itemPayload =
          personalizeNames && payload && typeof payload === 'object'
            ? { ...(payload as Record<string, unknown>), title: copy.title, body: copy.body }
            : payload;
        const item = await this.createDriverInboxItem(
          user.id,
          'notification.message',
          copy.title,
          copy.body,
          itemPayload,
        );
        out.push({ user_id: user.id, channel: 'driver', item });
      }
    }

    return out;
  }

  previewAudience(filter: BroadcastFilter, limit?: number | null) {
    return resolveAudiencePreview(this.prisma, filter, limit);
  }

  birthdaysToday() {
    return birthdaysToday(this.prisma);
  }

  private async resolveFilterUserIds(filter: BroadcastFilter | undefined, limit?: number | null) {
    if (!filter) return undefined;
    const ids = await resolveAudienceUserIds(this.prisma, filter, limit);
    if (ids.length === 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'No recipients match this filter');
    }
    return ids;
  }

  private async createCustomerInboxItem(
    userId: string,
    event: string,
    title: string,
    body: string,
    payload: unknown,
  ) {
    const row = await this.prisma.goCustomerNotification.create({
      data: {
        user_id: userId,
        event,
        title: title.slice(0, 120),
        body: body.slice(0, 500),
        payload: (payload && typeof payload === 'object' ? payload : {}) as Prisma.InputJsonValue,
      },
    });
    return this.toInboxItem(row);
  }

  private async createDriverInboxItem(
    userId: string,
    event: string,
    title: string,
    body: string,
    payload: unknown,
  ) {
    const row = await this.prisma.goDriverNotification.create({
      data: {
        user_id: userId,
        event,
        title: title.slice(0, 120),
        body: body.slice(0, 500),
        payload: (payload && typeof payload === 'object' ? payload : {}) as Prisma.InputJsonValue,
      },
    });
    return this.toDriverInboxItem(row);
  }

  private toInboxItem(row: {
    id: string;
    event: string;
    title: string;
    body: string;
    payload: Prisma.JsonValue | null;
    read_at: Date | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      event: row.event,
      title: row.title,
      body: row.body,
      payload: row.payload,
      read_at: row.read_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
    };
  }

  /** Driver home inbox shape: type/data aliases + fixed `category` for icons. */
  private toDriverInboxItem(row: {
    id: string;
    event: string;
    title: string;
    body: string;
    payload: Prisma.JsonValue | null;
    read_at: Date | null;
    created_at: Date;
  }) {
    const base = this.toInboxItem(row);
    return {
      ...base,
      type: base.event,
      data: base.payload,
      category: notificationCategory(base.event),
    };
  }

  async listForCustomer(userId: string, q: { page?: number; limit?: number }) {
    const { skip, take } = pageSkip(q.page, q.limit);
    const [items, unread_count] = await Promise.all([
      this.prisma.goCustomerNotification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.goCustomerNotification.count({ where: { user_id: userId, read_at: null } }),
    ]);
    return { items: items.map((r) => this.toInboxItem(r)), unread_count };
  }

  async listForDriver(userId: string, q: { page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
    const { skip, take } = pageSkip(q.page, q.limit);
    const [items, unread_count, total] = await Promise.all([
      this.prisma.goDriverNotification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.goDriverNotification.count({ where: { user_id: userId, read_at: null } }),
      this.prisma.goDriverNotification.count({ where: { user_id: userId } }),
    ]);
    return {
      items: items.map((r) => this.toDriverInboxItem(r)),
      unread_count,
      page,
      limit: take,
      total,
      has_more: skip + items.length < total,
    };
  }

  async markReadUpTo(userId: string, upToId: string) {
    const target = await this.prisma.goCustomerNotification.findFirst({
      where: { id: upToId, user_id: userId },
    });
    if (!target) throw new GoException(GoErrorCode.NOT_FOUND, 'Notification not found');
    const now = new Date();
    const result = await this.prisma.goCustomerNotification.updateMany({
      where: {
        user_id: userId,
        read_at: null,
        created_at: { lte: target.created_at },
      },
      data: { read_at: now },
    });
    const unread_count = await this.prisma.goCustomerNotification.count({
      where: { user_id: userId, read_at: null },
    });
    return { marked: result.count, unread_count, up_to_id: upToId };
  }

  async markDriverReadUpTo(userId: string, upToId: string) {
    const target = await this.prisma.goDriverNotification.findFirst({
      where: { id: upToId, user_id: userId },
    });
    if (!target) throw new GoException(GoErrorCode.NOT_FOUND, 'Notification not found');
    const now = new Date();
    const result = await this.prisma.goDriverNotification.updateMany({
      where: {
        user_id: userId,
        read_at: null,
        created_at: { lte: target.created_at },
      },
      data: { read_at: now },
    });
    const unread_count = await this.prisma.goDriverNotification.count({
      where: { user_id: userId, read_at: null },
    });
    return { marked: result.count, unread_count, up_to_id: upToId };
  }

  rolesFor(audience: BroadcastAudience): GoRole[] {
    if (audience === 'DRIVERS') return [GoRole.DRIVER];
    if (audience === 'CUSTOMERS') return [GoRole.CUSTOMER];
    if (audience === 'STAFF') return [...STAFF_ROLES];
    return [GoRole.CUSTOMER, GoRole.DRIVER, ...STAFF_ROLES];
  }

  async queueBroadcast(
    audience: BroadcastAudience,
    title: string,
    body: string,
    broadcastId?: string,
    userIds?: string[],
    personalizeNames = false,
  ) {
    const roles = this.rolesFor(audience);
    const devices = await this.prisma.goPushToken.count({
      where: {
        user: {
          role: { in: roles },
          is_active: true,
          ...(userIds?.length ? { id: { in: userIds } } : {}),
        },
      },
    });
    const job: BroadcastJob = {
      audience,
      title,
      body,
      event: 'notification.message',
      broadcastId,
      userIds,
      personalizeNames,
    };
    await this.queue.add(BROADCAST_JOB, job, { removeOnComplete: 200 });
    return devices;
  }

  private namespacesFor(audience: BroadcastAudience) {
    if (audience === 'DRIVERS') return ['driver'] as const;
    if (audience === 'CUSTOMERS') return ['customer'] as const;
    if (audience === 'STAFF') return ['staff'] as const;
    return ['customer', 'driver', 'staff'] as const;
  }

  /** Socket + inbox fan-out for an admin broadcast (FCM is queued separately). */
  async fanOutBroadcast(
    audience: BroadcastAudience,
    title: string,
    body: string,
    userIds?: string[],
    personalizeNames = false,
  ) {
    const payload = { title, body, audience, at: new Date().toISOString() };
    if (userIds?.length) {
      // Segmented send: do not blast the whole namespace socket room.
    } else {
      this.realtime.broadcast(this.namespacesFor(audience), 'notification.message', payload);
    }
    const inbox = await this.persistBroadcastInbox(
      audience,
      title,
      body,
      payload,
      userIds,
      personalizeNames,
    );
    for (const row of inbox) {
      if (row.channel === 'driver') {
        this.realtime.emitDriverSocket(row.user_id, 'notification.created', row.item);
      } else {
        this.realtime.emitCustomerSocket(row.user_id, 'notification.created', row.item);
      }
    }
    return { payload, inbox_count: inbox.length };
  }

  toBroadcastItem(row: {
    id: string;
    audience: string;
    filter?: string | null;
    audience_limit?: number | null;
    title: string;
    body: string;
    status: GoNotificationBroadcastStatus;
    scheduled_at: Date | null;
    sent_at: Date | null;
    created_by_id: string;
    devices_queued: number | null;
    inbox_count: number | null;
    error: string | null;
    created_at: Date;
    updated_at: Date;
    created_by?: { id: string; full_name: string | null; email: string | null } | null;
  }) {
    return {
      id: row.id,
      audience: row.audience,
      filter: row.filter ?? null,
      audience_limit: row.audience_limit ?? null,
      title: row.title,
      body: row.body,
      status: row.status,
      scheduled_at: row.scheduled_at?.toISOString() ?? null,
      sent_at: row.sent_at?.toISOString() ?? null,
      created_by_id: row.created_by_id,
      created_by: row.created_by
        ? {
            id: row.created_by.id,
            full_name: row.created_by.full_name,
            email: row.created_by.email,
          }
        : null,
      devices_queued: row.devices_queued,
      inbox_count: row.inbox_count,
      error: row.error,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async createImmediateBroadcast(
    actor: AuthUser,
    audience: BroadcastAudience,
    title: string,
    body: string,
    filter?: BroadcastFilter,
    limit?: number | null,
  ) {
    assertFilterAudience(filter, audience);
    const userIds = await this.resolveFilterUserIds(filter, limit);
    const personalizeNames = isBirthdayFilter(filter);
    const row = await this.prisma.goNotificationBroadcast.create({
      data: {
        audience,
        filter: filter ?? null,
        audience_limit: filter ? (limit ?? null) : null,
        title,
        body,
        status: GoNotificationBroadcastStatus.SENDING,
        created_by_id: actor.id,
      },
    });
    try {
      const { inbox_count } = await this.fanOutBroadcast(
        audience,
        title,
        body,
        userIds,
        personalizeNames,
      );
      // FCM job without broadcastId — avoids re-running processScheduledBroadcast.
      const devices = await this.queueBroadcast(
        audience,
        title,
        body,
        undefined,
        userIds,
        personalizeNames,
      );
      const sent = await this.prisma.goNotificationBroadcast.update({
        where: { id: row.id },
        data: {
          status: GoNotificationBroadcastStatus.SENT,
          sent_at: new Date(),
          devices_queued: devices,
          inbox_count,
        },
        include: { created_by: { select: { id: true, full_name: true, email: true } } },
      });
      return { item: this.toBroadcastItem(sent), devices, inbox_count, recipients: userIds?.length ?? null };
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.goNotificationBroadcast.update({
        where: { id: row.id },
        data: { status: GoNotificationBroadcastStatus.FAILED, error: message.slice(0, 500) },
      });
      throw err;
    }
  }

  async scheduleBroadcast(
    actor: AuthUser,
    audience: BroadcastAudience,
    title: string,
    body: string,
    scheduledAtIso: string,
    filter?: BroadcastFilter,
    limit?: number | null,
  ) {
    const redis = this.config.get<AppConfig['redis']>('app.redis');
    if (redis?.mock) {
      throw new GoException(
        GoErrorCode.SERVICE_UNAVAILABLE,
        'Scheduled broadcasts require Redis (set REDIS_MOCK=false)',
      );
    }

    assertFilterAudience(filter, audience);
    // Resolve now so empty segments fail before scheduling.
    const userIds = await this.resolveFilterUserIds(filter, limit);
    const personalizeNames = isBirthdayFilter(filter);

    const scheduledAt = new Date(scheduledAtIso);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'scheduled_at is invalid');
    }
    const delay = scheduledAt.getTime() - Date.now();
    if (delay < 5_000) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'scheduled_at must be at least 5 seconds in the future');
    }

    const row = await this.prisma.goNotificationBroadcast.create({
      data: {
        audience,
        filter: filter ?? null,
        audience_limit: filter ? (limit ?? null) : null,
        title,
        body,
        status: GoNotificationBroadcastStatus.SCHEDULED,
        scheduled_at: scheduledAt,
        created_by_id: actor.id,
      },
    });

    const jobId = `notif-broadcast-${row.id}`;
    try {
      const job: BroadcastJob = {
        audience,
        title,
        body,
        event: 'notification.message',
        broadcastId: row.id,
        userIds,
        personalizeNames,
      };
      await this.queue.add(BROADCAST_JOB, job, {
        jobId,
        delay,
        removeOnComplete: 200,
        removeOnFail: 50,
      });
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.goNotificationBroadcast.update({
        where: { id: row.id },
        data: { status: GoNotificationBroadcastStatus.FAILED, error: message.slice(0, 500) },
      });
      throw new GoException(GoErrorCode.SERVICE_UNAVAILABLE, 'Could not schedule broadcast job');
    }

    const updated = await this.prisma.goNotificationBroadcast.update({
      where: { id: row.id },
      data: { job_id: jobId },
      include: { created_by: { select: { id: true, full_name: true, email: true } } },
    });
    return this.toBroadcastItem(updated);
  }

  /** Called by the queue worker when a scheduled (or FCM-only) broadcast should run. */
  async processScheduledBroadcast(broadcastId: string) {
    const row = await this.prisma.goNotificationBroadcast.findUnique({ where: { id: broadcastId } });
    if (!row) return;
    if (row.status === GoNotificationBroadcastStatus.CANCELLED) return;
    if (row.status === GoNotificationBroadcastStatus.SENT) return;

    const audience = row.audience as BroadcastAudience;
    const filter = (row.filter as BroadcastFilter | null) ?? undefined;
    await this.prisma.goNotificationBroadcast.update({
      where: { id: broadcastId },
      data: { status: GoNotificationBroadcastStatus.SENDING, error: null },
    });

    try {
      // Re-resolve at send time so birthday / rankings stay current.
      const userIds = filter
        ? await resolveAudienceUserIds(this.prisma, filter, row.audience_limit)
        : undefined;
      if (filter && (!userIds || userIds.length === 0)) {
        await this.prisma.goNotificationBroadcast.update({
          where: { id: broadcastId },
          data: {
            status: GoNotificationBroadcastStatus.FAILED,
            error: 'No recipients match this filter at send time',
          },
        });
        return;
      }
      const personalizeNames = isBirthdayFilter(filter);
      const { inbox_count } = await this.fanOutBroadcast(
        audience,
        row.title,
        row.body,
        userIds,
        personalizeNames,
      );
      const devices = await this.prisma.goPushToken.count({
        where: {
          user: {
            role: { in: this.rolesFor(audience) },
            is_active: true,
            ...(userIds?.length ? { id: { in: userIds } } : {}),
          },
        },
      });
      // FCM fan-out without nesting another scheduled job
      const job: BroadcastJob = {
        audience,
        title: row.title,
        body: row.body,
        event: 'notification.message',
        userIds,
        personalizeNames,
      };
      await this.queue.add(BROADCAST_JOB, job, { removeOnComplete: 200 });
      await this.prisma.goNotificationBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: GoNotificationBroadcastStatus.SENT,
          sent_at: new Date(),
          devices_queued: devices,
          inbox_count,
        },
      });
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.goNotificationBroadcast.update({
        where: { id: broadcastId },
        data: { status: GoNotificationBroadcastStatus.FAILED, error: message.slice(0, 500) },
      });
      throw err;
    }
  }

  async listBroadcasts(q: {
    page?: number;
    limit?: number;
    status?: GoNotificationBroadcastStatus;
    audience?: BroadcastAudience;
  }) {
    const { skip, take } = pageSkip(q.page, q.limit);
    const where: Prisma.GoNotificationBroadcastWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.audience) where.audience = q.audience;
    const [items, total] = await Promise.all([
      this.prisma.goNotificationBroadcast.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: { created_by: { select: { id: true, full_name: true, email: true } } },
      }),
      this.prisma.goNotificationBroadcast.count({ where }),
    ]);
    return {
      items: items.map((row) => this.toBroadcastItem(row)),
      total,
      page: Math.max(1, Math.trunc(Number(q.page)) || 1),
      limit: take,
    };
  }

  async getBroadcast(id: string) {
    const row = await this.prisma.goNotificationBroadcast.findUnique({
      where: { id },
      include: { created_by: { select: { id: true, full_name: true, email: true } } },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Broadcast not found');
    return this.toBroadcastItem(row);
  }

  async cancelBroadcast(id: string) {
    const row = await this.prisma.goNotificationBroadcast.findUnique({ where: { id } });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Broadcast not found');
    if (row.status !== GoNotificationBroadcastStatus.SCHEDULED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Only scheduled broadcasts can be cancelled');
    }

    if (row.job_id) {
      try {
        const job = await this.queue.getJob(row.job_id);
        if (job) await job.remove();
      } catch (err) {
        this.logger.warn(`Could not remove broadcast job ${row.job_id}: ${(err as Error).message}`);
      }
    }

    const updated = await this.prisma.goNotificationBroadcast.update({
      where: { id },
      data: { status: GoNotificationBroadcastStatus.CANCELLED },
      include: { created_by: { select: { id: true, full_name: true, email: true } } },
    });
    return this.toBroadcastItem(updated);
  }

  fcmCredentials(): FcmCredentials | null {
    const routing = this.config.get<AppConfig['fcm']>('app.fcm');
    if (!routing?.projectId || !routing.clientEmail || !routing.privateKey) return null;
    return routing;
  }

  private toNotificationConfig(row: {
    customer_birthday_title: string;
    customer_birthday_body: string;
    driver_birthday_title: string;
    driver_birthday_body: string;
    updated_at: Date;
  }) {
    return {
      customer_birthday: {
        title: row.customer_birthday_title,
        body: row.customer_birthday_body,
      },
      driver_birthday: {
        title: row.driver_birthday_title,
        body: row.driver_birthday_body,
      },
      updated_at: row.updated_at.toISOString(),
    };
  }

  async getNotificationConfig() {
    const row = await this.prisma.goNotificationConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
    return this.toNotificationConfig(row);
  }

  async updateBirthdayTemplates(input: {
    customer_birthday_title?: string;
    customer_birthday_body?: string;
    driver_birthday_title?: string;
    driver_birthday_body?: string;
  }) {
    const data: Prisma.GoNotificationConfigUpdateInput = {};
    if (input.customer_birthday_title !== undefined) {
      data.customer_birthday_title = input.customer_birthday_title.trim();
    }
    if (input.customer_birthday_body !== undefined) {
      data.customer_birthday_body = input.customer_birthday_body.trim();
    }
    if (input.driver_birthday_title !== undefined) {
      data.driver_birthday_title = input.driver_birthday_title.trim();
    }
    if (input.driver_birthday_body !== undefined) {
      data.driver_birthday_body = input.driver_birthday_body.trim();
    }
    const row = await this.prisma.goNotificationConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        customer_birthday_title: input.customer_birthday_title?.trim() ?? undefined,
        customer_birthday_body: input.customer_birthday_body?.trim() ?? undefined,
        driver_birthday_title: input.driver_birthday_title?.trim() ?? undefined,
        driver_birthday_body: input.driver_birthday_body?.trim() ?? undefined,
      },
      update: data,
    });
    return this.toNotificationConfig(row);
  }
}


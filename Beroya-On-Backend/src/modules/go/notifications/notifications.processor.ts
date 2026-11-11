import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { GoPushDeliveryStatus, Prisma } from '@/generated/prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QUEUES } from '../../../infra/queue/queue.constants';
import { isDeadFcmTargetError, resolveFcmTarget, sendFcm } from './fcm.client';
import { personalizeCopy } from './personalize';
import { BROADCAST_JOB, PUSH_JOB, type BroadcastJob, type PushJob, NotificationsService } from './notifications.service';

@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<PushJob | BroadcastJob>) {
    if (job.name === BROADCAST_JOB) {
      const data = job.data as BroadcastJob;
      if (data.broadcastId) {
        await this.notifications.processScheduledBroadcast(data.broadcastId);
        return;
      }
      await this.broadcast(data);
      return;
    }
    if (job.name !== PUSH_JOB) return;
    const { userId, event, title, body, data } = job.data as PushJob;
    await this.deliver(userId, event, title, body, data);
  }

  private async broadcast(job: BroadcastJob) {
    const roles = this.notifications.rolesFor(job.audience);
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        is_active: true,
        pushTokens: { some: {} },
        ...(job.userIds?.length ? { id: { in: job.userIds } } : {}),
      },
      select: { id: true, full_name: true },
    });
    const data = { event: job.event, audience: job.audience };
    for (const user of users) {
      const copy = job.personalizeNames
        ? personalizeCopy(job.title, job.body, user.full_name)
        : { title: job.title, body: job.body };
      await this.deliver(user.id, job.event, copy.title, copy.body, data);
    }
    this.logger.log(`Broadcast ${job.audience} queued for ${users.length} device accounts`);
  }

  private async deliver(userId: string, event: string, title: string, body: string, data: Record<string, string>) {
    const tokens = await this.prisma.goPushToken.findMany({ where: { user_id: userId } });
    const creds = this.notifications.fcmCredentials();
    if (tokens.length === 0 || !creds) {
      await this.record(
        userId,
        event,
        title,
        body,
        data,
        GoPushDeliveryStatus.SKIPPED,
        tokens.length === 0 ? 'no device token' : 'FCM is not configured',
      );
      return;
    }
    let sent = 0;
    let lastError: string | undefined;
    for (const row of tokens) {
      const resolved = resolveFcmTarget(row.token);
      if (resolved.ambiguous) {
        this.logger.warn(
          `Ambiguous push target for user ${userId} (len=${row.token.length}) — sending as message.${resolved.kind}`,
        );
      }
      const result = await sendFcm(creds, { token: row.token, title, body, data });
      if (result.ok) sent += 1;
      else {
        lastError = result.error;
        if (isDeadFcmTargetError(result.error)) {
          await this.prisma.goPushToken.deleteMany({ where: { token: row.token } });
          this.logger.warn(
            `Removed dead push target (${result.target ?? resolved.kind}) for user ${userId}: ${result.error.slice(0, 180)}`,
          );
        }
      }
    }
    await this.record(
      userId,
      event,
      title,
      body,
      data,
      sent > 0 ? GoPushDeliveryStatus.SENT : GoPushDeliveryStatus.FAILED,
      sent > 0 ? undefined : lastError,
    );
    if (sent === 0) this.logger.warn(`Push ${event} failed for ${userId}: ${lastError}`);
  }

  private record(
    userId: string,
    event: string,
    title: string,
    body: string,
    data: Record<string, string>,
    status: GoPushDeliveryStatus,
    error?: string,
  ) {
    return this.prisma.goPushDelivery.create({
      data: {
        user_id: userId,
        event,
        title,
        body,
        payload: data as Prisma.InputJsonValue,
        status,
        error,
      },
    });
  }
}

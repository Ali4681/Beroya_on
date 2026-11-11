import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES, SYSTEM_JOBS } from './queue.constants';

/** Hourly housekeeping: expired idempotency keys, OTP requests and refresh sessions. */
@Processor(QUEUES.SYSTEM)
export class SystemProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.SYSTEM) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const schedule = this.queue.upsertJobScheduler(
      'system-cleanup',
      { every: 60 * 60 * 1000 },
      { name: SYSTEM_JOBS.CLEANUP },
    );
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register cleanup scheduler (${err.message}); will run when Redis is back`),
    );
  }

  async process(job: Job): Promise<Record<string, number>> {
    if (job.name !== SYSTEM_JOBS.CLEANUP) return {};
    return this.cleanup();
  }

  async cleanup(now = new Date()): Promise<Record<string, number>> {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // Sequential deletes — avoids stacking many statements on one pooled connection at once.
    const idempotency = await this.prisma.goIdempotencyKey.deleteMany({ where: { expires_at: { lt: now } } });
    const otp = await this.prisma.goOtpRequest.deleteMany({ where: { created_at: { lt: dayAgo } } });
    const sessions = await this.prisma.goUserSession.deleteMany({
      where: { OR: [{ expires_at: { lt: now } }, { revoked_at: { lt: dayAgo } }] },
    });
    const result = { idempotency: idempotency.count, otp: otp.count, sessions: sessions.count };
    this.logger.log(`Cleanup done ${JSON.stringify(result)}`);
    return result;
  }
}

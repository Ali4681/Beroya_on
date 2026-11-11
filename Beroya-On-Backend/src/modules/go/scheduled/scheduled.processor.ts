import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, SCHEDULED_JOBS, type ScheduledRideJob } from '../../../infra/queue/queue.constants';
import { ScheduledService } from './scheduled.service';

@Processor(QUEUES.SCHEDULED)
export class ScheduledProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledProcessor.name);

  constructor(private readonly scheduled: ScheduledService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data = job.data as ScheduledRideJob;
    try {
      if (job.name === SCHEDULED_JOBS.REMINDER) {
        await this.scheduled.processReminder(data.rideId);
        return;
      }
      if (job.name === SCHEDULED_JOBS.ONLINE_CHECK) {
        await this.scheduled.processOnlineCheck(data.rideId);
        return;
      }
      if (job.name === SCHEDULED_JOBS.ETA_MONITOR) {
        await this.scheduled.processEtaMonitor(data.rideId);
        return;
      }
      this.logger.warn(`Unknown scheduled job ${job.name}`);
    } catch (err) {
      this.logger.error(`Scheduled job ${job.name} failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }
}

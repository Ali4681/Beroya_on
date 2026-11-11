import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PASSPORT_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PassportService } from './passport.service';

@Processor(QUEUES.PASSPORT)
export class PassportProcessor extends WorkerHost {
  private readonly logger = new Logger(PassportProcessor.name);

  constructor(private readonly passport: PassportService) {
    super();
  }

  async process(job: Job) {
    if (job.name === PASSPORT_JOBS.REVIEW_TICK) {
      return this.passport.runPeriodicReview();
    }
    this.logger.warn(`Unknown passport job ${job.name}`);
    return null;
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DISCOUNT_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { DiscountsService } from './discounts.service';

@Processor(QUEUES.DISCOUNTS)
export class DiscountsProcessor extends WorkerHost {
  private readonly logger = new Logger(DiscountsProcessor.name);

  constructor(private readonly discounts: DiscountsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === DISCOUNT_JOBS.EXPIRE_TICK) {
      return this.discounts.expireTick();
    }
    this.logger.warn(`Unknown discount job ${job.name}`);
    return null;
  }
}

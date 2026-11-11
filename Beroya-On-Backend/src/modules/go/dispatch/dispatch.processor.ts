import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DISPATCH_JOBS,
  QUEUES,
  type DispatchOfferTimeoutJob,
  type DispatchSearchJob,
} from '../../../infra/queue/queue.constants';
import { DispatchService } from './dispatch.service';

@Processor(QUEUES.DISPATCH)
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  constructor(private readonly dispatch: DispatchService) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      if (job.name === DISPATCH_JOBS.SEARCH_TICK) {
        await this.dispatch.processSearchTick(job.data as DispatchSearchJob);
        return;
      }
      if (job.name === DISPATCH_JOBS.OFFER_TIMEOUT) {
        await this.dispatch.processOfferTimeout(job.data as DispatchOfferTimeoutJob);
        return;
      }
      this.logger.warn(`Unknown dispatch job ${job.name}`);
    } catch (err) {
      this.logger.error(`Dispatch job ${job.name} failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }
}

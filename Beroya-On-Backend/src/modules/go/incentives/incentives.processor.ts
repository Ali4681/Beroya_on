import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { INCENTIVE_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { DriverScoresService } from '../driver-scores/driver-scores.service';
import { DailyIncentivesService } from './daily-incentives.service';

@Processor(QUEUES.INCENTIVES)
export class IncentivesProcessor extends WorkerHost {
  private readonly logger = new Logger(IncentivesProcessor.name);

  constructor(
    private readonly daily: DailyIncentivesService,
    private readonly scores: DriverScoresService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== INCENTIVE_JOBS.TICK) {
      this.logger.warn(`Unknown incentives job ${job.name}`);
      return;
    }
    const results = await Promise.allSettled([this.daily.tick(), this.scores.tick()]);
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') continue;
      const e = r.reason as Error & { code?: string };
      this.logger.error(`${i === 0 ? 'Incentives' : 'Driver scores'} tick failed: ${e.message}`, e.stack);
      if (e.code !== 'P2021') throw e;
    }
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MONITORING_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { MonitoringService } from './monitoring.service';

@Processor(QUEUES.MONITORING)
export class MonitoringProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitoringProcessor.name);

  constructor(private readonly monitoring: MonitoringService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== MONITORING_JOBS.TICK) {
      this.logger.warn(`Unknown monitoring job ${job.name}`);
      return;
    }
    try {
      await this.monitoring.processTick();
    } catch (err) {
      const e = err as Error & { code?: string };
      this.logger.error(`Monitoring tick failed: ${e.message}`, e.stack);
      // P2021 = table missing — migrations not applied; don't retry-spam BullMQ
      if (e.code === 'P2021') return;
      throw err;
    }
  }
}

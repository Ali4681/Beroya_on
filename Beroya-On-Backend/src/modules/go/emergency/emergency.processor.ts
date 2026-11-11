import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EMERGENCY_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { EmergencyService } from './emergency.service';

@Processor(QUEUES.EMERGENCY)
export class EmergencyProcessor extends WorkerHost {
  private readonly logger = new Logger(EmergencyProcessor.name);

  constructor(private readonly emergency: EmergencyService) {
    super();
  }

  async process(job: Job) {
    if (job.name === EMERGENCY_JOBS.TEMP_CLEANUP) {
      return this.emergency.cleanupPendingTempAudio();
    }
    this.logger.warn(`Unknown emergency job ${job.name}`);
    return null;
  }
}

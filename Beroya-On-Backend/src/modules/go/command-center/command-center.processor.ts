import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { COMMAND_CENTER_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { CommandCenterService } from './command-center.service';

/** Every minute: evaluate coverage, assignment delay, ride delay and cancellation rate; close cleared alerts. */
@Processor(QUEUES.COMMAND_CENTER)
export class CommandCenterProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommandCenterProcessor.name);

  constructor(
    private readonly cc: CommandCenterService,
    @InjectQueue(QUEUES.COMMAND_CENTER) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const schedule = this.queue.upsertJobScheduler(
      'command-center-tick',
      { every: 60_000 },
      { name: COMMAND_CENTER_JOBS.TICK },
    );
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register command center scheduler (${err.message})`),
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== COMMAND_CENTER_JOBS.TICK) {
      this.logger.warn(`Unknown command center job ${job.name}`);
      return;
    }
    try {
      await this.cc.evaluateAlerts();
    } catch (err) {
      const e = err as Error & { code?: string };
      this.logger.error(`Command center tick failed: ${e.message}`, e.stack);
      if (e.code === 'P2021' || e.code === 'P2022') return;
      throw err;
    }
  }
}

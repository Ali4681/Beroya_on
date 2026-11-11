import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES, RADAR_JOBS } from '../../../infra/queue/queue.constants';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { RADAR_DEFAULT_RESOLUTION } from './radar-math';
import { RadarService } from './radar.service';

/**
 * Every minute: index older rides, warm each branch's live snapshot (shared by desk and driver app),
 * and tell that branch's staff a fresh snapshot exists. One small event per branch per minute.
 */
@Processor(QUEUES.RADAR)
export class RadarProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(RadarProcessor.name);

  constructor(
    private readonly radar: RadarService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUES.RADAR) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const schedule = this.queue.upsertJobScheduler('radar-tick', { every: 60_000 }, { name: RADAR_JOBS.TICK });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register radar scheduler (${err.message})`),
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RADAR_JOBS.TICK) {
      this.logger.warn(`Unknown radar job ${job.name}`);
      return;
    }
    try {
      await this.radar.backfillPickupCells();
      const now = new Date();
      const window = this.radar.liveWindow(now);
      for (const branchId of await this.radar.activeBranchIds()) {
        const snap = await this.radar.snapshot(branchId, window, RADAR_DEFAULT_RESOLUTION, now);
        this.realtime.emitToStaff(branchId, 'radar.updated', {
          branch_id: branchId,
          generated_at: snap.generated_at,
          unassigned_now: snap.totals.unassigned_now,
          available_drivers: snap.totals.available_drivers,
          shortage_cells: snap.totals.shortage_cells,
        });
      }
    } catch (err) {
      const e = err as Error & { code?: string };
      this.logger.error(`Radar tick failed: ${e.message}`, e.stack);
      if (e.code === 'P2021' || e.code === 'P2022') return;
      throw err;
    }
  }
}

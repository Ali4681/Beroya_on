import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { GoConfigModule } from '../config/config.module';
import { RouteEstimateService } from '../rides/route-estimate.service';
import { ScheduledProcessor } from './scheduled.processor';
import { ScheduledService } from './scheduled.service';

@Module({
  imports: [GoConfigModule, AlertsModule],
  providers: [ScheduledService, ScheduledProcessor, RouteEstimateService],
  exports: [ScheduledService],
})
export class ScheduledModule {}

import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { GoConfigModule } from '../config/config.module';
import { MonitoringProcessor } from './monitoring.processor';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [AlertsModule, GoConfigModule],
  providers: [MonitoringService, MonitoringProcessor],
  exports: [MonitoringService],
})
export class MonitoringModule {}

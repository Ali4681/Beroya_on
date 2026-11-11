import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { GoConfigModule } from '../config/config.module';
import { RadarModule } from '../radar/radar.module';
import { CommandCenterController } from './command-center.controller';
import { CommandCenterProcessor } from './command-center.processor';
import { CommandCenterService } from './command-center.service';

@Module({
  imports: [GoConfigModule, RadarModule, AlertsModule],
  controllers: [CommandCenterController],
  providers: [CommandCenterService, CommandCenterProcessor],
})
export class CommandCenterModule {}

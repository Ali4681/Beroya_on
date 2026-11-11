import { Module } from '@nestjs/common';
import { AppInfoController } from './app-info.controller';
import { GoConfigController } from './config.controller';
import { GoConfigService } from './config.service';
import { DriverConfigController } from './driver-config.controller';

@Module({
  controllers: [GoConfigController, AppInfoController, DriverConfigController],
  providers: [GoConfigService],
  exports: [GoConfigService],
})
export class GoConfigModule {}

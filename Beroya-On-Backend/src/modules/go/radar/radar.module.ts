import { Module } from '@nestjs/common';
import { GoConfigModule } from '../config/config.module';
import { RadarController } from './radar.controller';
import { RadarProcessor } from './radar.processor';
import { RadarService } from './radar.service';

@Module({
  imports: [GoConfigModule],
  controllers: [RadarController],
  providers: [RadarService, RadarProcessor],
  exports: [RadarService],
})
export class RadarModule {}

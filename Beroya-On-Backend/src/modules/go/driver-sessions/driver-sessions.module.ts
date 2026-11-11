import { Global, Module } from '@nestjs/common';
import { DriverSessionsService } from './driver-sessions.service';

@Global()
@Module({
  providers: [DriverSessionsService],
  exports: [DriverSessionsService],
})
export class DriverSessionsModule {}

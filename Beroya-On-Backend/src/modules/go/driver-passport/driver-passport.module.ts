import { Module } from '@nestjs/common';
import { PassportIconStorage } from '../passport/passport-icon.storage';
import { DriverPassportController } from './driver-passport.controller';
import { DriverPassportService } from './driver-passport.service';

@Module({
  controllers: [DriverPassportController],
  providers: [DriverPassportService, PassportIconStorage],
  exports: [DriverPassportService],
})
export class DriverPassportModule {}
import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { PassportController } from './passport.controller';
import { PassportIconStorage } from './passport-icon.storage';
import { PassportProcessor } from './passport.processor';
import { PassportService } from './passport.service';

@Module({
  imports: [DiscountsModule],
  controllers: [PassportController],
  providers: [PassportService, PassportProcessor, PassportIconStorage],
  exports: [PassportService, PassportIconStorage],
})
export class PassportModule {}

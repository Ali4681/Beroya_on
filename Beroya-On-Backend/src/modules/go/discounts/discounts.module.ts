import { Module } from '@nestjs/common';
import { DiscountsController } from './discounts.controller';
import { DiscountsProcessor } from './discounts.processor';
import { DiscountsService } from './discounts.service';

@Module({
  controllers: [DiscountsController],
  providers: [DiscountsService, DiscountsProcessor],
  exports: [DiscountsService],
})
export class DiscountsModule {}

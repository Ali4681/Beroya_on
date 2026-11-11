import { Module } from '@nestjs/common';
import { GoConfigModule } from '../config/config.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { DriversModule } from '../drivers/drivers.module';
import { IncentivesModule } from '../incentives/incentives.module';
import { RouteEstimateService } from '../rides/route-estimate.service';
import { ScheduledModule } from '../scheduled/scheduled.module';
import { WalletsModule } from '../wallets/wallets.module';
import { DispatchProcessor } from './dispatch.processor';
import { DispatchService } from './dispatch.service';
import { OffersController } from './offers.controller';

@Module({
  imports: [GoConfigModule, DriversModule, ScheduledModule, WalletsModule, DiscountsModule, IncentivesModule],
  controllers: [OffersController],
  providers: [DispatchService, DispatchProcessor, RouteEstimateService],
  exports: [DispatchService],
})
export class DispatchModule {}

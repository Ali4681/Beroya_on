import { Module } from '@nestjs/common';
import { GoConfigModule } from '../config/config.module';
import { DriverScoresController } from '../driver-scores/driver-scores.controller';
import { DriverScoresService } from '../driver-scores/driver-scores.service';
import { WalletsModule } from '../wallets/wallets.module';
import { DailyIncentivesService } from './daily-incentives.service';
import { GoalCampaignsService } from './goal-campaigns.service';
import { IncentiveGrantsService } from './incentive-grants.service';
import { IncentivesController } from './incentives.controller';
import { IncentivesProcessor } from './incentives.processor';
import { IncentivesService } from './incentives.service';

@Module({
  imports: [WalletsModule, GoConfigModule],
  controllers: [IncentivesController, DriverScoresController],
  providers: [
    IncentivesService,
    DailyIncentivesService,
    GoalCampaignsService,
    IncentiveGrantsService,
    DriverScoresService,
    IncentivesProcessor,
  ],
  exports: [IncentivesService],
})
export class IncentivesModule {}

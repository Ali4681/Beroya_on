import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';

@Module({
  imports: [RidesModule, WalletsModule],
  controllers: [CompensationController],
  providers: [CompensationService],
  exports: [CompensationService],
})
export class CompensationModule {}
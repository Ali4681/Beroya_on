import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncentivesModule } from '../incentives/incentives.module';
import { RideChatModule } from '../ride-chat/ride-chat.module';
import { WalletsModule } from '../wallets/wallets.module';
import { DriverAvatarStorage } from './driver-avatar.storage';
import { DriverDocumentStorageService } from './driver-document-storage.service';
import { DriverStatisticsController } from './driver-statistics.controller';
import { DriverStatisticsService } from './driver-statistics.service';
import { DriverVehiclePhotoStorage } from './driver-vehicle-photo.storage';
import { DriverProfileController } from './driver-profile.controller';
import { DriverProfileService } from './driver-profile.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DriverEligibilityService } from './eligibility.service';

@Module({
  imports: [WalletsModule, AuthModule, RideChatModule, IncentivesModule],
  controllers: [DriversController, DriverProfileController, DriverStatisticsController],
  providers: [
    DriversService,
    DriverEligibilityService,
    DriverDocumentStorageService,
    DriverVehiclePhotoStorage,
    DriverAvatarStorage,
    DriverProfileService,
    DriverStatisticsService,
  ],
  exports: [DriversService, DriverEligibilityService, DriverAvatarStorage],
})
export class DriversModule {}

import { Module, forwardRef } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { BranchesModule } from '../branches/branches.module';
import { CasesModule } from '../cases/cases.module';
import { CitiesModule } from '../cities/cities.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DriverPassportModule } from '../driver-passport/driver-passport.module';
import { DriversModule } from '../drivers/drivers.module';
import { DriverStateController } from '../driver-state/driver-state.controller';
import { DriverStateService } from '../driver-state/driver-state.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { IncentivesModule } from '../incentives/incentives.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { PassportModule } from '../passport/passport.module';
import { RatingsModule } from '../ratings/ratings.module';
import { ScheduledModule } from '../scheduled/scheduled.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CustomersModule } from '../customers/customers.module';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { RouteEstimateService } from './route-estimate.service';
import { FareSettlementService } from './fare-settlement.service';
import { CustomerRideViewService } from './customer-ride-view.service';
import { GoConfigModule } from '../config/config.module';

@Module({
  imports: [
    GoConfigModule,
    BranchesModule,
    CitiesModule,
    DriversModule,
    CustomersModule,
    DispatchModule,
    ScheduledModule,
    CasesModule,
    AlertsModule,
    EntitlementsModule,
    WalletsModule,
    IncentivesModule,
    PassportModule,
    DriverPassportModule,
    DiscountsModule,
    RatingsModule,
    forwardRef(() => MonitoringModule),
  ],
  controllers: [RidesController, DriverStateController],
  providers: [RidesService, RouteEstimateService, DriverStateService, FareSettlementService, CustomerRideViewService],
  exports: [RidesService, DriverStateService, RouteEstimateService, FareSettlementService, CustomerRideViewService],
})
export class RidesModule {}

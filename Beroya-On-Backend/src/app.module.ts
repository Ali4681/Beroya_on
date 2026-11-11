import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { GoExceptionFilter } from './common/errors/go-exception.filter';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { CustomerRedactionInterceptor } from './common/privacy/customer-redaction';
import { DriverRedactionInterceptor } from './common/privacy/driver-redaction';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import configuration, { envValidationSchema } from './config/configuration';
import { ObjectStorageModule } from './infra/object-storage/object-storage.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RealtimeModule } from './infra/realtime/realtime.module';
import { NotificationsModule } from './modules/go/notifications/notifications.module';
import { RedisModule } from './infra/redis/redis.module';
import { AuditModule } from './modules/go/audit/audit.module';
import { AuthModule } from './modules/go/auth/auth.module';
import { BranchesModule } from './modules/go/branches/branches.module';
import { BrandingModule } from './modules/go/branding/branding.module';
import { CitiesModule } from './modules/go/cities/cities.module';
import { GoConfigModule } from './modules/go/config/config.module';
import { CustomersModule } from './modules/go/customers/customers.module';
import { DriversModule } from './modules/go/drivers/drivers.module';
import { EmployeesModule } from './modules/go/employees/employees.module';
import { PricingModule } from './modules/go/pricing/pricing.module';
import { RideCategoriesModule } from './modules/go/ride-categories/ride-categories.module';
import { SystemModule } from './modules/go/system/system.module';
import { VehiclesModule } from './modules/go/vehicles/vehicles.module';
import { AlertsModule } from './modules/go/alerts/alerts.module';
import { CasesModule } from './modules/go/cases/cases.module';
import { CommandCenterModule } from './modules/go/command-center/command-center.module';
import { ReportsModule } from './modules/go/reports/reports.module';
import { CompensationModule } from './modules/go/compensation/compensation.module';
import { ComplaintsModule } from './modules/go/complaints/complaints.module';
import { DiscountsModule } from './modules/go/discounts/discounts.module';
import { DispatchModule } from './modules/go/dispatch/dispatch.module';
import { DriverPassportModule } from './modules/go/driver-passport/driver-passport.module';
import { DriverSessionsModule } from './modules/go/driver-sessions/driver-sessions.module';
import { EmergencyModule } from './modules/go/emergency/emergency.module';
import { EntitlementsModule } from './modules/go/entitlements/entitlements.module';
import { IncentivesModule } from './modules/go/incentives/incentives.module';
import { MonitoringModule } from './modules/go/monitoring/monitoring.module';
import { PackagesModule } from './modules/go/packages/packages.module';
import { PassportModule } from './modules/go/passport/passport.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { PublicTrackingModule } from './modules/go/public-tracking/public-tracking.module';
import { RadarModule } from './modules/go/radar/radar.module';
import { RatingsModule } from './modules/go/ratings/ratings.module';
import { RideChatModule } from './modules/go/ride-chat/ride-chat.module';
import { RidesModule } from './modules/go/rides/rides.module';
import { SavedPlacesModule } from './modules/go/saved-places/saved-places.module';
import { ScheduledModule } from './modules/go/scheduled/scheduled.module';
import { ServiceCatalogModule } from './modules/go/service-catalog/service-catalog.module';
import { SupportModule } from './modules/go/support/support.module';
import { StoresModule } from './modules/go/stores/stores.module';
import { WalletsModule } from './modules/go/wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
    }),
    PrismaModule,
    ObjectStorageModule,
    RedisModule,
    QueueModule,
    AuthCoreModule,
    NotificationsModule,
    RealtimeModule,
    AuditModule,
    DriverSessionsModule,
    AuthModule,
    SystemModule,
    RideCategoriesModule,
    PackagesModule,
    ServiceCatalogModule,
    PricingModule,
    BranchesModule,
    CitiesModule,
    DriversModule,
    EmployeesModule,
    VehiclesModule,
    CustomersModule,
    SavedPlacesModule,
    GoConfigModule,
    BrandingModule,
    AlertsModule,
    ScheduledModule,
    MonitoringModule,
    ComplaintsModule,
    SupportModule,
    EmergencyModule,
    CasesModule,
    EntitlementsModule,
    WalletsModule,
    IncentivesModule,
    CompensationModule,
    PassportModule,
    DriverPassportModule,
    DiscountsModule,
    RatingsModule,
    RidesModule,
    RideChatModule,
    PublicTrackingModule,
    DispatchModule,
    IdempotencyModule,
    RadarModule,
    CommandCenterModule,
    ReportsModule,
    StoresModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GoExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Inside idempotency, so stored replays are already redacted.
    { provide: APP_INTERCEPTOR, useClass: DriverRedactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: CustomerRedactionInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}

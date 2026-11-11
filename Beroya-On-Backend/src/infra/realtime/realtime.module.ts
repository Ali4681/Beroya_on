import { forwardRef, Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../../modules/go/notifications/notifications.module';
import { CustomerGateway, DriverGateway, StaffGateway } from './gateways';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  providers: [RealtimeService, CustomerGateway, DriverGateway, StaffGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}

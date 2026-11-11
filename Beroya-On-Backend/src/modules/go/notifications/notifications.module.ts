import { forwardRef, Global, Module } from '@nestjs/common';
import { RealtimeModule } from '../../../infra/realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}

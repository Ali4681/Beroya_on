import { Module, forwardRef } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [forwardRef(() => CasesModule)],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}

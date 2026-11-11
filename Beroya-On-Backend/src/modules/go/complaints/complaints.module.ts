import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PassportModule } from '../passport/passport.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  imports: [AlertsModule, PassportModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}

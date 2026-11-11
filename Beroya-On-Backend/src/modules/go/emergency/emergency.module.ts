import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { EmergencyAudioGateway } from './emergency-audio.gateway';
import { EmergencyController } from './emergency.controller';
import { EmergencyProcessor } from './emergency.processor';
import { EmergencyService } from './emergency.service';
import { EmergencyStorageService } from './emergency-storage.service';

@Module({
  imports: [AlertsModule],
  controllers: [EmergencyController],
  providers: [EmergencyService, EmergencyStorageService, EmergencyAudioGateway, EmergencyProcessor],
  exports: [EmergencyService],
})
export class EmergencyModule {}

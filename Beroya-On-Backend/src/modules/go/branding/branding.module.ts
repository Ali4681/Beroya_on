import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { BrandingStorageService } from './branding-storage.service';

@Module({
  controllers: [BrandingController],
  providers: [BrandingService, BrandingStorageService],
  exports: [BrandingService],
})
export class BrandingModule {}

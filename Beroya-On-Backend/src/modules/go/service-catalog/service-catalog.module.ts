import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceImageStorage } from './service-image.storage';

@Module({
  imports: [DiscountsModule],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService, ServiceImageStorage],
})
export class ServiceCatalogModule {}

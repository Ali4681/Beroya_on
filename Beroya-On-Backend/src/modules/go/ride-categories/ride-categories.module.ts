import { Module } from '@nestjs/common';
import { CategoryImageStorage } from './category-image.storage';
import { RideCategoriesController } from './ride-categories.controller';
import { RideCategoriesService } from './ride-categories.service';

@Module({
  controllers: [RideCategoriesController],
  providers: [RideCategoriesService, CategoryImageStorage],
  exports: [RideCategoriesService],
})
export class RideCategoriesModule {}

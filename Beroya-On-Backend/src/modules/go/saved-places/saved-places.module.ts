import { Module } from '@nestjs/common';
import { SavedPlacesController } from './saved-places.controller';
import { SavedPlacesService } from './saved-places.service';

@Module({
  controllers: [SavedPlacesController],
  providers: [SavedPlacesService],
  exports: [SavedPlacesService],
})
export class SavedPlacesModule {}

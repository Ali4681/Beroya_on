import { Module } from '@nestjs/common';
import { PackageImageStorage } from './package-image.storage';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  controllers: [PackagesController],
  providers: [PackagesService, PackageImageStorage],
})
export class PackagesModule {}

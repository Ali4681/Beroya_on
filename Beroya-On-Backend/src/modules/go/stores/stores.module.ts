import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PosService } from './pos.service';
import { DriverPosHistoryController, PosController, StoresAdminController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [AuthModule, WalletsModule],
  controllers: [StoresAdminController, PosController, DriverPosHistoryController],
  providers: [StoresService, PosService],
})
export class StoresModule {}

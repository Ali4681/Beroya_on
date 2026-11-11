import { Module } from '@nestjs/common';
import { CustomerWalletService } from './customer-wallet.service';
import { WalletService } from './wallet.service';
import { WalletsController } from './wallets.controller';

@Module({
  controllers: [WalletsController],
  providers: [WalletService, CustomerWalletService],
  exports: [WalletService, CustomerWalletService],
})
export class WalletsModule {}

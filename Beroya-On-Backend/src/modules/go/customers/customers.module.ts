import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitiesModule } from '../cities/cities.module';
import { RideChatModule } from '../ride-chat/ride-chat.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerAvatarStorage } from './customer-profile.view';

@Module({
  imports: [CitiesModule, AuthModule, RideChatModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerAvatarStorage],
  exports: [CustomersService, CustomerAvatarStorage],
})
export class CustomersModule {}

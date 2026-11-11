import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { ConsoleSmsSender, SmsSender } from './sms.sender';
import { StaffAvatarStorage } from './staff-avatar.storage';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    SessionService,
    StaffAvatarStorage,
    { provide: SmsSender, useClass: ConsoleSmsSender },
  ],
  exports: [SessionService, OtpService, StaffAvatarStorage],
})
export class AuthModule {}

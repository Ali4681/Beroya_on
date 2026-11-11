import { Module } from '@nestjs/common';
import { ChatMediaStorage } from './chat-media';
import { RideChatController } from './ride-chat.controller';
import { RideChatService } from './ride-chat.service';

@Module({
  controllers: [RideChatController],
  providers: [RideChatService, ChatMediaStorage],
  exports: [ChatMediaStorage],
})
export class RideChatModule {}

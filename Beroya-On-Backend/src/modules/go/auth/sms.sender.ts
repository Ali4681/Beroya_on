import { Injectable, Logger } from '@nestjs/common';

export abstract class SmsSender {
  abstract send(phone: string, message: string): Promise<void>;
}

/** Placeholder until an SMS provider is chosen; logs instead of sending. */
@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`-> ${phone}: ${message}`);
  }
}

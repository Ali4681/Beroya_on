import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoOtpPurpose } from '@/generated/prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { SmsSender } from './sms.sender';

const MAX_REQUESTS_PER_HOUR = 10;

@Injectable()
export class OtpService {
  private readonly cfg: AppConfig['otp'];

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sms: SmsSender,
  ) {
    this.cfg = config.getOrThrow<AppConfig>('app').otp;
  }

  private hash(phone: string, code: string) {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  async issue(phone: string, purpose: GoOtpPurpose) {
    const last = await this.prisma.goOtpRequest.findFirst({
      where: { phone, purpose },
      orderBy: { created_at: 'desc' },
    });
    if (last) {
      const elapsed = (Date.now() - last.created_at.getTime()) / 1000;
      if (elapsed < this.cfg.resendCooldownSeconds) {
        throw new GoException(GoErrorCode.OTP_RESEND_TOO_SOON, 'Please wait before requesting a new code', {
          retry_after_sec: Math.ceil(this.cfg.resendCooldownSeconds - elapsed),
        });
      }
    }

    // E2E suites share seed phones; skip hourly cap under NODE_ENV=test.
    if (process.env.NODE_ENV !== 'test') {
      const hourly = await this.redis.incr(`otp:hourly:${purpose}:${phone}`, 3600);
      if (hourly > MAX_REQUESTS_PER_HOUR) {
        throw new GoException(GoErrorCode.RATE_LIMITED, 'Too many OTP requests, try again later');
      }
    }

    const code = this.cfg.devMode ? this.cfg.devCode : String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.goOtpRequest.updateMany({
        where: { phone, purpose, consumed_at: null },
        data: { consumed_at: new Date() },
      }),
      this.prisma.goOtpRequest.create({
        data: {
          phone,
          purpose,
          code_hash: this.hash(phone, code),
          expires_at: new Date(Date.now() + this.cfg.ttlSeconds * 1000),
        },
      }),
    ]);

    if (!this.cfg.devMode) {
      await this.sms.send(phone, `Beroya On code: ${code}`);
    }

    return {
      sent: true,
      expires_in_sec: this.cfg.ttlSeconds,
      resend_after_sec: this.cfg.resendCooldownSeconds,
      ...(this.cfg.devMode ? { dev_code: code } : {}),
    };
  }

  /** Consumes the code on success; increments attempts on failure. */
  async verify(phone: string, purpose: GoOtpPurpose, code: string): Promise<void> {
    const req = await this.prisma.goOtpRequest.findFirst({
      where: { phone, purpose, consumed_at: null },
      orderBy: { created_at: 'desc' },
    });
    if (!req) throw new GoException(GoErrorCode.OTP_INVALID, 'No active code, request a new one');
    if (req.expires_at <= new Date()) throw new GoException(GoErrorCode.OTP_EXPIRED, 'Code expired, request a new one');
    if (req.attempts >= this.cfg.maxAttempts) {
      throw new GoException(GoErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Too many wrong attempts, request a new code');
    }

    const ok = timingSafeEqual(Buffer.from(req.code_hash, 'hex'), Buffer.from(this.hash(phone, code), 'hex'));
    if (!ok) {
      const updated = await this.prisma.goOtpRequest.update({
        where: { id: req.id },
        data: { attempts: { increment: 1 } },
      });
      throw new GoException(GoErrorCode.OTP_INVALID, 'Wrong code', {
        remaining_attempts: Math.max(0, this.cfg.maxAttempts - updated.attempts),
      });
    }

    const consumed = await this.prisma.goOtpRequest.updateMany({
      where: { id: req.id, consumed_at: null },
      data: { consumed_at: new Date() },
    });
    if (consumed.count === 0) throw new GoException(GoErrorCode.OTP_INVALID, 'Code already used');
  }
}

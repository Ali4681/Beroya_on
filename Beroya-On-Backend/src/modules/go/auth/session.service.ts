import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GoDevicePlatform, User } from '@/generated/prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { AccessTokenPayload } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface DeviceContext {
  device_id?: string;
  device_name?: string;
  platform?: GoDevicePlatform;
  ip?: string;
  user_agent?: string;
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_expires_at: Date;
}

/** "15m" | "1h" | "900" -> seconds */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(ttl.trim());
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(m[1]);
  return n * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[m[2]];
}

/**
 * Refresh token format: `<session_id>.<secret>`; only sha256(secret) is stored.
 * Every refresh rotates the secret. Presenting an old secret revokes the session (theft detection).
 */
@Injectable()
export class SessionService {
  private readonly jwtCfg: AppConfig['jwt'];

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {
    this.jwtCfg = config.getOrThrow<AppConfig>('app').jwt;
  }

  private hash(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }

  private refreshExpiry() {
    return new Date(Date.now() + this.jwtCfg.refreshTtlDays * 86_400_000);
  }

  private async sign(user: Pick<User, 'id' | 'role' | 'branch_id'>, sessionId: string) {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, branch_id: user.branch_id, sid: sessionId };
    return this.jwt.signAsync(payload);
  }

  async create(user: Pick<User, 'id' | 'role' | 'branch_id'>, device: DeviceContext): Promise<IssuedTokens> {
    const secret = randomBytes(32).toString('base64url');
    const expires = this.refreshExpiry();
    const session = await this.prisma.goUserSession.create({
      data: {
        user_id: user.id,
        refresh_token_hash: this.hash(secret),
        device_id: device.device_id,
        device_name: device.device_name,
        platform: device.platform,
        ip: device.ip,
        user_agent: device.user_agent?.slice(0, 255),
        expires_at: expires,
      },
    });
    return {
      access_token: await this.sign(user, session.id),
      refresh_token: `${session.id}.${secret}`,
      token_type: 'Bearer',
      expires_in: ttlToSeconds(this.jwtCfg.accessTtl),
      refresh_expires_at: expires,
    };
  }

  async rotate(refreshToken: string): Promise<{ tokens: IssuedTokens; userId: string }> {
    const invalid = () => new GoException(GoErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid or expired');
    const dot = refreshToken.indexOf('.');
    if (dot <= 0) throw invalid();
    const sessionId = refreshToken.slice(0, dot);
    const secret = refreshToken.slice(dot + 1);
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw invalid();

    const session = await this.prisma.goUserSession.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.revoked_at || session.expires_at <= new Date()) throw invalid();

    const matches = timingSafeEqual(Buffer.from(session.refresh_token_hash, 'hex'), Buffer.from(this.hash(secret), 'hex'));
    if (!matches) {
      await this.revoke(session.id);
      throw invalid();
    }
    if (!session.user.is_active) throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');

    const nextSecret = randomBytes(32).toString('base64url');
    const expires = this.refreshExpiry();
    const rotated = await this.prisma.goUserSession.updateMany({
      where: { id: session.id, refresh_token_hash: session.refresh_token_hash, revoked_at: null },
      data: { refresh_token_hash: this.hash(nextSecret), last_used_at: new Date(), expires_at: expires },
    });
    if (rotated.count === 0) throw invalid();

    return {
      userId: session.user_id,
      tokens: {
        access_token: await this.sign(session.user, session.id),
        refresh_token: `${session.id}.${nextSecret}`,
        token_type: 'Bearer',
        expires_in: ttlToSeconds(this.jwtCfg.accessTtl),
        refresh_expires_at: expires,
      },
    };
  }

  async revoke(sessionId: string) {
    await this.prisma.goUserSession.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.goUserSession.updateMany({
      where: { user_id: userId, revoked_at: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revoked_at: new Date() },
    });
  }
}

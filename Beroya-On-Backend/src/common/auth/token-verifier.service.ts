import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import type { AccessTokenPayload, AuthUser } from './auth-user';

/**
 * Verifies an access token and confirms that the user is active and the session is not revoked.
 * Shared by the HTTP guard and the Socket.IO handshake.
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async verify(token: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Invalid or expired access token');
    }

    const session = await this.prisma.goUserSession.findUnique({
      where: { id: payload.sid },
      select: { revoked_at: true, user: { select: { id: true, role: true, branch_id: true, is_active: true } } },
    });
    if (!session || session.revoked_at || session.user.id !== payload.sub) {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Session is no longer valid');
    }
    if (!session.user.is_active) {
      throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
    }

    return {
      id: session.user.id,
      role: session.user.role,
      branch_id: session.user.branch_id,
      session_id: payload.sid,
    };
  }
}

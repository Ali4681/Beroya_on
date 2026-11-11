import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import { GoRole } from '@/generated/prisma/client';
import type { Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../../common/auth/auth-user';
import { BranchScopeService } from '../../common/auth/branch-scope.service';
import { TokenVerifier } from '../../common/auth/token-verifier.service';
import { GoErrorCode } from '../../common/errors/go-error-codes';
import { GoException } from '../../common/errors/go.exception';
import { RealtimeService } from './realtime.service';
import { Rooms } from './rooms';

export type GoSocket = Socket & { data: { user: AuthUser } };

function extractToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth?.token as string | undefined;
  if (auth) return auth.replace(/^Bearer\s+/i, '');
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = socket.handshake.query?.token;
  return typeof query === 'string' ? query : undefined;
}

/**
 * Handshake auth: `io(url + namespace, { auth: { token: '<access_token>' } })`.
 * Rejected connections receive `connect_error` with `err.message = <GoErrorCode>`.
 */
export abstract class BaseGoGateway implements OnGatewayInit, OnGatewayConnection {
  protected abstract readonly allowedRoles: readonly GoRole[];
  protected abstract readonly namespaceKey: 'customer' | 'driver' | 'staff';
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly verifier: TokenVerifier,
    protected readonly branchScope: BranchScopeService,
    protected readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Namespace) {
    this.realtime.register(this.namespaceKey, server);
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((err: unknown) => {
          const code = err instanceof GoException ? err.code : GoErrorCode.UNAUTHORIZED;
          const error = new Error(code) as Error & { data?: unknown };
          error.data = { code, message: err instanceof Error ? err.message : code };
          next(error);
        });
    });
  }

  private async authenticate(socket: Socket) {
    const token = extractToken(socket);
    if (!token) throw new GoException(GoErrorCode.UNAUTHORIZED, 'Missing token');
    const user = await this.verifier.verify(token);
    if (user.role !== GoRole.SUPER_ADMIN && !this.allowedRoles.includes(user.role)) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, `Role ${user.role} cannot join this namespace`);
    }
    socket.data.user = user;
  }

  async handleConnection(socket: GoSocket) {
    const user = socket.data.user;
    const rooms = this.roomsFor(user);
    await socket.join(rooms);
    socket.emit('connected', { user_id: user.id, role: user.role, rooms });
  }

  protected roomsFor(user: AuthUser): string[] {
    const rooms = [Rooms.user(user.id)];
    if (this.namespaceKey !== 'staff') return rooms;
    const scope = this.branchScope.scopeOf(user);
    if (scope) rooms.push(Rooms.branch(scope), Rooms.branchRole(scope, user.role));
    else rooms.push(Rooms.staffGlobal(), Rooms.globalRole(user.role));
    return rooms;
  }

  protected pong(socket: GoSocket) {
    return { pong: true, user_id: socket.data.user.id, at: new Date().toISOString() };
  }
}

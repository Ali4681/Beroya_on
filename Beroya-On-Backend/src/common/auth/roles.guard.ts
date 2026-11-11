import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GoRole } from '@/generated/prisma/client';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import type { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/** SUPER_ADMIN passes every role check ("Full access", Ticket §37). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<GoRole[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new GoException(GoErrorCode.UNAUTHORIZED);
    if (user.role === GoRole.SUPER_ADMIN || roles.includes(user.role)) return true;

    throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, `Role ${user.role} is not allowed`, {
      allowed_roles: roles,
    });
  }
}

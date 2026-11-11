import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'go:isPublic';
export const ROLES_KEY = 'go:roles';

/** Skip JWT authentication for this route/controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route/controller to fixed roles (Ticket §1.1 — no dynamic permissions). */
export const Roles = (...roles: readonly GoRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

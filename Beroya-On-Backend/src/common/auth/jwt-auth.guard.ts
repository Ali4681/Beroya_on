import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import { IS_PUBLIC_KEY } from './decorators';
import { TokenVerifier } from './token-verifier.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Missing bearer token');
    }
    req.user = await this.verifier.verify(header.slice(7).trim());
    return true;
  }
}

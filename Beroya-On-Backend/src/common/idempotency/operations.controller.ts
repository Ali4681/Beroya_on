import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { ApiGoErrors } from '../dto/api-errors.decorator';
import { GoErrorCode as E } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';

@ApiBearerAuth()
@ApiTags('Operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':key')
  @ApiOperation({
    summary: 'Outcome of an idempotent request sent with this Idempotency-Key (caller’s own keys only)',
    description:
      '`COMPLETED`: the action happened; `response` is the stored body (same as a replay). ' +
      '`IN_PROGRESS`: still running — poll again, do not send a new key. ' +
      '`NOT_FOUND`: never received, failed, or expired — the action was not applied; retry with the SAME key.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.VALIDATION_ERROR)
  async outcome(@CurrentUser() user: AuthUser, @Param('key') key: string) {
    if (key.length < 8 || key.length > 128) {
      throw new GoException(E.VALIDATION_ERROR, 'Idempotency-Key must be 8-128 characters');
    }
    const row = await this.prisma.goIdempotencyKey.findUnique({
      where: { user_id_key: { user_id: user.id, key } },
      select: { status: true, method: true, path: true, response_status: true, response_body: true, created_at: true, expires_at: true },
    });
    if (!row || row.expires_at <= new Date()) return { key, status: 'NOT_FOUND' as const };
    if (row.status === 'IN_PROGRESS') {
      return { key, status: 'IN_PROGRESS' as const, method: row.method, path: row.path, created_at: row.created_at };
    }
    return {
      key,
      status: 'COMPLETED' as const,
      method: row.method,
      path: row.path,
      created_at: row.created_at,
      response_status: row.response_status,
      response: row.response_body,
    };
  }
}

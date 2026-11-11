import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';

export class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'fallback'], example: 'up', description: 'fallback = in-memory store in use' })
  redis: 'up' | 'fallback';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  queue: 'up' | 'down';
}

export class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'], example: 'ok' })
  status: 'ok' | 'degraded' | 'down';

  @ApiProperty({ example: '0.1.0' })
  version: string;

  @ApiProperty({ example: 'phase-0' })
  phase: string;

  @ApiProperty({ example: 42 })
  uptime_sec: number;

  @ApiProperty({ type: HealthChecksDto })
  checks: HealthChecksDto;

  @ApiProperty({ example: '2026-10-04T10:00:00.000Z' })
  time: string;
}

export class ErrorCodeItemDto {
  @ApiProperty({ enum: GoErrorCode, enumName: 'GoErrorCode', example: GoErrorCode.ACTIVE_RIDE_EXISTS })
  code: GoErrorCode;

  @ApiProperty({ example: 409 })
  http_status: number;
}

export class EnumsDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { GoRole: ['CUSTOMER', 'DRIVER'], GoDevicePlatform: ['ANDROID', 'IOS', 'WEB'] } })
  enums: Record<string, string[]>;
}

export class PingDto {
  @ApiProperty({ enum: ['customer', 'driver', 'erp', 'admin'], example: 'erp' })
  scope: string;

  @ApiProperty({ example: 'f0e1...uuid' })
  user_id: string;

  @ApiProperty({ enum: GoRole, enumName: 'GoRole', example: GoRole.CUSTOMER_SERVICE })
  role: GoRole;

  @ApiPropertyOptional({
    example: 'a3b9...uuid',
    nullable: true,
    description: 'ERP only. Branch the user is restricted to; null = all branches',
  })
  branch_scope?: string | null;
}

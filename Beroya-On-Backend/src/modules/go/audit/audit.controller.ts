import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Roles } from '../../../common/auth/decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { AuditService } from './audit.service';

class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entity_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entity_id?: string;

  @ApiPropertyOptional({
    enum: ['driver', 'customer', 'ops', 'topup', 'complaints', 'emergency'],
    description: 'Preset desk filter: driver, customer, internal ops, top-ups, complaints, emergencies',
  })
  @IsOptional()
  @IsIn(['driver', 'customer', 'ops', 'topup', 'complaints', 'emergency'])
  category?: string;
}

@ApiBearerAuth()
@ApiTags('Admin')
@Controller('admin/audit')
@Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Internal audit log' })
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  @Get(':auditId')
  @ApiOperation({ summary: 'Audit log entry detail' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@Param('auditId', ParseUUIDPipe) auditId: string) {
    return this.audit.get(auditId);
  }
}

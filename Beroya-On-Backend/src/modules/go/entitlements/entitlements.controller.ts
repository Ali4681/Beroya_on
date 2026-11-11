import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoDriverEntitlementStatus, GoRole } from '@/generated/prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { EntitlementsService } from './entitlements.service';

class EntitlementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoDriverEntitlementStatus })
  @IsOptional()
  @IsIn(Object.values(GoDriverEntitlementStatus))
  status?: GoDriverEntitlementStatus;
}

class ApproveEntitlementDto {
  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  approved_amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class RejectEntitlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

@ApiBearerAuth()
@Controller()
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('erp/finance/driver-entitlements')
  @Roles(GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List driver entitlements (Ticket §18.3)' })
  list(@CurrentUser() user: AuthUser, @Query() q: EntitlementsQueryDto) {
    return this.entitlements.list(user, q);
  }

  @Get('erp/finance/driver-entitlements/:id')
  @Roles(GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.entitlements.get(user, id);
  }

  @Post('erp/finance/driver-entitlements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveEntitlementDto,
  ) {
    return this.entitlements.approve(user, id, dto);
  }

  @Post('erp/finance/driver-entitlements/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectEntitlementDto,
  ) {
    return this.entitlements.reject(user, id, dto);
  }
}

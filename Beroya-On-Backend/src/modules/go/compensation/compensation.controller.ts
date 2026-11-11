import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoCompensationBearer, GoCompensationType, GoRole } from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CompensationService } from './compensation.service';

class ApplyCompensationDto {
  @ApiProperty({ enum: GoCompensationType })
  @IsIn(Object.values(GoCompensationType))
  type!: GoCompensationType;

  @ApiPropertyOptional()
  @ValidateIf((o: ApplyCompensationDto) => o.type === GoCompensationType.PERCENTAGE)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentage?: number;

  @ApiPropertyOptional()
  @ValidateIf((o: ApplyCompensationDto) => o.type === GoCompensationType.FIXED_AMOUNT)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixed_amount?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}

class CompensationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoCompensationBearer })
  @IsOptional()
  @IsIn(Object.values(GoCompensationBearer))
  bearer?: GoCompensationBearer;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ride_id?: string;
}

class AllocationDto {
  @ApiProperty({ enum: GoCompensationBearer })
  @IsIn(Object.values(GoCompensationBearer))
  bearer!: GoCompensationBearer;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  beroya_share?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  driver_share?: number;
}

@ApiBearerAuth()
@Controller()
export class CompensationController {
  constructor(private readonly compensation: CompensationService) {}

  @Get('erp/finance/compensations')
  @Roles(
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.FINANCE,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List ride compensations' })
  list(@CurrentUser() user: AuthUser, @Query() q: CompensationsQueryDto) {
    return this.compensation.list(user, q);
  }

  @Get('erp/finance/compensations/:compensationId')
  @Roles(
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.FINANCE,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Get a ride compensation' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@CurrentUser() user: AuthUser, @Param('compensationId', ParseUUIDPipe) compensationId: string) {
    return this.compensation.get(user, compensationId);
  }

  @Post('erp/rides/:rideId/compensation')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Apply compensation immediately (Ticket §19.1)' })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  apply(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ApplyCompensationDto,
  ) {
    return this.compensation.apply(user, rideId, dto);
  }

  @Post('erp/finance/compensations/:compensationId/allocation')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Finance cost bearer allocation (Ticket §19.2)' })
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('compensationId', ParseUUIDPipe) compensationId: string,
    @Body() dto: AllocationDto,
  ) {
    return this.compensation.allocate(user, compensationId, dto);
  }
}

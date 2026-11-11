import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoComplaintPriority, GoComplaintStatus, GoRole } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { COMPLAINT_REASON_CODES, type ComplaintReasonCode } from './complaint-reasons';
import { ComplaintsService } from './complaints.service';

class CreateComplaintDto {
  @ApiProperty({ enum: COMPLAINT_REASON_CODES, example: 'LATE_DRIVER', description: 'DANGEROUS_DRIVING is URGENT' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(COMPLAINT_REASON_CODES)
  reason_code!: ComplaintReasonCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class ComplaintsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoComplaintStatus })
  @IsOptional()
  @IsIn(Object.values(GoComplaintStatus))
  status?: GoComplaintStatus;

  @ApiPropertyOptional({ enum: GoComplaintPriority })
  @IsOptional()
  @IsIn(Object.values(GoComplaintPriority))
  priority?: GoComplaintPriority;
}

class UpdateComplaintDto {
  @ApiPropertyOptional({ enum: [GoComplaintStatus.OPEN, GoComplaintStatus.IN_REVIEW, GoComplaintStatus.RESOLVED] })
  @IsOptional()
  @IsIn([GoComplaintStatus.OPEN, GoComplaintStatus.IN_REVIEW, GoComplaintStatus.RESOLVED])
  status?: GoComplaintStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class CustomerComplaintsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@ApiBearerAuth()
@Controller()
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get('customer/complaints')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'List my ride complaints (Ticket §20 / §26)',
    description:
      'Returns id, ride_id, reason_code, notes, status (OPEN|IN_REVIEW|RESOLVED|REJECTED), resolution_note, created_at, updated_at.',
  })
  listMine(@CurrentUser() user: AuthUser, @Query() q: CustomerComplaintsQueryDto) {
    return this.complaints.listMine(user.id, q.page, q.limit);
  }

  @Idempotent()
  @Post('customer/rides/:rideId/complaints')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Create complaint (Ticket §14.1)',
    description:
      'COMPLETED rides only, up to 7 days after completion (COMPLAINT_NOT_ALLOWED with reason RIDE_NOT_COMPLETED | WINDOW_EXPIRED). ' +
      'One complaint per ride: a second one returns COMPLAINT_ALREADY_EXISTS with { complaint }.',
  })
  @ApiGoErrors(
    E.RIDE_NOT_FOUND,
    E.VALIDATION_ERROR,
    E.COMPLAINT_NOT_ALLOWED,
    E.COMPLAINT_ALREADY_EXISTS,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  create(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: CreateComplaintDto,
  ) {
    return this.complaints.createByCustomer(user.id, rideId, dto);
  }

  @Get('erp/complaints')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  list(@CurrentUser() user: AuthUser, @Query() q: ComplaintsQueryDto) {
    return this.complaints.list(user, q);
  }

  @Get('erp/complaints/:complaintId')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  get(@CurrentUser() user: AuthUser, @Param('complaintId', ParseUUIDPipe) complaintId: string) {
    return this.complaints.get(user, complaintId);
  }

  @Post('erp/complaints/:complaintId/claim')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  claim(@CurrentUser() user: AuthUser, @Param('complaintId', ParseUUIDPipe) complaintId: string) {
    return this.complaints.claim(user, complaintId);
  }

  @Patch('erp/complaints/:complaintId')
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  update(
    @CurrentUser() user: AuthUser,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: UpdateComplaintDto,
  ) {
    return this.complaints.update(user, complaintId, dto);
  }

  @Post('erp/complaints/:complaintId/close')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  close(@CurrentUser() user: AuthUser, @Param('complaintId', ParseUUIDPipe) complaintId: string) {
    return this.complaints.close(user, complaintId);
  }
}

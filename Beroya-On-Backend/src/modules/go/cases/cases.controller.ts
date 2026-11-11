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
import { GoAccidentSeverity, GoCaseStatus, GoCaseType, GoRole } from '@/generated/prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CasesService } from './cases.service';

class CasesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoCaseType })
  @IsOptional()
  @IsIn(Object.values(GoCaseType))
  type?: GoCaseType;

  @ApiPropertyOptional({ enum: GoCaseStatus })
  @IsOptional()
  @IsIn(Object.values(GoCaseStatus))
  status?: GoCaseStatus;
}

class UpdateCaseDto {
  @ApiPropertyOptional({ enum: [GoCaseStatus.OPEN, GoCaseStatus.IN_REVIEW] })
  @IsOptional()
  @IsIn([GoCaseStatus.OPEN, GoCaseStatus.IN_REVIEW])
  status?: GoCaseStatus;

  @ApiPropertyOptional({ enum: GoAccidentSeverity })
  @IsOptional()
  @IsIn(Object.values(GoAccidentSeverity))
  accident_severity?: GoAccidentSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  negligence_suspected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supervisor_decision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason_code?: string;
}

class StatementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  statement!: string;
}

class NoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

@ApiBearerAuth()
@Controller()
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get('erp/cases')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List accident/breakdown cases (Ticket §16.4)' })
  list(@CurrentUser() user: AuthUser, @Query() q: CasesQueryDto) {
    return this.cases.list(user, q);
  }

  @Get('erp/cases/:caseId')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  get(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.cases.get(user, caseId);
  }

  @Patch('erp/cases/:caseId')
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.cases.update(user, caseId, dto);
  }

  @Post('erp/cases/:caseId/customer-statement')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  customerStatement(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: StatementDto,
  ) {
    return this.cases.addCustomerStatement(user, caseId, dto.statement);
  }

  @Post('erp/cases/:caseId/driver-statement')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  driverStatement(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: StatementDto,
  ) {
    return this.cases.addDriverStatement(user, caseId, dto.statement);
  }

  @Post('erp/cases/:caseId/notes')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  note(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: NoteDto,
  ) {
    return this.cases.addNote(user, caseId, dto.note);
  }

  @Post('erp/cases/:caseId/close')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  close(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.cases.close(user, caseId);
  }

  @Post('erp/cases/:caseId/reopen')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  reopen(@CurrentUser() user: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.cases.reopen(user, caseId);
  }
}

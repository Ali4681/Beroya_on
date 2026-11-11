import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CreateVehicleDto, DriverListQueryDto, UpdateVehicleDto } from '../drivers/dto/drivers.dto';
import { VehiclesService } from './vehicles.service';

@ApiBearerAuth()
@Controller()
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('erp/vehicles')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List vehicles (branch-scoped)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED)
  listErp(@CurrentUser() user: AuthUser, @Query() q: DriverListQueryDto) {
    return this.vehicles.list(user, q.page, q.limit, q.branch_id);
  }

  @Get('erp/vehicles/:vehicleId')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Get a vehicle' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  getErp(@CurrentUser() user: AuthUser, @Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.vehicles.get(vehicleId, user);
  }

  @Get('admin/vehicles')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listAdmin(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.vehicles.list(user, q.page, q.limit, q.branch_id);
  }

  @Post('admin/vehicles')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create vehicle (+ optional capabilities & set_as_active)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT, E.NOT_FOUND)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(user, dto);
  }

  @Patch('admin/vehicles/:vehicleId')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user, vehicleId, dto);
  }
}

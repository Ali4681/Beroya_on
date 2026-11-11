import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { BranchesService } from './branches.service';
import { BranchListQueryDto, CreateBranchDto, ResolveBranchDto, UpdateBranchDto } from './dto/branches.dto';

@ApiBearerAuth()
@Controller()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get('erp/branches')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List branches (scoped for branch-bound staff)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  listErp(@CurrentUser() user: AuthUser, @Query() q: BranchListQueryDto) {
    return this.branches.list(user, q.page, q.limit, q.active_only);
  }

  @Get('admin/branches')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'List all branches' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  listAdmin(@CurrentUser() user: AuthUser, @Query() q: BranchListQueryDto) {
    return this.branches.list(user, q.page, q.limit, q.active_only);
  }

  @Post('admin/branches')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create branch' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.branches.create(user, dto);
  }

  @Patch('admin/branches/:branchId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update branch / service area' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(user, branchId, dto);
  }

  @Get('admin/branches/:branchId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Branch detail',
    description: '`service_area_center` is the service-area centroid used when center_lat/center_lng are not set.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.branches.detail(branchId);
  }

  @Post('admin/branches/resolve-pickup')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Resolve owning branch from pickup lat/lng (Ticket §1.4 preview)' })
  @ApiOkResponse({ description: 'Matching active branch' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  resolve(@Body() dto: ResolveBranchDto) {
    return this.branches.resolveFromPickup(dto.lat, dto.lng);
  }
}

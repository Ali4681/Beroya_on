import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { GoDocumentType, GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { DriverProfileService } from './driver-profile.service';
import { DriversService } from './drivers.service';
import {
  PhoneChangeRequestListQueryDto,
  RejectDriverPhoneChangeDto,
} from './dto/driver-profile.dto';
import { CreateDriverDto, DriverListQueryDto, UpdateDriverDto, UpsertDocumentDto } from './dto/drivers.dto';
import { DriverEligibilityService } from './eligibility.service';

class DriverAccountDeletedDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ example: '2026-10-19T12:00:00.000Z', description: 'ISO-8601 UTC soft-delete timestamp' })
  deleted_at!: Date;
}

@Controller()
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
    private readonly eligibility: DriverEligibilityService,
    private readonly profiles: DriverProfileService,
  ) {}

  @ApiBearerAuth()
  @Get('driver/eligibility')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Driver eligibility check (Ticket §6.1)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  myEligibility(@CurrentUser() user: AuthUser) {
    return this.eligibility.evaluate(user.id);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Delete('driver/account')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Soft-delete own driver account (home menu «حذف حسابي»)',
    description:
      'No body. Requires Idempotency-Key. Soft-delete: sessions revoked, `is_active=false`, phone cleared — ' +
      'login with this account fails. Blocks when an active ride exists ' +
      '(DRIVER_ASSIGNED / DRIVER_EN_ROUTE / ARRIVED / IN_PROGRESS / …) → ACTIVE_RIDE_EXISTS (409). ' +
      'Same key replays `{ ok: true, deleted_at }` without repeating side effects. ' +
      'Wallet-due block (WALLET_DUE) is out of scope for now.',
  })
  @ApiOkResponse({ type: DriverAccountDeletedDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.IDEMPOTENCY_KEY_REQUIRED, E.ACTIVE_RIDE_EXISTS, E.ACCOUNT_NOT_FOUND)
  deleteAccount(@CurrentUser() user: AuthUser) {
    return this.profiles.deleteOwnAccount(user.id);
  }

  @ApiBearerAuth()
  @Get('erp/drivers')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List drivers (branch-scoped); `q` searches name, phone and plate across all pages' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED)
  listErp(@CurrentUser() user: AuthUser, @Query() q: DriverListQueryDto) {
    return this.drivers.list(user, q.page, q.limit, q.branch_id, { q: q.q, state: q.state });
  }

  @ApiBearerAuth()
  @Get('erp/fleet')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Driver locations and availability for the operations map' })
  fleet(@CurrentUser() user: AuthUser, @Query() q: DriverListQueryDto) {
    return this.drivers.fleet(user, q.branch_id);
  }

  @ApiBearerAuth()
  @Get('erp/drivers/:driverId/eligibility')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Staff view of driver eligibility reasons' })
  async driverEligibility(@CurrentUser() user: AuthUser, @Param('driverId', ParseUUIDPipe) driverId: string) {
    const driver = await this.drivers.get(driverId, user);
    return this.eligibility.evaluate(driver.user_id);
  }

  @ApiBearerAuth()
  @Get('erp/drivers/:driverId')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  getErp(@CurrentUser() user: AuthUser, @Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.drivers.get(driverId, user);
  }

  @ApiBearerAuth()
  @Post('admin/drivers')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Onboard driver (creates User DRIVER + GoDriverProfile)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT, E.BRANCH_SCOPE_DENIED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user, dto);
  }

  @ApiBearerAuth()
  @Get('admin/drivers/phone-change-requests')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'List driver phone-change requests (branch-scoped)',
    description:
      'Filter by `status` (default all). PENDING items await OTP-verified requests. ' +
      'Approve applies User.phone; reject leaves the old number.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED)
  listPhoneChangeRequests(@CurrentUser() user: AuthUser, @Query() q: PhoneChangeRequestListQueryDto) {
    return this.profiles.listPhoneChangeRequests(user, q);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Post('admin/drivers/phone-change-requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Approve pending phone change',
    description:
      'Sets User.phone to requested_phone, revokes all driver sessions, audits, and pushes driver.phone_change_approved. ' +
      'Fails with CONFLICT if another DRIVER already owns the number.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.NOT_FOUND,
    E.CONFLICT,
    E.BRANCH_SCOPE_DENIED,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  approvePhoneChange(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.profiles.approvePhoneChangeRequest(user, requestId);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Post('admin/drivers/phone-change-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Reject pending phone change',
    description: 'Leaves User.phone unchanged. Optional reason. Pushes driver.phone_change_rejected.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.NOT_FOUND,
    E.CONFLICT,
    E.BRANCH_SCOPE_DENIED,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  rejectPhoneChange(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RejectDriverPhoneChangeDto,
  ) {
    return this.profiles.rejectPhoneChangeRequest(user, requestId, dto.reason);
  }

  @ApiBearerAuth()
  @Patch('admin/drivers/:driverId')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR, E.BRANCH_SCOPE_DENIED)
  update(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(user, driverId, dto);
  }

  @ApiBearerAuth()
  @Get('admin/drivers/:driverId/avatar')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver photo (as shown to customers)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  async avatar(@CurrentUser() user: AuthUser, @Param('driverId', ParseUUIDPipe) driverId: string) {
    const file = await this.drivers.readAvatar(user, driverId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('admin/drivers/:driverId/documents/:type/image')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver document photo' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  async documentImage(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('type', new ParseEnumPipe(GoDocumentType)) type: GoDocumentType,
    @Query('side') side?: string,
  ) {
    const file = await this.drivers.readDocumentImage(user, driverId, type, side === 'back' ? 'back' : 'front');
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('admin/drivers/:driverId/vehicle-photos/:photoId/image')
  @Roles(...STAFF_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver vehicle photo' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  async vehiclePhoto(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    const file = await this.drivers.readVehiclePhoto(user, driverId, photoId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Post('admin/drivers/:driverId/documents')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Upsert driver document (LICENSE, VEHICLE_REGISTRATION, …)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  upsertDoc(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UpsertDocumentDto,
  ) {
    return this.drivers.upsertDocument(user, driverId, dto);
  }
}

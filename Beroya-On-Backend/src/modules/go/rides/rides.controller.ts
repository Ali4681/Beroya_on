import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  GoCommissionBase,
  GoPaymentMethod,
  GoRideStatus,
  GoRideType,
  GoRole,
} from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import {
  AddStopDto,
  AssignDriverDto,
  CreateRideDto,
  DriverCancelRideDto,
  EndRideDto,
  ReturnChangeDto,
  EstimateRideDto,
  DriverBreakdownDto,
  LatLngDto,
  ReorderStopsDto,
  RideHistoryQueryDto,
  StaffCancelRideDto,
  UpdatePickupDto,
  UpdateRideNoteDto,
} from './dto/rides.dto';
import { RidesService } from './rides.service';
import { FareSettlementService } from './fare-settlement.service';

const COMMISSION_STATUSES = ['SUCCESS', 'PARTIAL', 'FAILED', 'PENDING'] as const;

class DriverInvoiceDto {
  @ApiProperty({
    example: 5000,
    description:
      'إجمالي الأجرة المعروض على البطاقة — gross_final_fare (مجموع المقاطع عند الاستبدال). ' +
      'ليس customer_payable (ما يدفعه العميل بعد الخصم).',
  })
  gross_fare!: number;

  @ApiProperty({
    example: 4500,
    description: 'ما يدفعه العميل بعد الخصم/التعويض — يختلف عن gross_fare عند وجود خصم',
  })
  customer_payable!: number;

  @ApiProperty({ example: 500 })
  discount_total!: number;

  @ApiProperty({
    example: 500,
    description:
      'فرق الخصم الذي أودعته الشركة في محفظة السائق تلقائياً (DISCOUNT_SUBSIDY). ' +
      'مثال: أجرة 20000 وخصم 50% → الزبون يدفع 10000 ويُضاف 10000 لمحفظة السائق على حساب الشركة.',
  })
  discount_subsidy!: number;

  @ApiProperty({
    example: 5000,
    description: 'المبلغ الذي حُسبت عليه العمولة (segment gross أو customer_payable حسب commission_base)',
  })
  commission_base_fare!: number;

  @ApiProperty({ enum: GoCommissionBase, enumName: 'GoCommissionBase' })
  commission_base!: GoCommissionBase;

  @ApiProperty({ example: 10 })
  commission_percentage!: number;

  @ApiProperty({ example: 450, description: 'العمولة المحسوبة — دائماً رقم (حتى عند فشل الخصم)' })
  commission_amount!: number;

  @ApiProperty({ example: 450, description: 'ما خُصم فعلياً من محفظة السائق' })
  commission_deducted!: number;

  @ApiProperty({
    enum: COMMISSION_STATUSES,
    example: 'SUCCESS',
    description: 'SUCCESS | PARTIAL (خصم ناقص) | FAILED (خطأ أثناء الخصم) | PENDING (مستحق بلا صف دفتر)',
  })
  commission_status!: (typeof COMMISSION_STATUSES)[number];

  @ApiProperty({
    example: 4550,
    description: 'أرباح السائق = commission_base_fare − commission_amount (لا تحسبها على العميل)',
  })
  driver_earnings!: number;

  @ApiProperty({ enum: GoPaymentMethod, enumName: 'GoPaymentMethod' })
  payment_method!: GoPaymentMethod;

  @ApiProperty({ example: 'كاش' })
  payment_method_label_ar!: string;

  @ApiProperty({ example: 0, description: 'مبلغ مخصوم من محفظة الزبون لهذه الرحلة' })
  wallet_paid_amount!: number;

  @ApiProperty({
    example: 4500,
    description: 'الكاش المتبقي على الزبون = max(0, customer_payable − wallet_paid_amount)',
  })
  cash_due!: number;

  @ApiProperty({ example: 0, description: 'الباقي المُرجع لمحفظة الزبون (إن وُجد)' })
  change_returned_amount!: number;

  @ApiProperty({
    example: true,
    description: 'true إذا ما زال يمكن استدعاء POST …/return-change',
  })
  can_return_change!: boolean;

  @ApiPropertyOptional({ example: 5000, nullable: true })
  actual_distance_m!: number | null;

  @ApiPropertyOptional({ example: 1500, nullable: true })
  actual_duration_sec!: number | null;

  @ApiPropertyOptional({ example: '2025-10-05T07:25:00.000Z', nullable: true })
  completed_at!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  pickup_address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  destination_address!: string | null;

  @ApiProperty({
    example: true,
    description: 'false when service_code is RENTAL (destination mirrors pickup)',
  })
  show_destination!: boolean;

  @ApiProperty({ example: 0, description: 'Billable waiting beyond free_waiting_sec' })
  billable_waiting_sec!: number;

  @ApiProperty({ example: 120 })
  free_waiting_sec!: number;

  @ApiProperty({ example: 5000 })
  combined_gross_fare!: number;

  @ApiProperty({ example: 0 })
  original_segment_fare!: number;

  @ApiProperty({ example: 5000 })
  replacement_segment_fare!: number;
}

class InvoiceCustomerDto {
  @ApiPropertyOptional({ example: 'خالد العلي', nullable: true })
  full_name!: string | null;

  @ApiPropertyOptional({
    example: '/api/v1/go/driver/rides/{rideId}/customer-avatar?v=1760000000000',
    nullable: true,
    description: 'Relative; needs driver Bearer. Null when the customer has no photo.',
  })
  avatar_url!: string | null;
}

class DriverRatingBlockDto {
  @ApiProperty({ example: true, description: 'false after the driver submitted a rating for this ride' })
  can_rate!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null until rated; then `{ stars }` only. Skip = simply do not call POST …/rating.',
  })
  my_rating!: { stars: number } | null;

  @ApiProperty({ example: '/api/v1/go/driver/rides/{rideId}/rating' })
  submit_path!: string;
}

class DriverInvoiceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: GoRideStatus, enumName: 'GoRideStatus', example: GoRideStatus.COMPLETED })
  status!: GoRideStatus;

  @ApiPropertyOptional({ type: InvoiceCustomerDto, nullable: true, description: 'Rate-sheet header (اسم الزبون + صورة)' })
  customer!: InvoiceCustomerDto | null;

  @ApiProperty({ type: DriverInvoiceDto })
  invoice!: DriverInvoiceDto;

  @ApiProperty({ type: DriverRatingBlockDto })
  rating!: DriverRatingBlockDto;
}

const TRACKING_DESCRIPTION =
  'Adds service_type, ends_at / rental_ends_at (expected end ISO for «ينتهي في …»), ' +
  'vehicle { plate_number, make, model, color, year } (snapshot at assignment, null while SEARCHING), ' +
  'driver.user.phone + driver.call_url (tel:) after assignment, driver.rating_avg / rating_count / avatar_url, ' +
  'and driver_location { lat, lng, heading, recorded_at } + driver_eta_sec. ' +
  'During DRIVER_ASSIGNED / DRIVER_EN_ROUTE also pickup_eta_sec / pickup_distance_m / pickup_route_polyline ' +
  '(same Redis-cached route the driver app uses — prefer over client Routes API). ' +
  'Location and ETA are null outside DRIVER_ASSIGNED / DRIVER_EN_ROUTE / ARRIVED / IN_PROGRESS, when the GPS fix is older ' +
  'than stale_location_seconds, and for a scheduled ride still reserved (DRIVER_ASSIGNED). ETA is to pickup before the ' +
  'trip and to the destination during it. active_emergency { id, status ACTIVE|CLOSED, claimed, claimed_at, started_at } ' +
  'is the open emergency, else the last closed one, else null.';

class FareStackDto {
  @ApiProperty({ enum: ['DISCOUNT_ONLY', 'COMPENSATION_ONLY', 'BOTH'] })
  @IsIn(['DISCOUNT_ONLY', 'COMPENSATION_ONLY', 'BOTH'])
  decision!: 'DISCOUNT_ONLY' | 'COMPENSATION_ONLY' | 'BOTH';
}

class ErpRidesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoRideStatus })
  @IsOptional()
  @IsIn(Object.values(GoRideStatus))
  status?: GoRideStatus;

  @ApiPropertyOptional({ enum: GoRideType })
  @IsOptional()
  @IsIn(Object.values(GoRideType))
  type?: GoRideType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driver_id?: string;

  @ApiPropertyOptional({ description: 'Search by public_number (case-insensitive substring)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

class CreateReplacementDto {
  @ApiProperty({ enum: ['ACCIDENT', 'BREAKDOWN'] })
  @IsIn(['ACCIDENT', 'BREAKDOWN'])
  reason!: 'ACCIDENT' | 'BREAKDOWN';

  @ApiPropertyOptional({ description: 'Interruption location (defaults to driver last GPS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({
    description: 'If set, assign this driver to the replacement ride immediately (after breakdown)',
  })
  @IsOptional()
  @IsUUID()
  driver_id?: string;
}

@ApiBearerAuth()
@Controller()
export class RidesController {
  constructor(
    private readonly rides: RidesService,
    private readonly fareSettlement: FareSettlementService,
  ) {}

  // ---------- Customer ----------

  @Post('customer/rides/estimate')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Fare estimate (Ticket §5.1)',
    description:
      '`night_fare: { percentage }` is set when the ride time (now, or scheduled_at for SCHEDULED) falls in the night window; ' +
      'every estimated_fare already includes it. The rate is fixed on the ride at creation.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.DISCOUNT_CODE_INVALID,
    E.DISCOUNT_CODE_EXPIRED,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_CATEGORY,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE,
    E.DISCOUNT_CODE_USAGE_EXHAUSTED,
    E.DISCOUNT_CODE_NEW_USERS_ONLY,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE,
  )
  estimate(@CurrentUser() user: AuthUser, @Body() dto: EstimateRideDto) {
    return this.rides.estimate(user, dto);
  }

  @Idempotent()
  @Post('customer/rides')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Create ride — starts SEARCHING (Ticket §5.2)',
    description:
      'payment_method WALLET holds the expected fare from the customer wallet at creation (no discount). ' +
      'If the balance is short the ride is not created and WALLET_INSUFFICIENT_BALANCE returns { required, balance, currency }. ' +
      'A discount code or service promotion forces CASH: customer pays the reduced amount in cash; ' +
      'nothing is held from the customer wallet; on complete the company credits discount_subsidy to the driver wallet ' +
      'and commission uses the full gross fare. ' +
      'A customer may hold one live ride (ACTIVE_RIDE_EXISTS) and any number of scheduled rides whose windows ' +
      '(estimated trip + 30 min) do not overlap (RIDE_TIME_CONFLICT with { ride_id, scheduled_at }). ' +
      'Scheduled rides are offered to drivers right away so a driver can reserve them.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.ACTIVE_RIDE_EXISTS,
    E.RIDE_TIME_CONFLICT,
    E.DISCOUNT_CODE_INVALID,
    E.DISCOUNT_CODE_EXPIRED,
    E.DISCOUNT_CODE_USAGE_EXHAUSTED,
    E.DISCOUNT_CODE_NEW_USERS_ONLY,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA,
    E.DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE,
    E.WALLET_INSUFFICIENT_BALANCE,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto) {
    return this.rides.create(user, dto);
  }

  @Get('customer/rides/active')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Current active ride or null',
    description:
      TRACKING_DESCRIPTION +
      ' Prefer this for home/tracking: assigned rides include service_type, vehicle, and driver.',
  })
  active(@CurrentUser() user: AuthUser) {
    return this.rides.activeForCustomer(user.id);
  }

  @Get('customer/rides')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Activity screen: own rides, paged',
    description:
      'Returns `{ items, page, limit, total, has_more }`. Each item is the same view as GET /customer/rides/:id ' +
      '(vehicle, driver photo + rating, tracking while active) plus `my_rating: { stars }` and ' +
      '`my_complaint: { id, status, reason_code, created_at }` (null when none). ' +
      'scope=current lists live + scheduled rides soonest first; scope=past lists finished rides newest first.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  history(@CurrentUser() user: AuthUser, @Query() q: RideHistoryQueryDto) {
    return this.rides.historyForCustomer(user.id, q);
  }

  @Get('customer/rides/:rideId/cancel-preview')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'What cancelling now would count as (late / en route), without cancelling',
    description:
      '`free_cancel_until` is set while a driver is assigned but not yet moving: cancelling after it counts as late.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.RIDE_NOT_FOUND)
  cancelPreview(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.cancelPreview(user.id, rideId);
  }

  @Get('customer/rides/:rideId')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Own ride details', description: TRACKING_DESCRIPTION })
  @ApiGoErrors(E.RIDE_NOT_FOUND)
  get(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.detailForCustomer(user.id, rideId);
  }

  @Get('customer/rides/:rideId/driver-avatar')
  @Roles(GoRole.CUSTOMER)
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Photo of the driver of your ride (use driver.avatar_url)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async driverAvatar(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    const file = await this.rides.driverAvatarForCustomer(user.id, rideId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Idempotent()
  @Post('customer/rides/:rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Customer cancel (Ticket §5.6)' })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE, E.INVALID_RIDE_TRANSITION, E.IDEMPOTENCY_KEY_REQUIRED)
  cancel(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.cancelByCustomer(user.id, rideId);
  }

  @Post('customer/rides/:rideId/stops')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  addStop(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: AddStopDto,
  ) {
    return this.rides.addStop(user.id, rideId, dto);
  }

  @Patch('customer/rides/:rideId/stops/:stopId')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  updateStop(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() dto: LatLngDto,
  ) {
    return this.rides.updateStop(user.id, rideId, stopId, dto);
  }

  @Delete('customer/rides/:rideId/stops/:stopId')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  deleteStop(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.rides.deleteStop(user.id, rideId, stopId);
  }

  @Put('customer/rides/:rideId/stops/reorder')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ReorderStopsDto,
  ) {
    return this.rides.reorderStops(user.id, rideId, dto.stop_ids);
  }

  @Patch('customer/rides/:rideId/destination')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  changeDestination(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: LatLngDto,
  ) {
    return this.rides.changeDestination(user.id, rideId, dto);
  }

  @Patch('customer/rides/:rideId/pickup')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Amend pickup before ARRIVED (Ticket §14)',
    description:
      'Allowed in SEARCHING / DRIVER_ASSIGNED / DRIVER_EN_ROUTE. Sends ride.pickup_updated to the driver. ' +
      'Pass source PIN | GPS | SEARCH | SAVED_PLACE. Audited for disputes. No cash side-effects.',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE, E.VALIDATION_ERROR)
  changePickup(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: UpdatePickupDto,
  ) {
    return this.rides.changePickup(user.id, rideId, dto);
  }

  @Patch('customer/rides/:rideId/note')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Edit the note to the driver — only while SEARCHING (before a driver is assigned)' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE)
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: UpdateRideNoteDto,
  ) {
    return this.rides.updateNote(user.id, rideId, dto.customer_note);
  }

  // ---------- Driver ride actions ----------

  @Get('driver/rides/active')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Current live ride (home screen)',
    description:
      'Returns the driver’s live immediate ride, or a scheduled ride that has entered execution ' +
      '(`DRIVER_EN_ROUTE` / `ARRIVED` / `IN_PROGRESS`). ' +
      'Does **not** return a reserved scheduled ride still in `DRIVER_ASSIGNED` before T-30 promotion — ' +
      'those appear on `GET /driver/scheduled-rides`. ' +
      'Includes unified `customer` card (name, phone, call_url, avatar_url, rating_*), ' +
      '`free_waiting_sec` / `no_show_after_arrived_sec` / `no_show_eligible_at` (timer starts at arrived_at), ' +
      '`payment_method` + `payment_method_label_ar`, and while EN_ROUTE/ASSIGNED: ' +
      '`pickup_eta_sec` / `pickup_distance_m` / `pickup_route_polyline` (route to pickup). ' +
      'While `IN_PROGRESS`: live `actual_distance_m` / `actual_duration_sec` from GPS track ' +
      '(distance) and wall clock from `started_at` (duration) — not estimated_*. ' +
      '`active_emergency` { id, status ACTIVE, claimed, claimed_at, started_at } when SOS is open, else null.',
  })
  driverActive(@CurrentUser() user: AuthUser) {
    return this.rides.activeForDriver(user.id);
  }

  @Get('driver/rides')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver ride history (mirror GET /customer/rides)',
    description:
      'Returns `{ items, page, limit, total, has_more }`. Registered before `/driver/rides/:rideId`. ' +
      'scope=current → live rides (assigned / en route / arrived / in progress / searching if still linked); ' +
      'scope=past → finished (COMPLETED, CANCELLED_*, NO_SHOW, …), newest first. ' +
      'Optional filters: from, to, status[]. Each item is enriched like GET /driver/rides/active ' +
      '(flat `customer` card with full_name / avatar / rating_*), plus fare fields for the history card: ' +
      '`pickup_address`, `original_destination_address`, `gross_final_fare`, `estimated_fare`, ' +
      '`completed_at` / `cancelled_at` / `created_at`, `public_number`, `display_code` (short UI `#TRP-4589`), `status`. ' +
      'Scheduled rows also include `online_before_minutes` (from dispatch config, default 30).',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  driverHistory(@CurrentUser() user: AuthUser, @Query() q: RideHistoryQueryDto) {
    return this.rides.historyForDriver(user.id, q);
  }

  @Get('driver/scheduled-rides')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Upcoming reserved scheduled rides (Ticket §8.1)',
    description:
      'Same enrichment as GET /driver/rides/active — flat `customer` card, `display_code`, ' +
      '`online_before_minutes` (when the driver must go online before pickup; from dispatch config). ' +
      'Ordered by scheduled_at ascending.',
  })
  driverScheduled(@CurrentUser() user: AuthUser) {
    return this.rides.listScheduledForDriver(user.id);
  }

  @Get('driver/rides/:rideId')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Get own ride',
    description:
      'Same enrichment as active (including `active_emergency` when SOS is open). ' +
      'When status is COMPLETED, response includes the same `invoice` block as POST …/end.',
  })
  driverGet(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.getForDriver(user.id, rideId);
  }

  @Get('driver/rides/:rideId/invoice')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver invoice for a completed ride',
    description:
      'Re-open the fare receipt after leave/crash. gross_fare = إجمالي الأجرة; customer_payable = ما يدفعه العميل; ' +
      'driver_earnings = commission_base_fare − commission_amount. show_destination is false for RENTAL. ' +
      '`invoice.actual_distance_m` / `actual_duration_sec` are GPS-track / wall-clock actuals (never estimated_*). ' +
      'Includes `customer` { full_name, avatar_url } for the rate sheet, and ' +
      '`rating` { can_rate, my_rating: { stars } | null, submit_path }. Skip rating = do not call POST …/rating.',
  })
  @ApiOkResponse({ type: DriverInvoiceResponseDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.RIDE_NOT_FOUND, E.INVALID_RIDE_TRANSITION, E.VALIDATION_ERROR)
  driverInvoice(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.getInvoiceForDriver(user.id, rideId);
  }

  @Get('driver/rides/:rideId/customer-avatar')
  @Roles(GoRole.DRIVER)
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Photo of the ride customer (use customer.avatar_url)',
    description: 'Allowed when you are assigned to the ride or hold a live pending offer for it.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async customerAvatar(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    const file = await this.rides.customerAvatarForDriver(user.id, rideId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Post('driver/rides/:rideId/arrive')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Mark ARRIVED at pickup (نقطة الالتقاط)',
    description:
      'Separate from «تم الوصول» at destination. App must call arrive before start. ' +
      'Starts free waiting / no-show clock (see free_waiting_sec on the response). ' +
      'ARRIVE-001: idempotent — if already ARRIVED (e.g. GPS auto-arrive), returns 200 with the current ride. ' +
      'Still 409 INVALID_RIDE_TRANSITION for IN_PROGRESS / cancelled / etc. ' +
      'Socket `ride.driver_arrived` is emitted to customer and driver (`auto: true|false`).',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.INVALID_RIDE_TRANSITION)
  arrive(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.markArrived(user.id, rideId);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/start')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Start ride (Ticket §9.4)' })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.INVALID_RIDE_TRANSITION, E.IDEMPOTENCY_KEY_REQUIRED)
  start(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string, @Body() dto: EndRideDto) {
    return this.rides.startByDriver(user.id, rideId, dto);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/end')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'تم الوصول عند الوجهة = إنهاء الرحلة + فاتورة (Ticket §9.5 / §10)',
    description:
      'Driver app button «تم الوصول» at the drop-off maps to this endpoint (NOT POST …/arrive). ' +
      'Returns `invoice` — use invoice.driver_earnings; do not compute locally. ' +
      'Also flat `customer` { full_name, avatar_url } for the rate sheet, ' +
      '`rating` { can_rate, my_rating: { stars } | null, submit_path }, and ' +
      '`wallet` { forced_offline, commission_shortfall, commission_status }. ' +
      'Invoice includes wallet_paid_amount / cash_due / can_return_change for الباقي. ' +
      'Legacy top-level commission_* / combined_gross_fare remain for older clients.',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.INVALID_RIDE_TRANSITION, E.IDEMPOTENCY_KEY_REQUIRED)
  end(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string, @Body() dto: EndRideDto) {
    return this.rides.endByDriver(user.id, rideId, dto);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/return-change')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'إرجاع الباقي لمحفظة الزبون',
    description:
      'After COMPLETED: enter cash_received (what the customer handed). ' +
      'change = cash_received − cash_due (cash_due from invoice). Must be > 0. ' +
      'Credits customer wallet and debits driver wallet by the same amount. Idempotent per ride. ' +
      'If driver balance is insufficient → DRIVER_WALLET_INSUFFICIENT (give cash change instead).',
  })
  @ApiGoErrors(
    E.RIDE_NOT_FOUND,
    E.INVALID_RIDE_TRANSITION,
    E.VALIDATION_ERROR,
    E.CONFLICT,
    E.DRIVER_WALLET_INSUFFICIENT,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  returnChange(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: ReturnChangeDto,
  ) {
    return this.rides.returnChangeByDriver(user.id, rideId, dto);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/no-show')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Customer no-show after 10 min at pickup (Ticket §9.3)' })
  @ApiGoErrors(
    E.RIDE_NOT_FOUND,
    E.ARRIVAL_WAIT_NOT_COMPLETE,
    E.INVALID_RIDE_TRANSITION,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  noShow(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.noShow(user.id, rideId);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/breakdown')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Report vehicle breakdown (تعطّل السيارة)',
    description:
      'EN_ROUTE/ARRIVED → ride returns to SEARCHING for another driver (no segment fare). ' +
      'IN_PROGRESS → INTERRUPTED; staff creates replacement then assigns. ' +
      'Does not cancel the ride or zero fares. Driver goes OFFLINE until they go online again.',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE, E.INVALID_RIDE_TRANSITION, E.IDEMPOTENCY_KEY_REQUIRED)
  breakdown(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: DriverBreakdownDto,
  ) {
    return this.rides.reportBreakdown(user.id, rideId, dto);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver cancel while assigned or en route (passport + wallet penalty)',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.RIDE_NOT_ACTIVE, E.INVALID_RIDE_TRANSITION, E.IDEMPOTENCY_KEY_REQUIRED)
  driverCancel(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: DriverCancelRideDto,
  ) {
    return this.rides.cancelByDriver(user.id, rideId, dto);
  }

  // ---------- ERP / Admin ----------

  @Get('erp/offers')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Open dispatch offers' })
  listOffers(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.rides.listOpenOffers(user, q.branch_id);
  }

  @Get('erp/rides/live')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Live monitoring board (Ticket §13)' })
  listLive(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.rides.listLive(user, q.branch_id);
  }

  @Get('erp/rides')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  listErp(
    @CurrentUser() user: AuthUser,
    @Query() q: ErpRidesQueryDto,
  ) {
    return this.rides.listErp(user, q);
  }

  @Get('erp/rides/:rideId/contact-info')
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'View customer/driver phones — audited (Ticket §13.1)' })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.BRANCH_SCOPE_DENIED, E.ROLE_NOT_ALLOWED)
  contactInfo(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.contactInfo(user, rideId);
  }

  @Get('erp/rides/:rideId')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  getErp(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.getErp(user, rideId);
  }

  @Get('erp/rides/:rideId/timeline')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Reliable ride timeline for disputes (Ticket §16)',
    description:
      'Derived from ride timestamps + pickup audits. GPS is never treated as sole proof. ' +
      'Caveats listed in the response.',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  timeline(@CurrentUser() user: AuthUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.rides.timeline(user, rideId);
  }

  @Idempotent()
  @Post('erp/rides/:rideId/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF_ROLES, ...ADMIN_ROLES)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Manually assign driver (temporary until Phase 3 Dispatch Engine)',
    description: 'Moves SEARCHING → DRIVER_EN_ROUTE and marks driver BUSY.',
  })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.RIDE_ALREADY_TAKEN, E.DRIVER_NOT_ELIGIBLE, E.BRANCH_SCOPE_DENIED)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.rides.assignDriver(user, rideId, dto);
  }

  @Idempotent()
  @Post('erp/rides/:rideId/replacement')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Create replacement after breakdown/accident (Ticket §17)',
    description:
      'Finalizes first-driver segment fare (start → interrupt) and opens a SEARCHING ride from interrupt → destination. ' +
      'Optional driver_id assigns the second driver immediately.',
  })
  @ApiGoErrors(
    E.RIDE_NOT_FOUND,
    E.RIDE_NOT_ACTIVE,
    E.REPLACEMENT_ALREADY_CREATED,
    E.BRANCH_SCOPE_DENIED,
    E.DRIVER_NOT_ELIGIBLE,
    E.RIDE_ALREADY_TAKEN,
  )
  replacement(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: CreateReplacementDto,
  ) {
    return this.rides.createReplacement(user, rideId, dto);
  }

  @Post('erp/rides/:rideId/fare-stack')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE_SUPERVISOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Choose discount, compensation, or both when they meet on one ride' })
  @ApiGoErrors(E.RIDE_NOT_FOUND, E.CONFLICT, E.BRANCH_SCOPE_DENIED, E.ROLE_NOT_ALLOWED)
  fareStack(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: FareStackDto,
  ) {
    return this.fareSettlement.decide(user, rideId, dto.decision);
  }

  @Idempotent()
  @Post('erp/rides/:rideId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE_SUPERVISOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Staff cancel an active ride with optional penalties' })
  @ApiGoErrors(
    E.RIDE_NOT_FOUND,
    E.RIDE_NOT_ACTIVE,
    E.INVALID_RIDE_TRANSITION,
    E.BRANCH_SCOPE_DENIED,
    E.ROLE_NOT_ALLOWED,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  staffCancel(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: StaffCancelRideDto,
  ) {
    return this.rides.cancelByStaff(user, rideId, dto);
  }
}

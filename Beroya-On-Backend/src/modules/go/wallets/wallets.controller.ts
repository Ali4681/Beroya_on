import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { GoCommissionBase, GoRole, GoWalletTransactionType, GoWalletVoucherStatus } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { E164, E164_MSG, normalizeE164 } from '../auth/phone';
import { CustomerWalletService } from './customer-wallet.service';
import { WalletService } from './wallet.service';

const DRIVER_WALLET_ACTIVITY_KINDS = [...Object.values(GoWalletTransactionType), 'TRIP_EARNING'] as const;

class DriverWalletActivityItemDto {
  @ApiProperty({ example: 'f0e1...uuid' })
  id!: string;

  @ApiProperty({
    example: 'TRIP_EARNING',
    description: 'TRIP_EARNING is display-only (not a ledger row). Other values are GoWalletTransactionType.',
    enum: DRIVER_WALLET_ACTIVITY_KINDS,
  })
  kind!: (typeof DRIVER_WALLET_ACTIVITY_KINDS)[number];

  @ApiProperty({ example: 4500, description: 'Absolute amount' })
  amount!: number;

  @ApiProperty({
    example: 4500,
    description: 'Positive = cyan/+ (credit or trip earning); negative = red/− (debit)',
  })
  signed_amount!: number;

  @ApiProperty({ example: '2026-10-18T14:45:00.000Z' })
  created_at!: Date;

  @ApiPropertyOptional({ nullable: true })
  ride_id!: string | null;

  @ApiPropertyOptional({ example: 'GO-20261020-04589', nullable: true })
  public_number!: string | null;

  @ApiPropertyOptional({
    example: 'TRP-4589',
    nullable: true,
    description: 'Short UI code from public_number; null when not ride-linked. Prefer this in titles.',
  })
  display_code!: string | null;

  @ApiPropertyOptional({ example: 'المزة', nullable: true })
  pickup_label!: string | null;

  @ApiPropertyOptional({ example: 'المالكي', nullable: true })
  destination_label!: string | null;

  @ApiProperty({ example: 'الرحلة رقم TRP-4589 – من المزة إلى المالكي' })
  title_ar!: string;

  @ApiProperty({ example: 'Trip TRP-4589 – from المزة to المالكي' })
  title_en!: string;
}

class DriverWalletTransactionsDto {
  @ApiProperty({ type: [DriverWalletActivityItemDto] })
  items!: DriverWalletActivityItemDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: true })
  has_more!: boolean;
}

class UpdateWalletConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimum_initial_topup?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commission_percentage?: number;

  @ApiPropertyOptional({ enum: GoCommissionBase })
  @IsOptional()
  @IsIn(Object.values(GoCommissionBase))
  commission_base?: GoCommissionBase;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  system_average_fare?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  low_balance_amount_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  low_balance_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  low_balance_rides_enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  low_balance_remaining_rides?: number;

  @ApiPropertyOptional({ description: 'Fixed wallet penalty when a driver cancels an assigned ride' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  driver_cancel_penalty_amount?: number;
}

class TopUpDto {
  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class WalletMonthDto {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 10 }) month!: number;
  @ApiProperty({ example: 0, description: 'Sum of TOP_UP + RIDE_REFUND + TRANSFER_IN' })
  added!: number;
  @ApiProperty({ example: 0, description: 'Sum of RIDE_PAYMENT + TRANSFER_OUT' })
  consumed!: number;
}

class CustomerWalletDto {
  @ApiProperty({ example: 25000 })
  balance!: number;

  @ApiProperty({ example: 'SYP' })
  currency!: string;

  @ApiProperty({ type: WalletMonthDto, description: 'Calendar month activity (Asia/Damascus)' })
  month!: WalletMonthDto;
}

class RedeemWalletCodeDto {
  @ApiProperty({ example: 'ABCD-EFGH-IJKL', description: 'Recharge code XXXX-XXXX-XXXX' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;
}

class TransferWalletDto {
  @ApiProperty({ example: '+963985905132' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: E164_MSG })
  recipient_phone!: string;

  @ApiProperty({ example: 10000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

class CreateWalletVoucherDto {
  @ApiPropertyOptional({ example: 'ABCD-EFGH-IJKL', description: 'Omit to auto-generate' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiProperty({ example: 10000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expires_at?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

class ReverseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

@ApiBearerAuth()
@Controller()
export class WalletsController {
  constructor(
    private readonly wallets: WalletService,
    private readonly customerWallets: CustomerWalletService,
  ) {}

  @Get('erp/wallets')
  @Roles(GoRole.WALLET_OPERATOR, GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Driver wallet balances' })
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.wallets.listForStaff(user, q.page, q.limit, q.branch_id);
  }

  @Get('erp/wallets/:driverId')
  @Roles(GoRole.WALLET_OPERATOR, GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Wallet ledger and commission holds for one driver' })
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.wallets.ledger(user, driverId, q.page, q.limit);
  }

  @Get('admin/wallet-config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN, GoRole.WALLET_OPERATOR, GoRole.FINANCE)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Get wallet/commission config (Ticket §20.4)' })
  getConfig() {
    return this.wallets.getConfig();
  }

  @Patch('admin/wallet-config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateWalletConfigDto) {
    return this.wallets.updateConfig(user, dto);
  }

  @Get('driver/wallet')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver wallet summary (Ticket §20.9) — use /driver/wallet/transactions for history',
    description:
      'Socket `wallet.updated` on `/go/driver` delivers this same payload. ' +
      'When outstanding dues force the driver offline, also listen for `driver.forced_offline` with `{ "reason": "WALLET_DUE" }`.',
  })
  driverWallet(@CurrentUser() user: AuthUser) {
    return this.wallets.getDriverView(user.id);
  }

  @Get('driver/wallet/transactions')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver wallet activity feed',
    description:
      'Merges display-only TRIP_EARNING rows (COMPLETED rides, gross_final_fare) with real ledger rows ' +
      '(COMMISSION_DEDUCTION, TOP_UP, POS_RECHARGE, …). Newest first. ' +
      'Use `title_ar` / `title_en` (built with short `display_code`, e.g. TRP-4589) for the card; ' +
      '`public_number` stays the full GO-… reference.',
  })
  @ApiOkResponse({ type: DriverWalletTransactionsDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  driverWalletTransactions(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.wallets.getDriverTransactions(user.id, q.page, q.limit);
  }

  @Get('customer/wallet')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Customer wallet hub (Figma «المحفظة»)',
    description:
      'Spendable balance + calendar-month added/consumed (Asia/Damascus). ' +
      'A WALLET ride takes its expected fare at creation; the difference is refunded or charged at completion.',
  })
  @ApiOkResponse({ type: CustomerWalletDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  customerWallet(@CurrentUser() user: AuthUser): Promise<CustomerWalletDto> {
    return this.customerWallets.getCustomerView(user.id);
  }

  @Idempotent()
  @Post('customer/wallet/redeem')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Redeem recharge code (Figma «شحن الرصيد»)',
    description: 'Credits the wallet atomically. Same Idempotency-Key + body → same result, no double credit.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.WALLET_CODE_INVALID,
    E.WALLET_CODE_ALREADY_USED,
    E.WALLET_CODE_EXPIRED,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  redeemCode(@CurrentUser() user: AuthUser, @Body() dto: RedeemWalletCodeDto) {
    return this.customerWallets.redeemVoucher(user.id, dto.code);
  }

  @Idempotent()
  @Post('customer/wallet/transfer')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Transfer balance to a friend (Figma «تحويل رصيد لصديق»)',
    description: 'Debits sender and credits an existing CUSTOMER by phone. Idempotent.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.RECIPIENT_NOT_FOUND,
    E.TRANSFER_TO_SELF,
    E.WALLET_INSUFFICIENT_BALANCE,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferWalletDto) {
    return this.customerWallets.transferToFriend(user.id, dto.recipient_phone, dto.amount);
  }

  @Get('erp/customer-wallets')
  @Roles(GoRole.WALLET_OPERATOR, GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Customer wallet balances' })
  listCustomers(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.customerWallets.listForStaff(user, q.page, q.limit, q.branch_id);
  }

  @Get('erp/customer-wallets/:customerId')
  @Roles(GoRole.WALLET_OPERATOR, GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Wallet ledger for one customer' })
  customerLedger(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.customerWallets.ledger(user, customerId, q.page, q.limit);
  }

  @Idempotent()
  @Post('erp/customer-wallets/:customerId/top-up')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Deposit into a customer wallet' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR, E.BRANCH_SCOPE_DENIED, E.IDEMPOTENCY_KEY_REQUIRED)
  customerTopUp(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: TopUpDto,
  ) {
    return this.customerWallets.topUp(user, customerId, dto.amount, dto.reason);
  }

  @Post('erp/wallet-vouchers')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Create a one-shot customer recharge voucher' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  createVoucher(@CurrentUser() user: AuthUser, @Body() dto: CreateWalletVoucherDto) {
    return this.customerWallets.createVoucher(user, dto);
  }

  @Get('erp/wallet-vouchers')
  @Roles(GoRole.WALLET_OPERATOR, GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List recharge vouchers' })
  listVouchers(
    @Query() q: PaginationQueryDto,
    @Query('status') status?: GoWalletVoucherStatus,
  ) {
    return this.customerWallets.listVouchers(q.page, q.limit, status);
  }

  @Idempotent()
  @Post('erp/wallet-vouchers/:voucherId/disable')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Disable an unused voucher' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT, E.IDEMPOTENCY_KEY_REQUIRED)
  disableVoucher(
    @CurrentUser() user: AuthUser,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
  ) {
    return this.customerWallets.disableVoucher(user, voucherId);
  }

  @Idempotent()
  @Post('erp/customer-wallets/:customerId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Withdraw from a customer wallet' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR, E.CONFLICT, E.BRANCH_SCOPE_DENIED, E.IDEMPOTENCY_KEY_REQUIRED)
  customerWithdraw(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: TopUpDto,
  ) {
    return this.customerWallets.withdraw(user, customerId, dto.amount, dto.reason);
  }

  @Idempotent()
  @Post('erp/wallets/:driverId/top-up')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Wallet top-up (Ticket §20.7)' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR, E.BRANCH_SCOPE_DENIED, E.IDEMPOTENCY_KEY_REQUIRED)
  topUp(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: TopUpDto,
  ) {
    return this.wallets.topUp(user, driverId, dto.amount, dto.reason);
  }

  @Idempotent()
  @Post('erp/wallets/:driverId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Withdraw from a driver wallet. Cannot use reserved commission.' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR, E.CONFLICT, E.BRANCH_SCOPE_DENIED, E.IDEMPOTENCY_KEY_REQUIRED)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: TopUpDto,
  ) {
    return this.wallets.withdraw(user, driverId, dto.amount, dto.reason);
  }

  @Idempotent()
  @Post('erp/wallet-transactions/:transactionId/reverse')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.WALLET_OPERATOR, GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Reverse wallet transaction (Ticket §20.8)' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT, E.VALIDATION_ERROR)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: ReverseDto,
  ) {
    return this.wallets.reverse(user, transactionId, dto.reason);
  }
}

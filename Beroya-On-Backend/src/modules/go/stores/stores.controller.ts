import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { IDEMPOTENCY_HEADER, Idempotent } from '../../../common/idempotency/idempotent.decorator';
import {
  CreateStoreDto,
  CreateStoreOperatorDto,
  DriverLookupDto,
  ListStoresQueryDto,
  PosRechargeDto,
  PosTransactionsQueryDto,
  ReverseRechargeDto,
  StoreAdjustmentDto,
  StoreCreditDto,
  StoreLedgerQueryDto,
  StoreStatsQueryDto,
  StoreStatusDto,
  UpdateStoreDto,
  UpdateStoreOperatorDto,
} from './dto/stores.dto';
import { PosService } from './pos.service';
import { StoresService } from './stores.service';

/** Read access: finance + admins. Store setup: admins. Balance credit: finance + admins. Corrections: admins. */
const STORE_READERS = [GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN];
const STORE_MANAGERS = [GoRole.ADMIN, GoRole.SUPER_ADMIN];

@ApiBearerAuth()
@ApiTags('Admin · Stores')
@Controller('admin/stores')
export class StoresAdminController {
  constructor(private readonly stores: StoresService) {}

  @Get('overview')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Store network totals (balances, today recharges, low balance)' })
  overview(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.stores.overview(user, q.branch_id);
  }

  @Get('reconciliation')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Consistency checks between store ledger, store balances and driver wallets' })
  reconciliation(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.stores.reconciliation(user, q.branch_id);
  }

  @Get()
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Stores (search, filters, sort, server-side pagination)' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListStoresQueryDto) {
    return this.stores.list(user, q);
  }

  @Post()
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Create a store (opening balance is always 0; add balance separately)' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.BRANCH_SCOPE_DENIED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreDto) {
    return this.stores.create(user, dto);
  }

  @Post('ledger/:entryId/reverse')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Reverse a driver recharge (only if the driver still holds the amount)' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT, E.WALLET_INSUFFICIENT_BALANCE, E.IDEMPOTENCY_KEY_REQUIRED)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: ReverseRechargeDto,
  ) {
    return this.stores.reverseRecharge(user, entryId, dto.reason);
  }

  @Get(':storeId')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Store details with financial summary and operators' })
  get(@CurrentUser() user: AuthUser, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.stores.get(user, storeId);
  }

  @Patch(':storeId')
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Edit store info. Balance and status cannot be changed here.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(user, storeId, dto);
  }

  @Patch(':storeId/status')
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Activate or suspend a store (reason optional)' })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: StoreStatusDto,
  ) {
    return this.stores.setStatus(user, storeId, dto);
  }

  @Post(':storeId/balance-credits')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @Roles(...STORE_READERS)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Add balance to a store (positive amounts only)' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.CURRENCY_MISMATCH, E.IDEMPOTENCY_KEY_REQUIRED, E.IDEMPOTENCY_KEY_REUSED)
  credit(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: StoreCreditDto,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.stores.credit(user, storeId, dto, key);
  }

  @Post(':storeId/balance-adjustments')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @Roles(...STORE_MANAGERS)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Audited correction (credit or debit) with mandatory reason; never below zero' })
  @ApiGoErrors(E.VALIDATION_ERROR, E.STORE_BALANCE_INSUFFICIENT, E.CURRENCY_MISMATCH, E.IDEMPOTENCY_KEY_REQUIRED)
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: StoreAdjustmentDto,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.stores.adjust(user, storeId, dto, key);
  }

  @Get(':storeId/ledger')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Store balance history (all ledger types)' })
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query() q: StoreLedgerQueryDto,
  ) {
    return this.stores.ledger(user, storeId, q);
  }

  @Get(':storeId/statistics')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Daily recharge statistics' })
  statistics(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query() q: StoreStatsQueryDto,
  ) {
    return this.stores.statistics(user, storeId, q.days);
  }

  @Get(':storeId/audit')
  @Roles(...STORE_READERS)
  @ApiOperation({ summary: 'Audit history of the store' })
  audit(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.stores.auditHistory(user, storeId, q.page, q.limit);
  }

  @Get(':storeId/operators')
  @Roles(...STORE_READERS)
  operators(@CurrentUser() user: AuthUser, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.stores.listOperators(user, storeId);
  }

  @Post(':storeId/operators')
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Create a store operator (cashier) login' })
  createOperator(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateStoreOperatorDto,
  ) {
    return this.stores.createOperator(user, storeId, dto);
  }

  @Patch(':storeId/operators/:userId')
  @Roles(...STORE_MANAGERS)
  @ApiOperation({ summary: 'Rename, (de)activate or reset password of a store operator' })
  updateOperator(
    @CurrentUser() user: AuthUser,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateStoreOperatorDto,
  ) {
    return this.stores.updateOperator(user, storeId, userId, dto);
  }
}

@ApiBearerAuth()
@ApiTags('POS')
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('me')
  @Roles(GoRole.STORE_OPERATOR)
  @ApiOperation({ summary: 'Operator dashboard: own store, balance, today totals' })
  @ApiGoErrors(E.STORE_ACCOUNT_NOT_LINKED)
  me(@CurrentUser() user: AuthUser) {
    return this.pos.me(user);
  }

  @Post('drivers/lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.STORE_OPERATOR)
  @ApiOperation({ summary: 'Find a driver by mobile number (masked result, rate-limited)' })
  @ApiGoErrors(E.NOT_FOUND, E.RATE_LIMITED, E.VALIDATION_ERROR, E.STORE_ACCOUNT_NOT_LINKED)
  lookup(@CurrentUser() user: AuthUser, @Body() dto: DriverLookupDto) {
    return this.pos.lookup(user, dto);
  }

  @Post('recharges')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.STORE_OPERATOR)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Recharge a driver wallet from the store balance (no fee, no commission)' })
  @ApiGoErrors(
    E.STORE_SUSPENDED,
    E.STORE_BALANCE_INSUFFICIENT,
    E.RECHARGE_LIMIT_EXCEEDED,
    E.RECHARGE_BELOW_MINIMUM,
    E.DRIVER_NOT_RECHARGEABLE,
    E.CURRENCY_MISMATCH,
    E.NOT_FOUND,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
    E.IDEMPOTENCY_IN_PROGRESS,
  )
  recharge(
    @CurrentUser() user: AuthUser,
    @Body() dto: PosRechargeDto,
    @Headers(IDEMPOTENCY_HEADER) key?: string,
  ) {
    return this.pos.recharge(user, dto, key);
  }

  @Get('transactions')
  @Roles(GoRole.STORE_OPERATOR)
  @ApiOperation({ summary: 'Recharge history of the operator store' })
  transactions(@CurrentUser() user: AuthUser, @Query() q: PosTransactionsQueryDto) {
    return this.pos.transactions(user, q);
  }

  @Get('transactions/:reference')
  @Roles(GoRole.STORE_OPERATOR)
  @ApiOperation({ summary: 'Receipt of one recharge' })
  receipt(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.pos.receipt(user, reference);
  }
}

@ApiBearerAuth()
@ApiTags('Driver')
@Controller('driver/wallet')
export class DriverPosHistoryController {
  constructor(private readonly stores: StoresService) {}

  @Get('pos-recharges')
  @Roles(GoRole.DRIVER)
  @ApiOperation({ summary: 'Own store (POS) recharges: reference, amount, store, date, status' })
  history(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.stores.driverPosHistory(user.id, q.page, q.limit);
  }
}

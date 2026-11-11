import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { FuelPriceDto, UpdatePricingDto } from './dto/pricing.dto';
import { PricingService } from './pricing.service';

@ApiBearerAuth()
@ApiTags('Admin')
@Controller('admin/pricing')
@Roles(...ADMIN_ROLES)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'List pricing for all categories (Ticket §2.5)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  list() {
    return this.pricing.list();
  }

  @Get('fuel')
  @ApiOperation({ summary: 'Current fuel price, fuel share and rounding step' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  fuel() {
    return this.pricing.getFuel();
  }

  @Post('fuel/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview per-km prices for a new fuel price (nothing is saved)',
    description: 'new per-km = per-km × (1 + share% × (new − old) ÷ old), rounded to rounding_step. MANUAL categories stay unchanged.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  previewFuel(@Body() dto: FuelPriceDto) {
    return this.pricing.previewFuel(dto);
  }

  @Idempotent()
  @Put('fuel')
  @ApiOperation({ summary: 'Save the fuel price and move every AUTO per-km price (audited, kept in history)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT, E.IDEMPOTENCY_KEY_REQUIRED)
  applyFuel(@CurrentUser() user: AuthUser, @Body() dto: FuelPriceDto) {
    return this.pricing.applyFuel(user, dto);
  }

  @Get('fuel/history')
  @ApiOperation({ summary: 'Fuel price changes, newest first, with the categories each one moved' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  fuelHistory(@Query() q: PaginationQueryDto) {
    return this.pricing.fuelHistory(q.page, q.limit);
  }

  @Idempotent()
  @Patch(':categoryId')
  @ApiOperation({ summary: 'Create/update pricing for a category (Ticket §2.5)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  patch(
    @CurrentUser() user: AuthUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdatePricingDto,
  ) {
    return this.pricing.upsertForCategory(user, categoryId, dto);
  }
}

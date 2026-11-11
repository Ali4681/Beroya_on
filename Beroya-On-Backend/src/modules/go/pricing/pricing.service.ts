import { Injectable } from '@nestjs/common';
import { GoPerKmMode, Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { FuelPriceDto, UpdatePricingDto } from './dto/pricing.dto';
import { decimalToNumber } from './fare.calculator';
import { adjustPerKm } from './fuel-math';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locks: LockService,
  ) {}

  list() {
    return this.prisma.goRidePricing.findMany({
      include: { ride_category: { select: { id: true, code: true, name_ar: true, name_en: true, is_active: true } } },
      orderBy: { ride_category: { sort_order: 'asc' } },
    });
  }

  async upsertForCategory(user: AuthUser, categoryId: string, dto: UpdatePricingDto) {
    const category = await this.prisma.goRideCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new GoException(GoErrorCode.NOT_FOUND, 'Ride category not found');

    const existing = await this.prisma.goRidePricing.findUnique({ where: { ride_category_id: categoryId } });
    if (!existing) {
      if (
        dto.base_fare === undefined ||
        dto.price_per_km === undefined ||
        dto.price_per_minute === undefined ||
        dto.minimum_fare === undefined
      ) {
        throw new GoException(
          GoErrorCode.VALIDATION_ERROR,
          'Creating pricing requires base_fare, price_per_km, price_per_minute, minimum_fare',
        );
      }
    }

    const include = { ride_category: { select: { id: true, code: true, name_ar: true } } } as const;
    const pricing = existing
      ? await this.prisma.goRidePricing.update({
          where: { ride_category_id: categoryId },
          data: {
            base_fare: dto.base_fare,
            price_per_km: dto.price_per_km,
            price_per_minute: dto.price_per_minute,
            minimum_fare: dto.minimum_fare,
            currency: 'SYP',
            is_active: dto.is_active,
            per_km_mode: dto.per_km_mode,
          },
          include,
        })
      : await this.prisma.goRidePricing.create({
          data: {
            ride_category_id: categoryId,
            base_fare: dto.base_fare!,
            price_per_km: dto.price_per_km!,
            price_per_minute: dto.price_per_minute!,
            minimum_fare: dto.minimum_fare!,
            currency: 'SYP',
            is_active: dto.is_active ?? true,
            per_km_mode: dto.per_km_mode ?? GoPerKmMode.AUTO,
          },
          include,
        });

    await this.audit.log({
      actor: user,
      action: AuditAction.PRICING_CHANGED,
      entity_type: 'go_ride_pricing',
      entity_id: pricing.id,
      metadata: { category_id: categoryId, ...(dto as object) } as Prisma.InputJsonValue,
    });
    return pricing;
  }

  getFuel() {
    return this.prisma.goFuelPricing.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  }

  /** Per-km prices a fuel change would produce. Nothing is saved. */
  async previewFuel(dto: FuelPriceDto) {
    const fuel = await this.getFuel();
    const share = dto.fuel_share_pct ?? fuel.fuel_share_pct;
    const step = dto.rounding_step ?? fuel.rounding_step;
    const pricings = await this.prisma.goRidePricing.findMany({
      include: { ride_category: { select: { id: true, code: true, name_ar: true, name_en: true, sort_order: true } } },
      orderBy: { ride_category: { sort_order: 'asc' } },
    });
    const rows = pricings.map((p) => {
      const auto = p.per_km_mode === GoPerKmMode.AUTO;
      const next = auto ? adjustPerKm(p.price_per_km, fuel.current_price, dto.new_price, share, step) : p.price_per_km;
      return {
        pricing_id: p.id,
        ride_category_id: p.ride_category_id,
        code: p.ride_category.code,
        name_ar: p.ride_category.name_ar,
        name_en: p.ride_category.name_en,
        per_km_mode: p.per_km_mode,
        old_per_km: decimalToNumber(p.price_per_km),
        new_per_km: decimalToNumber(next),
        changed: !next.equals(p.price_per_km),
      };
    });
    const old = fuel.current_price;
    return {
      old_price: old == null ? null : decimalToNumber(old),
      new_price: dto.new_price,
      change_pct: old == null || old.lte(0) ? null : decimalToNumber(new Prisma.Decimal(dto.new_price).minus(old).div(old).times(100).toDecimalPlaces(2)),
      fuel_share_pct: decimalToNumber(share),
      rounding_step: decimalToNumber(step),
      first_price: old == null,
      rows,
    };
  }

  /** Saves the fuel price, moves every AUTO per-km price, and records the change. */
  async applyFuel(actor: AuthUser, dto: FuelPriceDto) {
    return this.locks.withLock('pricing:fuel', async () => {
      const preview = await this.previewFuel(dto);
      const changed = preview.rows.filter((r) => r.changed);
      const record = await this.prisma.$transaction(async (tx) => {
        await tx.goFuelPricing.update({
          where: { id: 'default' },
          data: {
            current_price: dto.new_price,
            fuel_share_pct: preview.fuel_share_pct,
            rounding_step: preview.rounding_step,
          },
        });
        for (const row of changed) {
          await tx.goRidePricing.update({ where: { id: row.pricing_id }, data: { price_per_km: row.new_per_km } });
        }
        return tx.goFuelPriceChange.create({
          data: {
            old_price: preview.old_price,
            new_price: dto.new_price,
            fuel_share_pct: preview.fuel_share_pct,
            rounding_step: preview.rounding_step,
            changed_by_id: actor.id,
            affected: changed.map(({ ride_category_id, code, name_ar, old_per_km, new_per_km }) => ({
              ride_category_id,
              code,
              name_ar,
              old_per_km,
              new_per_km,
            })),
          },
        });
      });
      await this.audit.log({
        actor,
        action: AuditAction.FUEL_PRICE_CHANGED,
        entity_type: 'GoFuelPriceChange',
        entity_id: record.id,
        metadata: {
          old_price: preview.old_price,
          new_price: dto.new_price,
          fuel_share_pct: preview.fuel_share_pct,
          rounding_step: preview.rounding_step,
          affected: changed.length,
        },
      });
      return { ...preview, change_id: record.id, applied: changed.length };
    });
  }

  fuelHistory(page = 1, limit = 20) {
    return this.prisma.goFuelPriceChange.findMany({
      orderBy: { created_at: 'desc' },
      include: { changed_by: { select: { id: true, full_name: true, email: true } } },
      ...pageSkip(page, limit),
    });
  }
}

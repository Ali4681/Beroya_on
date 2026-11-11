import { Injectable } from '@nestjs/common';
import { GoDiscountCodeStatus, GoRole, GoService, GoServiceCode, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DiscountsService } from '../discounts/discounts.service';
import { passportIconMime } from '../passport/passport-icon.storage';
import type { ReorderServicesDto, ServiceOfferDto, UpdateServiceDto } from './dto/service-catalog.dto';
import { ServiceOfferType } from './dto/service-catalog.dto';
import { decimalToNumber } from '../pricing/fare.calculator';
import { ServiceImageStorage, serviceImageUrl } from './service-image.storage';

type BestCode = { id: string; code: string; percentage: number; expires_at: Date };

const ORDER: Prisma.GoServiceOrderByWithRelationInput[] = [{ sort_order: 'asc' }, { code: 'asc' }];

export function promotionIsLive(service: Pick<GoService, 'promotion_label_ar' | 'promotion_expires_at'>, now = new Date()) {
  return !!service.promotion_label_ar && (!service.promotion_expires_at || service.promotion_expires_at > now);
}

/** The customer's best code wins; the admin promotion is the fallback badge. */
export function serviceOffer(service: GoService, best: BestCode | undefined, now = new Date()): ServiceOfferDto | null {
  if (best) {
    return {
      type: ServiceOfferType.DISCOUNT,
      percentage: best.percentage,
      label_ar: `خصم ${best.percentage}%`,
      expires_at: best.expires_at,
      discount_code_id: best.id,
      code: best.code,
    };
  }
  if (promotionIsLive(service, now)) {
    return {
      type: ServiceOfferType.PROMOTION,
      percentage: service.promotion_percentage != null ? decimalToNumber(service.promotion_percentage) : null,
      label_ar: service.promotion_label_ar!,
      expires_at: service.promotion_expires_at,
      discount_code_id: null,
      code: null,
    };
  }
  return null;
}

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: ServiceImageStorage,
    private readonly discounts: DiscountsService,
  ) {}

  /** Visible services in admin order. Discount badges need a customer token; guests see promotions only. */
  async listForCustomer(user: AuthUser | null) {
    const rows = await this.prisma.goService.findMany({ where: { is_visible: true }, orderBy: ORDER });
    const best =
      user?.role === GoRole.CUSTOMER ? await this.discounts.bestCodeByService(user.id) : new Map<GoServiceCode, BestCode>();
    const now = new Date();
    return rows.map((service) => ({
      code: service.code,
      name_ar: service.name_ar,
      name_en: service.name_en,
      image_url: serviceImageUrl(service),
      is_available: service.is_available,
      sort_order: service.sort_order,
      offer: serviceOffer(service, service.is_available ? best.get(service.code) : undefined, now),
    }));
  }

  async readImage(code: GoServiceCode) {
    const service = await this.prisma.goService.findUnique({ where: { code }, select: { image_key: true, is_visible: true } });
    const data = service?.is_visible && service.image_key ? await this.images.read(service.image_key) : null;
    if (!service?.image_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Image not found');
    return { data, mime: passportIconMime(service.image_key) };
  }

  async listAdmin() {
    const rows = await this.prisma.goService.findMany({ orderBy: ORDER });
    const counts = await this.activeCodeCounts();
    return rows.map((service) => this.adminView(service, counts.get(service.code) ?? 0));
  }

  async update(user: AuthUser, code: GoServiceCode, dto: UpdateServiceDto) {
    const current = await this.find(code);
    const { image, remove_image, promotion_expires_at, promotion_percentage, promotion_label_ar, ...fields } = dto;
    let image_key: string | null | undefined;
    if (image) {
      image_key = await this.images.save(code, image);
    } else if (remove_image) {
      await this.images.remove(current.image_key);
      image_key = null;
    }
    const clearingPromo = promotion_label_ar === null;
    const service = await this.prisma.goService.update({
      where: { code },
      data: {
        ...fields,
        image_key,
        promotion_label_ar,
        promotion_percentage: clearingPromo
          ? null
          : promotion_percentage === undefined
            ? undefined
            : promotion_percentage,
        promotion_expires_at: clearingPromo
          ? null
          : promotion_expires_at === undefined
            ? undefined
            : promotion_expires_at && new Date(promotion_expires_at),
      },
    });
    await this.audit.log({
      actor: user,
      action: 'service.updated',
      entity_type: 'go_service',
      entity_id: code,
      metadata: {
        ...fields,
        promotion_label_ar,
        promotion_percentage,
        promotion_expires_at,
        image: image ? true : undefined,
        remove_image,
      } as Prisma.InputJsonValue,
    });
    const counts = await this.activeCodeCounts();
    return this.adminView(service, counts.get(code) ?? 0);
  }

  async reorder(user: AuthUser, dto: ReorderServicesDto) {
    const all = await this.prisma.goService.findMany({ select: { code: true } });
    if (dto.codes.length !== all.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'codes', messages: ['codes must list every service exactly once'] }],
      });
    }
    await this.prisma.$transaction(
      dto.codes.map((code, index) => this.prisma.goService.update({ where: { code }, data: { sort_order: index + 1 } })),
    );
    await this.audit.log({
      actor: user,
      action: 'service.reordered',
      entity_type: 'go_service',
      entity_id: 'catalog',
      metadata: { codes: dto.codes },
    });
    return this.listAdmin();
  }

  private adminView(service: GoService, activeCodes: number) {
    return {
      code: service.code,
      name_ar: service.name_ar,
      name_en: service.name_en,
      image_url: serviceImageUrl(service),
      is_available: service.is_available,
      is_visible: service.is_visible,
      sort_order: service.sort_order,
      promotion_label_ar: service.promotion_label_ar,
      promotion_percentage: service.promotion_percentage != null ? decimalToNumber(service.promotion_percentage) : null,
      promotion_expires_at: service.promotion_expires_at,
      active_discount_codes: activeCodes,
      updated_at: service.updated_at,
    };
  }

  /** Unlinked codes count toward DAILY, matching how bookings treat them. */
  private async activeCodeCounts() {
    const [linked, unlinked] = await Promise.all([
      this.prisma.goDiscountCodeService.groupBy({
        by: ['service_code'],
        where: { discount_code: { status: GoDiscountCodeStatus.ACTIVE } },
        _count: { _all: true },
      }),
      this.prisma.goCustomerDiscountCode.count({
        where: { status: GoDiscountCodeStatus.ACTIVE, services: { none: {} } },
      }),
    ]);
    const counts = new Map<GoServiceCode, number>(linked.map((row) => [row.service_code, row._count._all]));
    counts.set(GoServiceCode.DAILY, (counts.get(GoServiceCode.DAILY) ?? 0) + unlinked);
    return counts;
  }

  private async find(code: GoServiceCode) {
    const service = await this.prisma.goService.findUnique({ where: { code } });
    if (!service) throw new GoException(GoErrorCode.NOT_FOUND, 'Service not found');
    return service;
  }
}

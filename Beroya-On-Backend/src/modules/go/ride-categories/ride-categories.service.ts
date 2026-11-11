import { Injectable } from '@nestjs/common';
import { GoServiceCode, Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { passportIconMime } from '../passport/passport-icon.storage';
import {
  categoryCodesForServiceList,
  SERVICE_ONLY_CATEGORY_CODES,
} from '../rides/ride-service-categories';
import { CategoryImageStorage, categoryImageUrl } from './category-image.storage';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

type CategoryRow = { id: string; image_key: string | null; updated_at: Date };

function withImageUrl<T extends CategoryRow>(row: T) {
  return { ...row, image_url: categoryImageUrl(row) };
}

@Injectable()
export class RideCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: CategoryImageStorage,
  ) {}

  async listPublic(serviceType?: GoServiceCode | string | null) {
    const codes = categoryCodesForServiceList(serviceType);
    const reserved = Object.values(SERVICE_ONLY_CATEGORY_CODES).flatMap((c) => [...c]);
    const rows = await this.prisma.goRideCategory.findMany({
      where: {
        is_active: true,
        ...(codes === 'default'
          ? reserved.length
            ? { code: { notIn: reserved } }
            : {}
          : { code: { in: codes } }),
      },
      orderBy: { sort_order: 'asc' },
      select: {
        id: true,
        code: true,
        name_ar: true,
        name_en: true,
        sort_order: true,
        max_passengers: true,
        image_key: true,
        updated_at: true,
        pricing: {
          select: {
            base_fare: true,
            price_per_km: true,
            price_per_minute: true,
            minimum_fare: true,
            currency: true,
            is_active: true,
          },
        },
      },
    });
    return rows.map(({ image_key, updated_at, ...r }) => ({
      ...r,
      image_url: categoryImageUrl({ id: r.id, image_key, updated_at }),
      pricing: r.pricing?.is_active ? (({ is_active: _a, ...p }) => p)(r.pricing) : null,
    }));
  }

  async listAdmin() {
    const rows = await this.prisma.goRideCategory.findMany({
      orderBy: { sort_order: 'asc' },
      include: { pricing: true },
    });
    return rows.map(withImageUrl);
  }

  async get(id: string) {
    return withImageUrl(await this.find(id));
  }

  async readImage(id: string) {
    const cat = await this.prisma.goRideCategory.findUnique({ where: { id }, select: { image_key: true } });
    const data = cat?.image_key ? await this.images.read(cat.image_key) : null;
    if (!cat?.image_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Image not found');
    return { data, mime: passportIconMime(cat.image_key) };
  }

  async create(user: AuthUser, dto: CreateCategoryDto) {
    let cat;
    try {
      cat = await this.prisma.goRideCategory.create({
        data: {
          code: dto.code.toUpperCase(),
          name_ar: dto.name_ar,
          name_en: dto.name_en,
          sort_order: dto.sort_order ?? 0,
          max_passengers: dto.max_passengers ?? 4,
          is_active: dto.is_active ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Category code already exists');
      }
      throw e;
    }
    if (dto.image) {
      cat = await this.prisma.goRideCategory.update({
        where: { id: cat.id },
        data: { image_key: await this.images.save(cat.id, dto.image) },
      });
    }
    await this.audit.log({
      actor: user,
      action: 'ride_category.created',
      entity_type: 'go_ride_category',
      entity_id: cat.id,
    });
    return withImageUrl(cat);
  }

  async update(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    const current = await this.find(id);
    const { image, remove_image, ...fields } = dto;
    let image_key: string | null | undefined;
    if (image) {
      image_key = await this.images.save(id, image);
    } else if (remove_image) {
      await this.images.remove(current.image_key);
      image_key = null;
    }
    const cat = await this.prisma.goRideCategory.update({
      where: { id },
      data: { ...fields, image_key },
      include: { pricing: true },
    });
    await this.audit.log({
      actor: user,
      action: 'ride_category.updated',
      entity_type: 'go_ride_category',
      entity_id: cat.id,
      metadata: { ...fields, image: image ? true : undefined, remove_image } as Prisma.InputJsonValue,
    });
    return withImageUrl(cat);
  }

  /**
   * Hard-delete when unused. Categories still linked to rides/vehicles/discounts/passport
   * rules must be deactivated instead (`is_active: false`).
   */
  async remove(user: AuthUser, id: string) {
    const current = await this.find(id);
    const [rides, vehicles, vehicleLinks, discounts, rules] = await Promise.all([
      this.prisma.goRide.count({ where: { ride_category_id: id } }),
      this.prisma.goVehicle.count({ where: { ride_category_id: id } }),
      this.prisma.goVehicleRideCategory.count({ where: { ride_category_id: id } }),
      this.prisma.goCustomerDiscountCategory.count({ where: { ride_category_id: id } }),
      this.prisma.goPassportScoreRule.count({ where: { ride_category_id: id } }),
    ]);
    if (rides || vehicles || vehicleLinks || discounts || rules) {
      throw new GoException(
        GoErrorCode.CONFLICT,
        'Category is in use; deactivate it instead of deleting',
        {
          rides,
          vehicles,
          vehicle_category_links: vehicleLinks,
          discounts,
          passport_score_rules: rules,
        },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.goRidePricing.deleteMany({ where: { ride_category_id: id } });
      await tx.goRideCategory.delete({ where: { id } });
    });
    await this.images.remove(current.image_key);
    await this.audit.log({
      actor: user,
      action: 'ride_category.deleted',
      entity_type: 'go_ride_category',
      entity_id: id,
      metadata: { code: current.code, name_ar: current.name_ar } as Prisma.InputJsonValue,
    });
    return { success: true };
  }

  private async find(id: string) {
    const cat = await this.prisma.goRideCategory.findUnique({ where: { id }, include: { pricing: true } });
    if (!cat) throw new GoException(GoErrorCode.NOT_FOUND, 'Ride category not found');
    return cat;
  }
}

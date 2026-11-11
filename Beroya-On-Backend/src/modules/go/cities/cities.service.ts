import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { CreateCityDto, UpdateCityDto } from './dto/cities.dto';

@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPublic() {
    return this.prisma.goCity
      .findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: 'asc' }, { name_ar: 'asc' }],
        select: { id: true, name_ar: true, name_en: true, lat: true, lng: true },
      })
      .then((items) => ({ items }));
  }

  listAdmin() {
    return this.prisma.goCity.findMany({
      orderBy: [{ sort_order: 'asc' }, { name_ar: 'asc' }],
    });
  }

  async create(actor: AuthUser, dto: CreateCityDto) {
    try {
      const created = await this.prisma.goCity.create({
        data: {
          name_ar: dto.name_ar,
          name_en: dto.name_en ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          sort_order: dto.sort_order ?? 0,
          is_active: dto.is_active ?? true,
        },
      });
      await this.audit.log({
        actor,
        action: AuditAction.CITY_CREATED,
        entity_type: 'GoCity',
        entity_id: created.id,
        metadata: dto as unknown as Prisma.InputJsonValue,
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'name_ar', messages: ['اسم المدينة مستخدم مسبقاً'] }],
        });
      }
      throw err;
    }
  }

  async update(actor: AuthUser, cityId: string, dto: UpdateCityDto) {
    const existing = await this.prisma.goCity.findUnique({ where: { id: cityId } });
    if (!existing) throw new GoException(GoErrorCode.NOT_FOUND, 'City not found');
    try {
      const updated = await this.prisma.goCity.update({
        where: { id: cityId },
        data: {
          name_ar: dto.name_ar,
          name_en: dto.name_en,
          lat: dto.lat,
          lng: dto.lng,
          sort_order: dto.sort_order,
          is_active: dto.is_active,
        },
      });
      await this.audit.log({
        actor,
        action: AuditAction.CITY_UPDATED,
        entity_type: 'GoCity',
        entity_id: cityId,
        metadata: dto as unknown as Prisma.InputJsonValue,
      });
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'name_ar', messages: ['اسم المدينة مستخدم مسبقاً'] }],
        });
      }
      throw err;
    }
  }

  /** Active city for new selection; throws field error when missing or inactive. */
  async requireActiveCity(cityId: string, field = 'city_id') {
    const city = await this.prisma.goCity.findUnique({ where: { id: cityId } });
    if (!city?.is_active) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field, messages: ['المدينة غير متاحة'] }],
      });
    }
    return city;
  }
}

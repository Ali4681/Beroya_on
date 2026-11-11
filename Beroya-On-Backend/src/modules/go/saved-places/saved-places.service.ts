import { Injectable } from '@nestjs/common';
import { GoSavedPlaceKind, Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import type { CreateSavedPlaceDto, UpdateSavedPlaceDto } from './dto/saved-places.dto';

export const SAVED_PLACES_LIMIT = 20;

function nameKey(name: string) {
  return name.trim().toLowerCase();
}

@Injectable()
export class SavedPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  private async customerId(userId: string) {
    const profile = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
      select: { id: true },
    });
    return profile.id;
  }

  private view(row: {
    id: string;
    name: string;
    kind: GoSavedPlaceKind;
    lat: Prisma.Decimal;
    lng: Prisma.Decimal;
    address: string | null;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      lat: decimalToNumber(row.lat),
      lng: decimalToNumber(row.lng),
      address: row.address,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async list(userId: string) {
    const customerId = await this.customerId(userId);
    const items = await this.prisma.goCustomerSavedPlace.findMany({
      where: { customer_id: customerId },
      orderBy: { updated_at: 'desc' },
    });
    return { items: items.map((r) => this.view(r)) };
  }

  /**
   * Create or upsert: same name_key, or same HOME/WORK kind, updates the existing row.
   */
  async upsert(userId: string, dto: CreateSavedPlaceDto) {
    const customerId = await this.customerId(userId);
    const name = dto.name.trim();
    const key = nameKey(name);
    const kind = dto.kind ?? GoSavedPlaceKind.OTHER;

    const byName = await this.prisma.goCustomerSavedPlace.findUnique({
      where: { customer_id_name_key: { customer_id: customerId, name_key: key } },
    });
    let existing = byName;
    if (!existing && (kind === GoSavedPlaceKind.HOME || kind === GoSavedPlaceKind.WORK)) {
      existing = await this.prisma.goCustomerSavedPlace.findFirst({
        where: { customer_id: customerId, kind },
      });
    }

    if (existing) {
      // Changing name/kind may collide with another row — resolve HOME/WORK / name conflicts.
      if (kind === GoSavedPlaceKind.HOME || kind === GoSavedPlaceKind.WORK) {
        const otherKind = await this.prisma.goCustomerSavedPlace.findFirst({
          where: { customer_id: customerId, kind, NOT: { id: existing.id } },
        });
        if (otherKind) {
          await this.prisma.goCustomerSavedPlace.delete({ where: { id: otherKind.id } });
        }
      }
      const nameOwner = await this.prisma.goCustomerSavedPlace.findUnique({
        where: { customer_id_name_key: { customer_id: customerId, name_key: key } },
      });
      if (nameOwner && nameOwner.id !== existing.id) {
        await this.prisma.goCustomerSavedPlace.delete({ where: { id: nameOwner.id } });
      }

      const updated = await this.prisma.goCustomerSavedPlace.update({
        where: { id: existing.id },
        data: {
          name,
          name_key: key,
          kind,
          lat: dto.lat,
          lng: dto.lng,
          address: dto.address ?? null,
        },
      });
      return { created: false as const, place: this.view(updated) };
    }

    const count = await this.prisma.goCustomerSavedPlace.count({ where: { customer_id: customerId } });
    if (count >= SAVED_PLACES_LIMIT) {
      throw new GoException(GoErrorCode.SAVED_PLACES_LIMIT_REACHED, 'Saved places limit reached', {
        limit: SAVED_PLACES_LIMIT,
      });
    }

    try {
      const created = await this.prisma.goCustomerSavedPlace.create({
        data: {
          customer_id: customerId,
          name,
          name_key: key,
          kind,
          lat: dto.lat,
          lng: dto.lng,
          address: dto.address ?? null,
        },
      });
      return { created: true as const, place: this.view(created) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'name', messages: ['اسم المكان مستخدم مسبقاً'] }],
        });
      }
      throw err;
    }
  }

  async update(userId: string, placeId: string, dto: UpdateSavedPlaceDto) {
    const customerId = await this.customerId(userId);
    const current = await this.prisma.goCustomerSavedPlace.findFirst({
      where: { id: placeId, customer_id: customerId },
    });
    if (!current) throw new GoException(GoErrorCode.NOT_FOUND, 'Saved place not found');

    const name = dto.name !== undefined ? dto.name.trim() : current.name;
    const key = nameKey(name);
    const kind = dto.kind ?? current.kind;

    if (key !== current.name_key) {
      const clash = await this.prisma.goCustomerSavedPlace.findUnique({
        where: { customer_id_name_key: { customer_id: customerId, name_key: key } },
      });
      if (clash) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'name', messages: ['اسم المكان مستخدم مسبقاً'] }],
        });
      }
    }

    if (
      (kind === GoSavedPlaceKind.HOME || kind === GoSavedPlaceKind.WORK) &&
      (kind !== current.kind || dto.kind !== undefined)
    ) {
      const other = await this.prisma.goCustomerSavedPlace.findFirst({
        where: { customer_id: customerId, kind, NOT: { id: current.id } },
      });
      if (other) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'kind', messages: [`يوجد مكان ${kind} محفوظ مسبقاً`] }],
        });
      }
    }

    const updated = await this.prisma.goCustomerSavedPlace.update({
      where: { id: current.id },
      data: {
        name,
        name_key: key,
        kind,
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address === undefined ? undefined : dto.address,
      },
    });
    return this.view(updated);
  }

  async remove(userId: string, placeId: string) {
    const customerId = await this.customerId(userId);
    const current = await this.prisma.goCustomerSavedPlace.findFirst({
      where: { id: placeId, customer_id: customerId },
      select: { id: true },
    });
    if (!current) throw new GoException(GoErrorCode.NOT_FOUND, 'Saved place not found');
    await this.prisma.goCustomerSavedPlace.delete({ where: { id: current.id } });
  }
}

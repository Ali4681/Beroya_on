import { Injectable } from '@nestjs/common';
import { GoRideRequirementType, Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DriversService } from '../drivers/drivers.service';
import type { CreateVehicleDto, UpdateVehicleDto } from '../drivers/dto/drivers.dto';

const vehicleInclude = {
  capabilities: true,
  ride_category: { select: { id: true, code: true, name_ar: true } },
  ride_categories: {
    include: { ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } } },
  },
  driver: { select: { id: true, user_id: true, user: { select: { phone: true, full_name: true } } } },
  branch: { select: { id: true, code: true, name_ar: true } },
} satisfies Prisma.GoVehicleInclude;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly audit: AuditService,
    private readonly drivers: DriversService,
  ) {}

  async list(user: AuthUser, page = 1, limit = 20, branchId?: string) {
    const filter = this.branchScope.resolveFilter(user, branchId);
    return this.prisma.goVehicle.findMany({
      where: filter ? { branch_id: filter } : {},
      include: vehicleInclude,
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  async get(id: string, user?: AuthUser) {
    const vehicle = await this.prisma.goVehicle.findUnique({ where: { id }, include: vehicleInclude });
    if (!vehicle) throw new GoException(GoErrorCode.NOT_FOUND, 'Vehicle not found');
    if (user && vehicle.branch_id) this.branchScope.assertAccess(user, vehicle.branch_id);
    return vehicle;
  }

  async create(actor: AuthUser, dto: CreateVehicleDto) {
    if (dto.branch_id) this.branchScope.assertAccess(actor, dto.branch_id);
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { id: dto.driver_id } });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (driver.branch_id) this.branchScope.assertAccess(actor, driver.branch_id);

    const categoryIds = await this.assertActiveCategories(dto.ride_category_ids);
    const capabilities = this.assertVehicleCapabilities(dto.capabilities);

    // Upload docs/photos first so a failed upload never leaves an orphan vehicle.
    await this.drivers.attachVehicleOnboarding(actor, dto.driver_id, {
      documents: dto.documents,
      vehicle_photos: dto.vehicle_photos,
    });

    try {
      const vehicle = await this.prisma.$transaction(async (tx) => {
        const created = await tx.goVehicle.create({
          data: {
            plate_number: dto.plate_number,
            driver_id: dto.driver_id,
            branch_id: dto.branch_id ?? driver.branch_id,
            ride_category_id: categoryIds[0],
            make: dto.make,
            model: dto.model,
            color: dto.color,
            year: dto.year,
            capabilities: capabilities?.length
              ? { create: capabilities.map((type) => ({ type })) }
              : undefined,
            ride_categories: {
              create: categoryIds.map((ride_category_id) => ({ ride_category_id })),
            },
          },
          include: vehicleInclude,
        });
        if (dto.set_as_active !== false) {
          await tx.goDriverProfile.update({
            where: { id: dto.driver_id },
            data: { active_vehicle_id: created.id },
          });
        }
        return created;
      });
      await this.audit.log({
        actor,
        action: 'vehicle.created',
        entity_type: 'go_vehicle',
        entity_id: vehicle.id,
        branch_id: vehicle.branch_id,
        metadata: {
          driver_id: dto.driver_id,
          ride_category_ids: categoryIds,
          documents: dto.documents.map((doc) => doc.type),
          vehicle_photos: dto.vehicle_photos.length,
        },
      });
      return vehicle;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Plate number already exists');
      }
      throw e;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateVehicleDto) {
    await this.get(id, actor);
    const categoryIds =
      dto.ride_category_ids === undefined ? undefined : await this.assertActiveCategories(dto.ride_category_ids);
    const capabilities = dto.capabilities === undefined ? undefined : this.assertVehicleCapabilities(dto.capabilities);
    const vehicle = await this.prisma.$transaction(async (tx) => {
      if (capabilities) {
        await tx.goVehicleCapability.deleteMany({ where: { vehicle_id: id } });
        if (capabilities.length) {
          await tx.goVehicleCapability.createMany({
            data: capabilities.map((type) => ({ vehicle_id: id, type })),
          });
        }
      }
      if (categoryIds) {
        await tx.goVehicleRideCategory.deleteMany({ where: { vehicle_id: id } });
        await tx.goVehicleRideCategory.createMany({
          data: categoryIds.map((ride_category_id) => ({ vehicle_id: id, ride_category_id })),
        });
      }
      return tx.goVehicle.update({
        where: { id },
        data: {
          driver_id: dto.driver_id === undefined ? undefined : dto.driver_id,
          branch_id: dto.branch_id === undefined ? undefined : dto.branch_id,
          ride_category_id: categoryIds === undefined ? undefined : categoryIds[0],
          make: dto.make,
          model: dto.model,
          color: dto.color,
          year: dto.year,
          is_active: dto.is_active,
        },
        include: vehicleInclude,
      });
    });
    await this.audit.log({
      actor,
      action: 'vehicle.updated',
      entity_type: 'go_vehicle',
      entity_id: id,
      metadata: dto as Prisma.InputJsonValue,
    });
    return vehicle;
  }

  private async assertActiveCategories(categoryIds: string[]) {
    const unique = [...new Set(categoryIds.filter(Boolean))];
    if (!unique.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'At least one ride category is required');
    }
    const categories = await this.prisma.goRideCategory.findMany({
      where: { id: { in: unique }, is_active: true },
      select: { id: true },
    });
    if (categories.length !== unique.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'ride_category_ids must be active ride categories');
    }
    return unique;
  }

  /** Ticket §3 — FEMALE_DRIVER is driver gender, never a vehicle capability. */
  private assertVehicleCapabilities(caps?: GoRideRequirementType[]) {
    if (!caps?.length) return caps ?? [];
    if (caps.includes(GoRideRequirementType.FEMALE_DRIVER)) {
      throw new GoException(
        GoErrorCode.VALIDATION_ERROR,
        'FEMALE_DRIVER depends on driver profile gender, not vehicle capability',
      );
    }
    return caps;
  }
}

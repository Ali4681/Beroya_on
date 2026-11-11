import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { serviceAreaCentroid } from '../incentives/incentive-math';
import { pointInServiceArea } from './branch-geo.util';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, page = 1, limit = 20, activeOnly = false) {
    const branchFilter = this.branchScope.resolveFilter(user);
    return this.prisma.goBranch.findMany({
      where: {
        ...(branchFilter ? { id: branchFilter } : {}),
        ...(activeOnly ? { is_active: true } : {}),
      },
      orderBy: { code: 'asc' },
      ...pageSkip(page, limit),
    });
  }

  async get(id: string, user?: AuthUser) {
    const branch = await this.prisma.goBranch.findUnique({ where: { id } });
    if (!branch) throw new GoException(GoErrorCode.NOT_FOUND, 'Branch not found');
    if (user) this.branchScope.assertAccess(user, branch.id);
    return branch;
  }

  async detail(id: string) {
    const branch = await this.get(id);
    return { ...branch, service_area_center: serviceAreaCentroid(branch.service_area) };
  }

  async create(user: AuthUser, dto: CreateBranchDto) {
    try {
      const branch = await this.prisma.goBranch.create({
        data: {
          code: dto.code.toUpperCase(),
          name_ar: dto.name_ar,
          name_en: dto.name_en,
          is_active: dto.is_active ?? true,
          service_area: dto.service_area as Prisma.InputJsonValue | undefined,
        },
      });
      await this.audit.log({
        actor: user,
        action: 'branch.created',
        entity_type: 'go_branch',
        entity_id: branch.id,
        metadata: { code: branch.code },
      });
      return branch;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Branch code already exists');
      }
      throw e;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    await this.get(id);
    if ((dto.center_lat === undefined) !== (dto.center_lng === undefined)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'center_lat and center_lng must be sent together');
    }
    if ((dto.center_lat === null) !== (dto.center_lng === null)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'center_lat and center_lng must both be set or both null');
    }
    const branch = await this.prisma.goBranch.update({
      where: { id },
      data: {
        name_ar: dto.name_ar,
        name_en: dto.name_en,
        is_active: dto.is_active,
        service_area: dto.service_area === undefined ? undefined : (dto.service_area as Prisma.InputJsonValue),
        center_lat: dto.center_lat,
        center_lng: dto.center_lng,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'branch.updated',
      entity_type: 'go_branch',
      entity_id: branch.id,
      metadata: dto as Prisma.InputJsonValue,
    });
    return branch;
  }

  /** Pickup → owning branch (Ticket §1.4). Used by Phase 2 ride create. */
  async resolveFromPickup(lat: number, lng: number) {
    // Overlapping areas: the oldest branch wins, so the result is stable.
    const branches = await this.prisma.goBranch.findMany({
      where: { is_active: true },
      orderBy: [{ created_at: 'asc' }, { code: 'asc' }],
    });
    const match = branches.find((b) => b.service_area && pointInServiceArea({ lat, lng }, b.service_area));
    if (!match) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Pickup is outside all service areas', {
        code_detail: 'PICKUP_OUT_OF_SERVICE_AREA',
      });
    }
    return match;
  }
}

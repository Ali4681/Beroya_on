import { Injectable } from '@nestjs/common';
import { GoIncentiveKind, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { CreateGoalCampaignDto, UpdateGoalCampaignDto } from './dto/incentives.dto';

@Injectable()
export class GoalCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const campaigns = await this.prisma.goGoalCampaign.findMany({
      orderBy: [{ is_active: 'desc' }, { start_time: 'asc' }],
      include: { branch: { select: { id: true, code: true, name_ar: true } } },
    });
    const totals = await this.prisma.goDriverIncentiveGrant.groupBy({
      by: ['campaign_id'],
      where: { kind: GoIncentiveKind.GOAL_CAMPAIGN, campaign_id: { in: campaigns.map((c) => c.id) } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byId = new Map(totals.map((t) => [t.campaign_id, t]));
    return campaigns.map((c) => ({
      ...c,
      grants_count: byId.get(c.id)?._count._all ?? 0,
      grants_total: byId.get(c.id)?._sum.amount ?? new Prisma.Decimal(0),
    }));
  }

  async get(id: string) {
    const campaign = await this.prisma.goGoalCampaign.findUnique({
      where: { id },
      include: { branch: { select: { id: true, code: true, name_ar: true } } },
    });
    if (!campaign) throw new GoException(GoErrorCode.NOT_FOUND, 'Campaign not found');
    return campaign;
  }

  async create(actor: AuthUser, dto: CreateGoalCampaignDto) {
    this.assertWindow(dto.start_time, dto.end_time);
    await this.assertBranch(dto.branch_id);
    const campaign = await this.prisma.goGoalCampaign.create({
      data: {
        name: dto.name.trim(),
        start_time: dto.start_time,
        end_time: dto.end_time,
        days_of_week: [...new Set(dto.days_of_week ?? [])].sort((a, b) => a - b),
        rides_required: dto.rides_required,
        reward_amount: dto.reward_amount,
        branch_id: dto.branch_id ?? null,
        is_active: dto.is_active ?? true,
        created_by_id: actor.id,
      },
    });
    await this.log(actor, campaign.id, { op: 'create', ...dto });
    return campaign;
  }

  async update(actor: AuthUser, id: string, dto: UpdateGoalCampaignDto) {
    const current = await this.get(id);
    this.assertWindow(dto.start_time ?? current.start_time, dto.end_time ?? current.end_time);
    if (dto.branch_id) await this.assertBranch(dto.branch_id);
    const campaign = await this.prisma.goGoalCampaign.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        start_time: dto.start_time,
        end_time: dto.end_time,
        days_of_week: dto.days_of_week ? [...new Set(dto.days_of_week)].sort((a, b) => a - b) : undefined,
        rides_required: dto.rides_required,
        reward_amount: dto.reward_amount,
        branch_id: dto.branch_id === undefined ? undefined : dto.branch_id,
        is_active: dto.is_active,
      },
    });
    await this.log(actor, id, { op: 'update', ...dto });
    return campaign;
  }

  async remove(actor: AuthUser, id: string) {
    await this.get(id);
    await this.prisma.goGoalCampaign.delete({ where: { id } });
    await this.log(actor, id, { op: 'delete' });
    return { deleted: true };
  }

  private assertWindow(start: string, end: string) {
    if (start === end) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'start_time and end_time must differ');
  }

  private async assertBranch(branchId?: string | null) {
    if (!branchId) return;
    const exists = await this.prisma.goBranch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!exists) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id not found');
  }

  private log(actor: AuthUser, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({
      actor,
      action: AuditAction.GOAL_CAMPAIGN_CHANGED,
      entity_type: 'GoGoalCampaign',
      entity_id: id,
      metadata: metadata as Prisma.InputJsonValue,
    });
  }
}

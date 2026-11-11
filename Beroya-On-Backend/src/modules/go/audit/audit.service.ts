import { Injectable, Logger } from '@nestjs/common';
import { GoRole, Prisma } from '@/generated/prisma/client';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { STAFF_ROLES } from '../../../common/auth/roles';

/** Audited actions (Ticket §30). Extend as phases add sensitive operations. */
export const AuditAction = {
  AUTH_STAFF_LOGIN: 'auth.staff_login',
  AUTH_STAFF_PASSWORD_CHANGED: 'auth.staff_password_changed',
  WALLET_TOP_UP: 'wallet.top_up',
  WALLET_WITHDRAWAL: 'wallet.withdrawal',
  WALLET_REVERSAL: 'wallet.reversal',
  CUSTOMER_WALLET_TOP_UP: 'customer_wallet.top_up',
  CUSTOMER_WALLET_WITHDRAWAL: 'customer_wallet.withdrawal',
  CUSTOMER_WALLET_VOUCHER_REDEEM: 'customer_wallet.voucher_redeem',
  CUSTOMER_WALLET_TRANSFER: 'customer_wallet.transfer',
  WALLET_VOUCHER_CREATED: 'wallet_voucher.created',
  WALLET_VOUCHER_DISABLED: 'wallet_voucher.disabled',
  CONTACT_INFO_VIEWED: 'ride.contact_info_viewed',
  COMPENSATION_APPLIED: 'compensation.applied',
  COMPENSATION_ALLOCATED: 'compensation.finance_allocated',
  RIDE_CANCELLED_BY_STAFF: 'ride.cancelled_by_staff',
  RIDE_CANCELLED_BY_DRIVER: 'ride.cancelled_by_driver',
  RIDE_CANCELLED_BY_CUSTOMER: 'ride.cancelled_by_customer',
  RIDE_PICKUP_UPDATED: 'ride.pickup_updated',
  RIDE_BREAKDOWN_REPORTED: 'ride.breakdown_reported',
  CASE_CLOSED: 'case.closed',
  CASE_REOPENED: 'case.reopened',
  EMERGENCY_STARTED: 'emergency.started',
  EMERGENCY_CLAIMED: 'emergency.claimed',
  EMERGENCY_CLOSED: 'emergency.closed',
  EMERGENCY_RECORDING_SAVED: 'emergency.recording_saved',
  EMERGENCY_RECORDING_PLAYED: 'emergency.recording_played',
  EMERGENCY_RECORDING_DELETED: 'emergency.recording_deleted',
  COMPLAINT_CREATED: 'complaint.created',
  COMPLAINT_CLAIMED: 'complaint.claimed',
  COMPLAINT_UPDATED: 'complaint.updated',
  COMPLAINT_CLOSED: 'complaint.closed',
  DRIVER_ENTITLEMENT_ADJUSTED: 'driver_entitlement.adjusted',
  PASSPORT_ADMIN_CHANGED: 'passport.admin_changed',
  DISCOUNT_CODE_CHANGED: 'discount_code.changed',
  PRICING_CHANGED: 'pricing.changed',
  COMMISSION_CHANGED: 'commission.changed',
  INCENTIVE_CONFIG_CHANGED: 'incentive.config_changed',
  INCENTIVE_DAILY_CAP_REACHED: 'incentive.daily_cap_reached',
  INCENTIVE_RUN: 'incentive.manual_run',
  INCENTIVE_MANUAL_GRANT: 'incentive.manual_grant',
  GOAL_CAMPAIGN_CHANGED: 'incentive.goal_campaign_changed',
  FUEL_PRICE_CHANGED: 'pricing.fuel_price_changed',
  CITY_CREATED: 'city.created',
  CITY_UPDATED: 'city.updated',
  CUSTOMER_ACCOUNT_DELETED: 'CUSTOMER_ACCOUNT_DELETED',
  DRIVER_ACCOUNT_DELETED: 'DRIVER_ACCOUNT_DELETED',
  DRIVER_PHONE_CHANGED: 'driver.phone_changed',
  DRIVER_PHONE_CHANGE_REQUESTED: 'driver.phone_change_requested',
  DRIVER_PHONE_CHANGE_APPROVED: 'driver.phone_change_approved',
  DRIVER_PHONE_CHANGE_REJECTED: 'driver.phone_change_rejected',
  DRIVER_PHONE_CHANGE_CANCELLED: 'driver.phone_change_cancelled',
  ALERT_ACKNOWLEDGED: 'alert.acknowledged',
  ALERT_RESOLVED: 'alert.resolved',
  COMMAND_CENTER_CONFIG_CHANGED: 'command_center.config_changed',
  STORE_CREATED: 'store.created',
  STORE_UPDATED: 'store.updated',
  STORE_STATUS_CHANGED: 'store.status_changed',
  STORE_BALANCE_CREDITED: 'store.balance_credited',
  STORE_BALANCE_ADJUSTED: 'store.balance_adjusted',
  STORE_OPERATOR_CREATED: 'store.operator_created',
  STORE_OPERATOR_UPDATED: 'store.operator_updated',
  STORE_DRIVER_RECHARGED: 'store.driver_recharged',
  STORE_RECHARGE_REVERSED: 'store.recharge_reversed',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditCategory = 'driver' | 'customer' | 'ops' | 'topup' | 'complaints' | 'emergency';

export interface AuditEntry {
  actor?: { id: string; role: GoRole; branch_id?: string | null } | null;
  action: AuditActionValue | string;
  entity_type: string;
  entity_id: string;
  branch_id?: string | null;
  metadata?: Prisma.InputJsonValue;
}

type Db = Prisma.TransactionClient | PrismaService;

const TOPUP_ACTIONS = [
  AuditAction.WALLET_TOP_UP,
  AuditAction.CUSTOMER_WALLET_TOP_UP,
  AuditAction.STORE_DRIVER_RECHARGED,
  AuditAction.STORE_BALANCE_CREDITED,
] as const;

function categoryWhere(category?: string): Prisma.GoAuditLogWhereInput | undefined {
  if (!category) return undefined;
  switch (category) {
    case 'driver':
      return {
        OR: [
          { actor_role: GoRole.DRIVER },
          { action: { startsWith: 'driver.' } },
          { action: { in: [AuditAction.DRIVER_ACCOUNT_DELETED, AuditAction.DRIVER_ENTITLEMENT_ADJUSTED] } },
          { entity_type: { contains: 'driver', mode: 'insensitive' } },
          { entity_type: { contains: 'Driver' } },
        ],
      };
    case 'customer':
      return {
        OR: [
          { actor_role: GoRole.CUSTOMER },
          { action: { startsWith: 'customer' } },
          { action: { in: [AuditAction.CUSTOMER_ACCOUNT_DELETED, AuditAction.PASSPORT_ADMIN_CHANGED] } },
          { entity_type: { contains: 'customer', mode: 'insensitive' } },
          { entity_type: { contains: 'Customer' } },
          { entity_type: { contains: 'passport', mode: 'insensitive' } },
        ],
      };
    case 'topup':
      return { action: { in: [...TOPUP_ACTIONS] } };
    case 'emergency':
      return {
        OR: [
          { action: { startsWith: 'emergency.' } },
          { entity_type: { contains: 'emergency', mode: 'insensitive' } },
          { entity_type: { contains: 'Emergency' } },
          { entity_type: { equals: 'go_emergency_session' } },
        ],
      };
    case 'complaints':
      return {
        OR: [
          { action: { startsWith: 'complaint.' } },
          { action: { contains: 'complaint' } },
          { entity_type: { contains: 'complaint', mode: 'insensitive' } },
          { entity_type: { contains: 'Complaint' } },
          { entity_type: { equals: 'go_complaint' } },
        ],
      };
    case 'ops':
      return {
        AND: [
          { actor_role: { in: [...STAFF_ROLES] } },
          { NOT: { action: { in: [...TOPUP_ACTIONS] } } },
          { NOT: { action: { startsWith: 'emergency.' } } },
        ],
      };
    default:
      return undefined;
  }
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the audit row inside the same transaction as the audited change. */
  async log(entry: AuditEntry, tx?: Db): Promise<void> {
    const db = tx ?? this.prisma;
    await db.goAuditLog.create({
      data: {
        actor_user_id: entry.actor?.id ?? null,
        actor_role: entry.actor?.role ?? null,
        branch_id: entry.branch_id ?? entry.actor?.branch_id ?? null,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        metadata: entry.metadata,
      },
    });
    this.logger.debug(`${entry.action} ${entry.entity_type}:${entry.entity_id}`);
  }

  private async withActors<T extends { actor_user_id: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((row) => row.actor_user_id).filter((id): id is string => !!id))];
    if (ids.length === 0) return rows.map((row) => ({ ...row, actor: null }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true, phone: true, role: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => ({
      ...row,
      actor: row.actor_user_id ? byId.get(row.actor_user_id) ?? null : null,
    }));
  }

  async list(q: {
    page?: number;
    limit?: number;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    category?: string;
  }) {
    const where: Prisma.GoAuditLogWhereInput = {
      AND: [
        {
          action: q.action || undefined,
          entity_type: q.entity_type || undefined,
          entity_id: q.entity_id || undefined,
        },
        categoryWhere(q.category) ?? {},
      ],
    };
    const rows = await this.prisma.goAuditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      ...pageSkip(q.page, q.limit),
    });
    return this.withActors(rows);
  }

  async get(id: string) {
    const row = await this.prisma.goAuditLog.findUnique({ where: { id } });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Audit entry not found');
    const [presented] = await this.withActors([row]);
    return {
      ...presented,
      related: this.relatedHint(row.entity_type, row.entity_id, row.metadata),
    };
  }

  private relatedHint(entityType: string, entityId: string, metadata: Prisma.JsonValue | null) {
    const kind = entityType.toLowerCase();
    const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
    if (kind.includes('complaint')) return { kind: 'complaint', id: entityId, path: `/erp/complaints/${entityId}` };
    if (kind.includes('emergency')) return { kind: 'emergency', id: entityId, path: `/erp/emergencies/${entityId}` };
    if (kind.includes('case')) return { kind: 'case', id: entityId, path: `/erp/cases/${entityId}` };
    if (kind.includes('ride') && !kind.includes('case')) return { kind: 'ride', id: entityId, path: `/erp/rides/${entityId}` };
    if (kind.includes('driverprofile') || kind === 'go_driver_profile') {
      return { kind: 'driver', id: entityId, path: `/admin/drivers/${entityId}` };
    }
    if (kind.includes('customerprofile') || kind === 'go_customer_profile') {
      return { kind: 'customer', id: entityId, path: `/erp/customers/${entityId}` };
    }
    if (kind.includes('phone')) return { kind: 'phone_change', id: entityId, path: '/admin/drivers/phone-changes' };
    if (kind.includes('store') && !kind.includes('operator')) {
      return { kind: 'store', id: entityId, path: `/admin/stores/${entityId}` };
    }
    if (kind.includes('incentivegrant')) {
      const driverId = typeof meta?.driver_id === 'string' ? meta.driver_id : null;
      return {
        kind: 'incentive',
        id: entityId,
        path: driverId ? `/admin/drivers/${driverId}` : '/erp/finance/incentives',
      };
    }
    if (kind.includes('alert')) return { kind: 'alert', id: entityId, path: `/erp/alerts/${entityId}` };
    return null;
  }
}

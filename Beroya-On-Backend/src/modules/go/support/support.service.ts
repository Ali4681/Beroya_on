import { Injectable } from '@nestjs/common';
import { GoRole, GoSupportMessageStatus, Prisma } from '@/generated/prisma/client';
import { randomBytes } from 'crypto';
import type { AuthUser } from '../../../common/auth/auth-user';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { RedisService } from '../../../infra/redis/redis.service';

const MAX_MESSAGES_PER_HOUR = 5;
const CS_ROLES = [GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR] as const;

type SupportPartyInclude = {
  customer: { id: string; user: { id: string; full_name: string | null; phone: string | null } } | null;
  driver: { id: string; user: { id: string; full_name: string | null; phone: string | null } } | null;
};

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
  ) {}

  async createByCustomer(
    userId: string,
    body: { full_name: string; phone: string; email?: string | null; message: string },
  ) {
    const customer = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });

    if (process.env.NODE_ENV !== 'test') {
      const hourly = await this.redis.incr(`support:hourly:${customer.id}`, 3600);
      if (hourly > MAX_MESSAGES_PER_HOUR) {
        throw new GoException(GoErrorCode.RATE_LIMITED, 'Too many support messages, try again later');
      }
    }

    const row = await this.prisma.goSupportMessage.create({
      data: {
        reference: await this.nextReference(),
        customer_id: customer.id,
        full_name: body.full_name.trim(),
        phone: body.phone,
        email: body.email?.trim() || null,
        message: body.message.trim(),
      },
    });

    this.realtime.emitToStaffRoles(CS_ROLES, 'support_message.created', {
      support_message_id: row.id,
      reference: row.reference,
      customer_id: customer.id,
      driver_id: null,
      status: row.status,
    });

    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      created_at: row.created_at,
    };
  }

  async createByDriver(
    userId: string,
    body: { full_name: string; phone: string; email?: string | null; message: string },
  ) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    if (process.env.NODE_ENV !== 'test') {
      const hourly = await this.redis.incr(`support:hourly:driver:${driver.id}`, 3600);
      if (hourly > MAX_MESSAGES_PER_HOUR) {
        throw new GoException(GoErrorCode.RATE_LIMITED, 'Too many support messages, try again later');
      }
    }

    const row = await this.prisma.goSupportMessage.create({
      data: {
        reference: await this.nextReference(),
        driver_id: driver.id,
        full_name: body.full_name.trim(),
        phone: body.phone,
        email: body.email?.trim() || null,
        message: body.message.trim(),
      },
    });

    this.realtime.emitToStaffRoles(CS_ROLES, 'support_message.created', {
      support_message_id: row.id,
      reference: row.reference,
      customer_id: null,
      driver_id: driver.id,
      status: row.status,
    });

    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      created_at: row.created_at,
    };
  }

  async listMine(userId: string, page?: number, limit?: number) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) return [];
    const rows = await this.prisma.goSupportMessage.findMany({
      where: { customer_id: customer.id },
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
    return rows.map((r) => this.toPartyItem(r));
  }

  async listMineDriver(userId: string, page?: number, limit?: number) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) return [];
    const rows = await this.prisma.goSupportMessage.findMany({
      where: { driver_id: driver.id },
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
    return rows.map((r) => this.toPartyItem(r));
  }

  async listErp(
    q: {
      page?: number;
      limit?: number;
      status?: GoSupportMessageStatus;
      from?: string;
      to?: string;
    },
  ) {
    const created_at = this.dateRange(q.from, q.to);
    return this.prisma.goSupportMessage.findMany({
      where: {
        status: q.status,
        ...(created_at ? { created_at } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        customer: { select: { id: true, user: { select: { id: true, full_name: true, phone: true } } } },
        driver: { select: { id: true, user: { select: { id: true, full_name: true, phone: true } } } },
        claimed_by: { select: { id: true, full_name: true, phone: true } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  async getErp(id: string) {
    const row = await this.prisma.goSupportMessage.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, user: { select: { id: true, full_name: true, phone: true } } } },
        driver: { select: { id: true, user: { select: { id: true, full_name: true, phone: true } } } },
        claimed_by: { select: { id: true, full_name: true, phone: true, email: true } },
      },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Support message not found');
    return row;
  }

  async claim(actor: AuthUser, id: string) {
    const row = await this.getErp(id);
    if (row.status === GoSupportMessageStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Support message is closed');
    }
    const updated = await this.prisma.goSupportMessage.update({
      where: { id },
      data: {
        claimed_by_id: actor.id,
        status: GoSupportMessageStatus.IN_PROGRESS,
      },
    });
    this.notifyUpdate(row, updated);
    return updated;
  }

  async update(
    actor: AuthUser,
    id: string,
    body: { status?: GoSupportMessageStatus; reply?: string | null },
  ) {
    const row = await this.getErp(id);
    if (row.status === GoSupportMessageStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Support message is closed');
    }
    if (body.status === GoSupportMessageStatus.CLOSED) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Use POST .../close to close a support message');
    }
    const updated = await this.prisma.goSupportMessage.update({
      where: { id },
      data: {
        status: body.status,
        reply: body.reply === undefined ? undefined : body.reply?.trim() || null,
        claimed_by_id: row.claimed_by_id ?? actor.id,
      },
    });
    this.notifyUpdate(row, updated);
    return updated;
  }

  async close(actor: AuthUser, id: string, body?: { reply?: string | null }) {
    const row = await this.getErp(id);
    if (row.status === GoSupportMessageStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Already closed');
    }
    const updated = await this.prisma.goSupportMessage.update({
      where: { id },
      data: {
        status: GoSupportMessageStatus.CLOSED,
        closed_at: new Date(),
        claimed_by_id: row.claimed_by_id ?? actor.id,
        reply: body?.reply === undefined ? undefined : body.reply?.trim() || null,
      },
    });
    this.notifyUpdate(row, updated);
    return updated;
  }

  private notifyUpdate(
    party: SupportPartyInclude,
    row: { id: string; reference: string; status: GoSupportMessageStatus; reply: string | null },
  ) {
    const payload = {
      support_message_id: row.id,
      reference: row.reference,
      status: row.status,
      reply: row.reply,
    };
    this.realtime.emitToStaffRoles(CS_ROLES, 'support.updated', payload);
    if (party.customer?.user?.id) {
      this.realtime.emitToCustomer(party.customer.user.id, 'support.updated', payload);
    }
    if (party.driver?.user?.id) {
      this.realtime.emitToDriver(party.driver.user.id, 'support.updated', payload);
    }
  }

  private toPartyItem(r: {
    id: string;
    reference: string;
    status: GoSupportMessageStatus;
    message: string;
    reply: string | null;
    created_at: Date;
    updated_at: Date;
    closed_at: Date | null;
  }) {
    return {
      id: r.id,
      reference: r.reference,
      status: r.status,
      message: r.message,
      reply: r.reply,
      created_at: r.created_at,
      updated_at: r.updated_at,
      closed_at: r.closed_at,
    };
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const range: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid from date');
      range.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid to date');
      range.lte = d;
    }
    return range;
  }

  private async nextReference() {
    for (let i = 0; i < 8; i++) {
      const reference = `SUP-${randomBytes(4).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.goSupportMessage.findUnique({
        where: { reference },
        select: { id: true },
      });
      if (!exists) return reference;
    }
    throw new GoException(GoErrorCode.INTERNAL_ERROR, 'Could not allocate support reference');
  }
}

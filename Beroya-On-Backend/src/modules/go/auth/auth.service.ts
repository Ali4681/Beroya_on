import { Injectable } from '@nestjs/common';
import { GoOtpPurpose, GoRole, Prisma } from '@/generated/prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BRANCH_REQUIRED_ROLES, DESK_LOGIN_ROLES, STAFF_ROLES, isDeskLoginRole, isStaffRole } from '../../../common/auth/roles';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { customerPersonalFields } from '../customers/customer-profile.view';
import { driverPersonalFields } from '../drivers/driver-profile.view';
import { driverRating } from '../rides/ride-driver-card';
import { ChangePasswordDto, OtpApp, RequestOtpDto, StaffLoginDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { DeviceContext, SessionService } from './session.service';
import { StaffAvatarStorage } from './staff-avatar.storage';

const USER_SELECT = {
  id: true,
  role: true,
  phone: true,
  email: true,
  full_name: true,
  avatar_key: true,
  branch_id: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
  branch: { select: { id: true, code: true, name_ar: true, name_en: true } },
  store: { select: { id: true, code: true, name: true, status: true } },
} satisfies Prisma.UserSelect;

const LOGIN_FAIL_LIMIT = 10;
const LOGIN_FAIL_WINDOW_SEC = 15 * 60;

const purposeOf = (app: OtpApp): GoOtpPurpose =>
  app === 'DRIVER' ? GoOtpPurpose.DRIVER_LOGIN : GoOtpPurpose.CUSTOMER_LOGIN;
const roleOf = (app: OtpApp): GoRole => (app === 'DRIVER' ? GoRole.DRIVER : GoRole.CUSTOMER);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly staffAvatars: StaffAvatarStorage,
  ) {}

  /** Customers self-register on first verify; drivers must be onboarded by Operations first. */
  async requestOtp(dto: RequestOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone_role: { phone: dto.phone, role: roleOf(dto.app) } },
      select: { is_active: true },
    });
    if (dto.app === 'DRIVER' && !user) {
      throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'No driver account for this phone');
    }
    if (user && !user.is_active) throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
    return this.otp.issue(dto.phone, purposeOf(dto.app));
  }

  async verifyOtp(dto: VerifyOtpDto, ctx: Pick<DeviceContext, 'ip' | 'user_agent'>) {
    await this.otp.verify(dto.phone, purposeOf(dto.app), dto.code);
    const role = roleOf(dto.app);

    let user = await this.prisma.user.findUnique({ where: { phone_role: { phone: dto.phone, role } } });
    let isNew = false;
    if (!user) {
      if (role === GoRole.DRIVER) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'No driver account for this phone');
      user = await this.prisma.user.create({ data: { phone: dto.phone, role } });
      isNew = true;
    }
    if (!user.is_active) throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');

    if (role === GoRole.CUSTOMER) {
      await this.prisma.goCustomerProfile.upsert({
        where: { user_id: user.id },
        create: { user_id: user.id },
        update: {},
      });
    }

    const tokens = await this.sessions.create(user, { ...dto, ...ctx });
    const profile = await this.touchLogin(user.id);
    return { ...tokens, user: profile, is_new_user: isNew };
  }

  async staffLogin(dto: StaffLoginDto, ctx: Pick<DeviceContext, 'ip' | 'user_agent'>) {
    const identifier = dto.identifier.includes('@') ? dto.identifier.toLowerCase() : dto.identifier;
    const failKey = `login:fail:${identifier}`;
    if (Number((await this.redis.get(failKey)) ?? 0) >= LOGIN_FAIL_LIMIT) {
      throw new GoException(GoErrorCode.RATE_LIMITED, 'Too many failed logins, try again later');
    }

    const user = await this.prisma.user.findFirst({
      where: identifier.includes('@')
        ? { email: identifier }
        : { phone: identifier, role: { in: [...DESK_LOGIN_ROLES] } },
    });
    const valid =
      !!user &&
      isDeskLoginRole(user.role) &&
      !!user.password_hash &&
      (await bcrypt.compare(dto.password, user.password_hash));
    if (!valid || !user) {
      await this.redis.incr(failKey, LOGIN_FAIL_WINDOW_SEC);
      throw new GoException(GoErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');
    }
    if (!user.is_active) throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
    await this.redis.del(failKey);

    const tokens = await this.sessions.create(user, { ...dto, ...ctx });
    const profile = await this.touchLogin(user.id);
    await this.audit.log({
      actor: user,
      action: AuditAction.AUTH_STAFF_LOGIN,
      entity_type: 'user',
      entity_id: user.id,
      metadata: { ip: ctx.ip ?? null, platform: dto.platform ?? null },
    });
    return { ...tokens, user: profile };
  }

  async refresh(refreshToken: string) {
    const { tokens, userId } = await this.sessions.rotate(refreshToken);
    return { ...tokens, user: await this.me(userId) };
  }

  async logout(user: AuthUser) {
    await this.sessions.revoke(user.session_id);
    return { success: true };
  }

  async logoutAll(user: AuthUser) {
    await this.sessions.revokeAllForUser(user.id);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND);
    return this.withRoleProfileFields(user);
  }

  async changePassword(auth: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (!user.password_hash || !(await bcrypt.compare(dto.current_password, user.password_hash))) {
      throw new GoException(GoErrorCode.INVALID_CREDENTIALS, 'Current password is wrong');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: await bcrypt.hash(dto.new_password, 10) },
    });
    await this.sessions.revokeAllForUser(user.id, auth.session_id);
    await this.audit.log({
      actor: auth,
      action: AuditAction.AUTH_STAFF_PASSWORD_CHANGED,
      entity_type: 'user',
      entity_id: user.id,
    });
    return { success: true };
  }

  listStaff(page = 1, limit = 20, branchId?: string) {
    return this.prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] }, ...(branchId ? { branch_id: branchId } : {}) },
      select: USER_SELECT,
      orderBy: { created_at: 'desc' },
      skip: (Math.max(1, page) - 1) * Math.min(100, limit),
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async getStaff(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user || !isStaffRole(user.role)) throw new GoException(GoErrorCode.NOT_FOUND, 'Staff user not found');
    return user;
  }

  async createStaff(
    actor: AuthUser,
    dto: { email: string; password: string; full_name: string; role: GoRole; phone?: string; branch_id?: string },
  ) {
    this.assertStaffRole(actor, dto.role);
    if (BRANCH_REQUIRED_ROLES.includes(dto.role) && !dto.branch_id) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id is required for this role');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new GoException(GoErrorCode.CONFLICT, 'Email already used');
    const user = await this.prisma.user.create({
      data: {
        email,
        password_hash: await bcrypt.hash(dto.password, 10),
        full_name: dto.full_name,
        role: dto.role,
        phone: dto.phone,
        branch_id: dto.branch_id,
      },
      select: USER_SELECT,
    });
    await this.audit.log({
      actor,
      action: 'staff.created',
      entity_type: 'user',
      entity_id: user.id,
      branch_id: user.branch_id,
      metadata: { role: user.role, email },
    });
    return user;
  }

  async updateStaff(
    actor: AuthUser,
    userId: string,
    dto: { full_name?: string; role?: GoRole; phone?: string | null; branch_id?: string | null; is_active?: boolean; password?: string },
  ) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current || !isStaffRole(current.role)) throw new GoException(GoErrorCode.NOT_FOUND, 'Staff user not found');
    if (dto.role) this.assertStaffRole(actor, dto.role);
    else this.assertStaffRole(actor, current.role);
    const nextRole = dto.role ?? current.role;
    const nextBranch = dto.branch_id === undefined ? current.branch_id : dto.branch_id;
    if (BRANCH_REQUIRED_ROLES.includes(nextRole) && !nextBranch) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id is required for this role');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        full_name: dto.full_name,
        role: dto.role,
        phone: dto.phone,
        branch_id: dto.branch_id,
        is_active: dto.is_active,
        password_hash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
      select: USER_SELECT,
    });
    if (dto.password || dto.is_active === false || dto.role) await this.sessions.revokeAllForUser(userId);
    await this.audit.log({
      actor,
      action: 'staff.updated',
      entity_type: 'user',
      entity_id: userId,
      metadata: { role: dto.role, is_active: dto.is_active, password_reset: !!dto.password },
    });
    return user;
  }

  async listSessions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !isStaffRole(user.role)) throw new GoException(GoErrorCode.NOT_FOUND, 'Staff user not found');
    return this.prisma.goUserSession.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        device_name: true,
        platform: true,
        ip: true,
        expires_at: true,
        revoked_at: true,
        last_used_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async revokeStaffSession(actor: AuthUser, userId: string, sessionId: string) {
    const session = await this.prisma.goUserSession.findFirst({ where: { id: sessionId, user_id: userId } });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Session not found');
    await this.sessions.revoke(sessionId);
    await this.audit.log({
      actor,
      action: 'staff.session_revoked',
      entity_type: 'go_user_session',
      entity_id: sessionId,
      metadata: { user_id: userId },
    });
    return { success: true };
  }

  private assertStaffRole(actor: AuthUser, role: GoRole) {
    if (!isStaffRole(role)) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Role must be a staff role');
    if (role === GoRole.SUPER_ADMIN && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Only a super admin can assign that role');
    }
  }

  private async touchLogin(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { last_login_at: new Date() },
      select: USER_SELECT,
    });
    return this.withRoleProfileFields(user);
  }

  async saveStaffAvatar(user: AuthUser, dataBase64: string) {
    if (!isDeskLoginRole(user.role)) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Staff avatar is for desk accounts only');
    }
    const key = await this.staffAvatars.save(user.id, dataBase64);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatar_key: key },
      select: USER_SELECT,
    });
    await this.audit.log({
      actor: user,
      action: 'staff.avatar_updated',
      entity_type: 'user',
      entity_id: user.id,
    });
    return this.withRoleProfileFields(updated);
  }

  async removeStaffAvatar(user: AuthUser) {
    if (!isDeskLoginRole(user.role)) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Staff avatar is for desk accounts only');
    }
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { avatar_key: true },
    });
    await this.staffAvatars.remove(current?.avatar_key);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatar_key: null },
      select: USER_SELECT,
    });
    await this.audit.log({
      actor: user,
      action: 'staff.avatar_removed',
      entity_type: 'user',
      entity_id: user.id,
    });
    return this.withRoleProfileFields(updated);
  }

  async readStaffAvatar(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar_key: true, role: true },
    });
    if (!row || !isDeskLoginRole(row.role)) {
      throw new GoException(GoErrorCode.NOT_FOUND, 'Avatar not found');
    }
    const data = row.avatar_key ? await this.staffAvatars.read(row.avatar_key) : null;
    if (!row.avatar_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Avatar not found');
    return { data, mime: this.staffAvatars.mimeOf(row.avatar_key) };
  }

  /** Role-specific profile fields merged into /auth/me (and login/refresh payloads). */
  private async withRoleProfileFields<
    T extends { id: string; role: GoRole; avatar_key?: string | null; updated_at?: Date },
  >(user: T) {
    if (user.role === GoRole.CUSTOMER) {
      const profile = await this.prisma.goCustomerProfile.findUnique({
        where: { user_id: user.id },
        include: { selected_city: { select: { id: true, name_ar: true, name_en: true, is_active: true } } },
      });
      return profile ? { ...user, ...customerPersonalFields(profile) } : user;
    }
    if (user.role === GoRole.DRIVER) {
      const profile = await this.prisma.goDriverProfile.findUnique({
        where: { user_id: user.id },
        select: { gender: true, avatar_key: true, updated_at: true, preferred_language: true },
      });
      if (!profile) return user;
      return { ...user, ...driverPersonalFields(profile, await driverRating(this.prisma, user.id)) };
    }
    if (isDeskLoginRole(user.role)) {
      const { avatar_key, updated_at, ...rest } = user;
      const version = updated_at instanceof Date ? updated_at.getTime() : Date.now();
      return {
        ...rest,
        avatar_url: avatar_key ? `/api/v1/go/auth/staff/avatar?v=${version}` : null,
      };
    }
    return user;
  }
}

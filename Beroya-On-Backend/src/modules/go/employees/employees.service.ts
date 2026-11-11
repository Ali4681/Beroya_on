import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { GoRole, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BRANCH_REQUIRED_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffAvatarStorage } from '../auth/staff-avatar.storage';
import type { CreateEmployeeDto, ListEmployeesQueryDto } from './dto/employees.dto';

const USER_SELECT = {
  id: true,
  email: true,
  full_name: true,
  role: true,
  phone: true,
  branch_id: true,
  is_active: true,
  avatar_key: true,
  updated_at: true,
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly staffAvatars: StaffAvatarStorage,
  ) {}

  async list(actor: AuthUser, q: ListEmployeesQueryDto) {
    const branchId = actor.branch_id && actor.role !== GoRole.SUPER_ADMIN && actor.role !== GoRole.ADMIN
      ? actor.branch_id
      : q.branch_id;
    const where: Prisma.GoEmployeeWhereInput = {
      ...(branchId ? { branch_id: branchId } : {}),
      ...(q.q?.trim()
        ? {
            OR: [
              { full_name_ar: { contains: q.q.trim(), mode: 'insensitive' } },
              { full_name_en: { contains: q.q.trim(), mode: 'insensitive' } },
              { phone: { contains: q.q.trim() } },
              { email: { contains: q.q.trim(), mode: 'insensitive' } },
              { contract_number: { contains: q.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.goEmployee.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { user: { select: USER_SELECT }, branch: { select: { id: true, name_ar: true, code: true } } },
      ...pageSkip(q.page, q.limit),
    });
    return rows.map((row) => this.presentEmployee(row));
  }

  async get(id: string) {
    const row = await this.prisma.goEmployee.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT }, branch: { select: { id: true, name_ar: true, code: true } } },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Employee not found');
    return this.presentEmployee(row);
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto) {
    if (dto.base_salary == null || Number.isNaN(Number(dto.base_salary)) || Number(dto.base_salary) < 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'base_salary is required');
    }

    const contractNumber = dto.contract_number?.trim() || (await this.nextContractNumber());
    const role = dto.login_role as GoRole;
    if (!(STAFF_ROLES as readonly string[]).includes(role)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid login_role');
    }
    if (!dto.login_password?.trim()) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'login_password is required');
    }
    if (dto.login_password.length < 8 || !/[A-Za-z]/.test(dto.login_password) || !/\d/.test(dto.login_password)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Password must be at least 8 characters with a letter and a number');
    }
    if (BRANCH_REQUIRED_ROLES.includes(role) && !dto.branch_id) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id is required for this role');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new GoException(GoErrorCode.CONFLICT, 'Email already used');
    let avatarKey: string | null = null;
    const user = await this.prisma.user.create({
      data: {
        email,
        password_hash: await bcrypt.hash(dto.login_password, 10),
        full_name: dto.full_name_ar?.trim() || dto.full_name_en?.trim() || email,
        role,
        phone: dto.phone?.trim() || null,
        branch_id: dto.branch_id || null,
      },
      select: USER_SELECT,
    });
    const userId = user.id;
    if (dto.avatar_base64?.trim()) {
      avatarKey = await this.staffAvatars.save(userId, dto.avatar_base64);
      await this.prisma.user.update({ where: { id: userId }, data: { avatar_key: avatarKey } });
    }

    const employee = await this.prisma.goEmployee.create({
      data: {
        user_id: userId,
        branch_id: dto.branch_id || null,
        full_name_ar: emptyToNull(dto.full_name_ar),
        full_name_en: emptyToNull(dto.full_name_en),
        phone: emptyToNull(dto.phone),
        email,
        date_of_birth: dateOrNull(dto.date_of_birth),
        gender: emptyToNull(dto.gender),
        marital_status: emptyToNull(dto.marital_status),
        national_id: emptyToNull(dto.national_id),
        nationality: emptyToNull(dto.nationality),
        blood_type: emptyToNull(dto.blood_type),
        allergies: emptyToNull(dto.allergies),
        address: emptyToNull(dto.address),
        emergency_contact: emptyToNull(dto.emergency_contact),
        emergency_phone: emptyToNull(dto.emergency_phone),
        contract_number: contractNumber,
        contract_type: emptyToNull(dto.contract_type) ?? 'PERMANENT',
        employment_status: emptyToNull(dto.employment_status) ?? 'ACTIVE',
        start_date: dateOrNull(dto.start_date),
        decision_date: dateOrNull(dto.decision_date),
        daily_hours: dto.daily_hours != null ? dto.daily_hours : null,
        work_days_per_week: dto.work_days_per_week ?? null,
        work_location: emptyToNull(dto.work_location),
        confidentiality_notes: emptyToNull(dto.confidentiality_notes),
        allowances_json: (dto.allowances ?? []) as Prisma.InputJsonValue,
        attachments_json: (dto.attachments ?? []) as Prisma.InputJsonValue,
        signatures_json: (dto.signatures ?? {}) as Prisma.InputJsonValue,
        base_salary: dto.base_salary,
        salary_currency: dto.salary_currency?.trim() || 'SYP',
        insurance_number: emptyToNull(dto.insurance_number),
        commissions_json: (dto.commissions ?? {}) as Prisma.InputJsonValue,
        custody_json: (dto.custody ?? []) as Prisma.InputJsonValue,
        specialization: emptyToNull(dto.specialization),
        university: emptyToNull(dto.university),
        graduation_year: dto.graduation_year ?? null,
        skills: emptyToNull(dto.skills),
        certificates_json: (dto.certificates ?? []) as Prisma.InputJsonValue,
        languages_json: (dto.languages ?? []) as Prisma.InputJsonValue,
        licenses_json: (dto.licenses ?? []) as Prisma.InputJsonValue,
        documents_json: (dto.documents ?? {}) as Prisma.InputJsonValue,
      },
      include: { user: { select: USER_SELECT }, branch: { select: { id: true, name_ar: true, code: true } } },
    });

    await this.audit.log({
      actor,
      action: 'employee.created',
      entity_type: 'go_employee',
      entity_id: employee.id,
      branch_id: employee.branch_id,
      metadata: {
        contract_number: employee.contract_number,
        base_salary: Number(employee.base_salary),
        user_id: userId ?? null,
        has_avatar: !!avatarKey,
      },
    });

    return this.presentEmployee(employee);
  }

  private presentEmployee<
    T extends {
      user: {
        id: string;
        avatar_key: string | null;
        updated_at: Date;
        email: string | null;
        full_name: string | null;
        role: GoRole;
        phone: string | null;
        branch_id: string | null;
        is_active: boolean;
      } | null;
    },
  >(row: T) {
    if (!row.user) return row;
    const { avatar_key, updated_at, ...userRest } = row.user;
    return {
      ...row,
      user: {
        ...userRest,
        avatar_url: avatar_key ? `/api/v1/go/auth/staff/avatar?v=${updated_at.getTime()}` : null,
      },
    };
  }

  private async nextContractNumber() {
    const year = new Date().getFullYear();
    const prefix = `EMP-${year}-`;
    const latest = await this.prisma.goEmployee.findFirst({
      where: { contract_number: { startsWith: prefix } },
      orderBy: { contract_number: 'desc' },
      select: { contract_number: true },
    });
    const last = latest?.contract_number?.slice(prefix.length) ?? '0';
    const next = String(Number.parseInt(last, 10) + 1 || 1).padStart(4, '0');
    return `${prefix}${next}`;
  }
}

function emptyToNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateOrNull(value?: string) {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

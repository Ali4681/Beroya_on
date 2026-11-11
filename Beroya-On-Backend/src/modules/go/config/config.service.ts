import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BRANDING_APPS,
  normalizeBrandingApp,
  type BrandingApp,
} from '../branding/branding.constants';
import {
  DEFAULT_EMPTY_SEARCH_RETRY_SECONDS,
  DEFAULT_MIN_SEARCH_SECONDS,
} from '../dispatch/min-search-window';
import { DEFAULT_DRIVER_OFFER_RADIUS_M } from '../dispatch/offer-radius';
import type { UpdateAppInfoDto } from './dto/app-info.dto';
import type { UpdateDispatchConfigDto } from './dto/dispatch-config.dto';

export const DEFAULT_RADIUS_STEPS = [500, 700, 800, 1000, 1200, 1300];

const DEFAULT_APP_INFO_FIELDS = {
  support_phone: '+963989901010',
  support_whatsapp: '+963989901010',
  support_email: 'support@beroyaon.com',
  terms_url: 'https://beroyaon.com/ar/terms',
  privacy_url: 'https://beroyaon.com/ar/privacy',
  about_ar: 'بيرويا — تطبيق نقل يوصلك بأمان في سوريا.',
  min_supported_version: '1.0.0',
  latest_version: '1.0.0',
} as const;

@Injectable()
export class GoConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  resolveApp(raw?: string | null): BrandingApp {
    try {
      return normalizeBrandingApp(raw);
    } catch {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'app must be customer or driver');
    }
  }

  async getDispatch() {
    return this.prisma.goDispatchConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        radius_steps_json: DEFAULT_RADIUS_STEPS,
        driver_offer_radius_m: DEFAULT_DRIVER_OFFER_RADIUS_M,
        min_search_seconds: DEFAULT_MIN_SEARCH_SECONDS,
        empty_search_retry_seconds: DEFAULT_EMPTY_SEARCH_RETRY_SECONDS,
      },
      update: {},
    });
  }

  /** Driver map circle + offer intake radius (same value dispatch uses — Option A). */
  async getDriverConfig() {
    const cfg = await this.getDispatch();
    return {
      driver_offer_radius_m: cfg.driver_offer_radius_m,
      updated_at: cfg.updated_at,
    };
  }

  async updateDispatch(user: AuthUser, dto: UpdateDispatchConfigDto) {
    await this.getDispatch();
    const updated = await this.prisma.goDispatchConfig.update({
      where: { id: 'default' },
      data: {
        ...dto,
        radius_steps_json: dto.radius_steps_json as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'dispatch_config.updated',
      entity_type: 'go_dispatch_config',
      entity_id: 'default',
      metadata: dto as Prisma.InputJsonValue,
    });
    return updated;
  }

  async ensureAppInfo(appRaw?: string | null) {
    const app = this.resolveApp(appRaw);
    return this.prisma.goAppInfo.upsert({
      where: { id: app },
      create: { id: app, ...DEFAULT_APP_INFO_FIELDS },
      update: {},
    });
  }

  /** Public Flutter payload (no id / timestamps). */
  async getAppInfoPublic(appRaw?: string | null) {
    const row = await this.ensureAppInfo(appRaw);
    return {
      app: row.id,
      support_phone: row.support_phone,
      support_whatsapp: row.support_whatsapp,
      support_email: row.support_email,
      terms_url: row.terms_url,
      privacy_url: row.privacy_url,
      about_ar: row.about_ar,
      min_supported_version: row.min_supported_version,
      latest_version: row.latest_version,
    };
  }

  async getAppInfoAdmin(appRaw?: string | null) {
    const row = await this.ensureAppInfo(appRaw);
    return { ...row, app: row.id, apps: [...BRANDING_APPS] };
  }

  async updateAppInfo(user: AuthUser, dto: UpdateAppInfoDto, appRaw?: string | null) {
    const app = this.resolveApp(appRaw ?? dto.app);
    await this.ensureAppInfo(app);
    const { app: _ignored, ...data } = dto;
    const updated = await this.prisma.goAppInfo.update({
      where: { id: app },
      data,
    });
    await this.audit.log({
      actor: user,
      action: 'app_info.updated',
      entity_type: 'go_app_info',
      entity_id: app,
      metadata: { app, ...(dto as object) } as Prisma.InputJsonValue,
    });
    return { ...updated, app: updated.id, apps: [...BRANDING_APPS] };
  }
}

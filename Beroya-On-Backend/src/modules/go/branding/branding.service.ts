import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decodeBrandingFile, sniff } from './branding-file';
import {
  AVAILABLE_APP_ICONS,
  ASSET_SLOTS,
  DEFAULT_BRANDING,
  HEX_COLOR,
  isAnimationType,
  isAppIconId,
  isAssetSlot,
  normalizeBrandingApp,
  type AssetSlot,
  type BrandingApp,
  type BrandingDocument,
} from './branding.constants';
import { BrandingStorageService } from './branding-storage.service';
import type { UpdateBrandingDraftDto, UploadBrandingAssetDto } from './dto/branding.dto';

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BrandingStorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  resolveApp(raw?: string | null): BrandingApp {
    try {
      return normalizeBrandingApp(raw);
    } catch {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'app must be customer or driver');
    }
  }

  async getPublic(appRaw?: string | null) {
    const app = this.resolveApp(appRaw);
    const row = await this.ensureRow(app);
    return this.present(app, this.parse(row.published_json), row.version, 'published');
  }

  async getAdmin(appRaw?: string | null) {
    const app = this.resolveApp(appRaw);
    const row = await this.ensureRow(app);
    const published = this.parse(row.published_json);
    const draft = this.parse(row.draft_json);
    return {
      app,
      version: row.version,
      updated_at: row.updated_at,
      unpublished_changes: JSON.stringify(published) !== JSON.stringify(draft),
      available_icons: AVAILABLE_APP_ICONS,
      published: this.present(app, published, row.version, 'published'),
      draft: this.present(app, draft, row.version, 'draft'),
    };
  }

  async updateDraft(user: AuthUser, dto: UpdateBrandingDraftDto, appRaw?: string | null) {
    const app = this.resolveApp(appRaw ?? dto.app);
    const row = await this.ensureRow(app);
    const draft = this.parse(row.draft_json);
    if (dto.primary_color) draft.colors.primary = dto.primary_color.toUpperCase();
    if (dto.secondary_color) draft.colors.secondary = dto.secondary_color.toUpperCase();
    if (dto.background_color) draft.colors.background = dto.background_color.toUpperCase();
    if (dto.splash_animation_type && isAnimationType(dto.splash_animation_type)) {
      draft.splash.animation_type = dto.splash_animation_type;
    }
    if (dto.splash_duration_ms != null) draft.splash.duration_ms = dto.splash_duration_ms;
    if (dto.splash_animation_enabled != null) draft.splash.animation_enabled = dto.splash_animation_enabled;
    if (dto.selected_android_icon && isAppIconId(dto.selected_android_icon)) {
      draft.app_icon.android = dto.selected_android_icon;
    }
    if (dto.selected_ios_icon && isAppIconId(dto.selected_ios_icon)) {
      draft.app_icon.ios = dto.selected_ios_icon;
    }
    if (dto.clear_slot && isAssetSlot(dto.clear_slot)) {
      const previous = draft.slots[dto.clear_slot];
      delete draft.slots[dto.clear_slot];
      if (previous) await this.storage.remove(app, 'draft', previous);
    }
    await this.prisma.goAppBranding.update({
      where: { id: app },
      data: { draft_json: draft as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({
      actor: user,
      action: 'app_branding.draft_updated',
      entity_type: 'go_app_branding',
      entity_id: app,
      metadata: { app, ...(dto as object) } as Prisma.InputJsonValue,
    });
    return this.getAdmin(app);
  }

  async uploadDraft(user: AuthUser, dto: UploadBrandingAssetDto, appRaw?: string | null) {
    const app = this.resolveApp(appRaw ?? dto.app);
    if (!isAssetSlot(dto.slot)) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Unknown branding slot');
    const decoded = decodeBrandingFile(dto.data_base64, dto.filename);
    const filename = this.storage.filenameFor(dto.slot, decoded.ext);
    const row = await this.ensureRow(app);
    const draft = this.parse(row.draft_json);
    const previous = draft.slots[dto.slot];
    if (previous && previous !== filename) await this.storage.remove(app, 'draft', previous);
    await this.storage.write(app, 'draft', filename, decoded.buffer);
    draft.slots[dto.slot] = filename;
    await this.prisma.goAppBranding.update({
      where: { id: app },
      data: { draft_json: draft as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({
      actor: user,
      action: 'app_branding.asset_uploaded',
      entity_type: 'go_app_branding',
      entity_id: app,
      metadata: { app, slot: dto.slot, kind: decoded.kind },
    });
    return this.getAdmin(app);
  }

  async publish(user: AuthUser, appRaw?: string | null) {
    const app = this.resolveApp(appRaw);
    const row = await this.ensureRow(app);
    const draft = this.parse(row.draft_json);
    const published = this.parse(row.published_json);
    for (const slot of ASSET_SLOTS) {
      const next = draft.slots[slot];
      const prev = published.slots[slot];
      if (next) await this.storage.promoteDraftFile(app, next);
      else if (prev) await this.storage.remove(app, 'published', prev);
    }
    const nextVersion = row.version + 1;
    await this.prisma.goAppBranding.update({
      where: { id: app },
      data: {
        version: nextVersion,
        published_json: draft as unknown as Prisma.InputJsonValue,
        draft_json: draft as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'app_branding.published',
      entity_type: 'go_app_branding',
      entity_id: app,
      metadata: { app, version: nextVersion },
    });
    return this.getAdmin(app);
  }

  async readAsset(slot: string, layer: 'draft' | 'published', appRaw?: string | null) {
    const app = this.resolveApp(appRaw);
    if (!isAssetSlot(slot)) throw new GoException(GoErrorCode.NOT_FOUND, 'Unknown branding slot');
    const row = await this.ensureRow(app);
    const doc = this.parse(layer === 'draft' ? row.draft_json : row.published_json);
    const filename = doc.slots[slot];
    if (!filename) throw new GoException(GoErrorCode.NOT_FOUND, 'Asset not set');
    const buffer = await this.storage.read(app, layer, filename);
    if (!buffer) throw new GoException(GoErrorCode.NOT_FOUND, 'Asset file missing');
    const kind = sniff(buffer);
    return {
      buffer,
      mime: kind === 'lottie' ? 'application/json' : kind ? `image/${kind === 'jpeg' ? 'jpeg' : kind}` : 'application/octet-stream',
      version: row.version,
      app,
    };
  }

  private async ensureRow(app: BrandingApp) {
    return this.prisma.goAppBranding.upsert({
      where: { id: app },
      create: {
        id: app,
        version: 1,
        published_json: DEFAULT_BRANDING as unknown as Prisma.InputJsonValue,
        draft_json: DEFAULT_BRANDING as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  private parse(raw: Prisma.JsonValue): BrandingDocument {
    const fallback = structuredClone(DEFAULT_BRANDING);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
    const obj = raw as Record<string, unknown>;
    const colors = obj.colors && typeof obj.colors === 'object' ? (obj.colors as Record<string, unknown>) : {};
    const splash = obj.splash && typeof obj.splash === 'object' ? (obj.splash as Record<string, unknown>) : {};
    const icon = obj.app_icon && typeof obj.app_icon === 'object' ? (obj.app_icon as Record<string, unknown>) : {};
    const slotsRaw = obj.slots && typeof obj.slots === 'object' && !Array.isArray(obj.slots) ? (obj.slots as Record<string, unknown>) : {};
    const slots: BrandingDocument['slots'] = {};
    for (const slot of ASSET_SLOTS) {
      const value = slotsRaw[slot];
      if (typeof value === 'string' && value && !value.includes('..') && !value.includes('/') && !value.includes('\\')) {
        slots[slot] = value;
      }
    }
    return {
      colors: {
        primary: hexOr(colors.primary, fallback.colors.primary),
        secondary: hexOr(colors.secondary, fallback.colors.secondary),
        background: hexOr(colors.background, fallback.colors.background),
      },
      splash: {
        animation_type: isAnimationType(String(splash.animation_type ?? ''))
          ? (splash.animation_type as BrandingDocument['splash']['animation_type'])
          : fallback.splash.animation_type,
        duration_ms: Number.isFinite(Number(splash.duration_ms))
          ? Math.min(15000, Math.max(500, Number(splash.duration_ms)))
          : fallback.splash.duration_ms,
        animation_enabled: Boolean(splash.animation_enabled),
      },
      app_icon: {
        android: isAppIconId(String(icon.android ?? ''))
          ? (icon.android as BrandingDocument['app_icon']['android'])
          : fallback.app_icon.android,
        ios: isAppIconId(String(icon.ios ?? ''))
          ? (icon.ios as BrandingDocument['app_icon']['ios'])
          : fallback.app_icon.ios,
      },
      slots,
    };
  }

  private present(app: BrandingApp, doc: BrandingDocument, version: number, layer: 'draft' | 'published') {
    const url = (slot: AssetSlot) => (doc.slots[slot] ? this.assetUrl(app, slot, version, layer) : null);
    return {
      app,
      version,
      logo_url: url('logo'),
      login_top_url: url('login_top'),
      home_top_url: url('home_top'),
      account_top_url: url('account_top'),
      colors: doc.colors,
      splash: {
        image_url: url('splash_image'),
        animation_url: url('splash_animation'),
        animation_type: doc.splash.animation_type,
        duration_ms: doc.splash.duration_ms,
        animation_enabled: doc.splash.animation_enabled,
      },
      animations: {
        loading_url: url('loading'),
        home_url: url('home'),
        success_url: url('success'),
        error_url: url('error'),
        empty_url: url('empty'),
      },
      app_icon: doc.app_icon,
      available_icons: AVAILABLE_APP_ICONS,
    };
  }

  private assetUrl(app: BrandingApp, slot: AssetSlot, version: number, layer: 'draft' | 'published') {
    const cfg = this.config.getOrThrow<AppConfig>('app');
    // Always relative: APP_PUBLIC_URL is the marketing/tracking website, not the API origin.
    // Flutter resolves these against the API base (see FLUTTER_BRANDING.md).
    const prefix = `/${cfg.apiPrefix}`;
    if (layer === 'published') return `${prefix}/app/branding/assets/${slot}?app=${app}&v=${version}`;
    return `${prefix}/admin/config/branding/assets/${slot}?app=${app}&layer=draft&v=${version}`;
  }
}

function hexOr(value: unknown, fallback: string) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

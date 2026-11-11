/** Mobile app identity — same axis as OTP `app` (normalized lowercase). */
export const BRANDING_APPS = ['customer', 'driver'] as const;
export type BrandingApp = (typeof BRANDING_APPS)[number];

export const ASSET_SLOTS = [
  'logo',
  'login_top',
  'home_top',
  'account_top',
  'splash_image',
  'splash_animation',
  'loading',
  'home',
  'success',
  'error',
  'empty',
] as const;

export type AssetSlot = (typeof ASSET_SLOTS)[number];

export const ANIMATION_TYPES = ['none', 'image', 'gif', 'lottie'] as const;
export type AnimationType = (typeof ANIMATION_TYPES)[number];

export const APP_ICON_COUNT = 20;

export const APP_ICON_IDS = Array.from(
  { length: APP_ICON_COUNT },
  (_, index) => `icon_${String(index + 1).padStart(2, '0')}`,
) as readonly string[];

export type AppIconId = (typeof APP_ICON_IDS)[number];

export const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_GIF_BYTES = 5 * 1024 * 1024;
export const MAX_LOTTIE_BYTES = 2 * 1024 * 1024;

export const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'dll',
  'apk',
  'aab',
  'ipa',
  'php',
  'js',
  'html',
  'htm',
  'bat',
  'cmd',
  'sh',
  'msi',
]);

const ICON_PREVIEW_COLORS = [
  '#313193',
  '#25C5D1',
  '#E85D04',
  '#2D6A4F',
  '#9B2226',
  '#7B2CBF',
  '#0077B6',
  '#F4A261',
  '#40916C',
  '#D62828',
  '#3A0CA3',
  '#00A896',
  '#E63946',
  '#1D3557',
  '#B56576',
  '#6A994E',
  '#BC6C25',
  '#4C1D95',
  '#0A9396',
  '#9A031E',
] as const;

export const AVAILABLE_APP_ICONS = APP_ICON_IDS.map((id, index) => ({
  id,
  name: `Icon ${String(index + 1).padStart(2, '0')}`,
  android: true,
  ios: true,
  preview_color: ICON_PREVIEW_COLORS[index],
}));

export type BrandingColors = {
  primary: string;
  secondary: string;
  background: string;
};

export type BrandingSplashConfig = {
  animation_type: AnimationType;
  duration_ms: number;
  animation_enabled: boolean;
};

export type BrandingAppIcon = {
  android: AppIconId;
  ios: AppIconId;
};

export type BrandingDocument = {
  colors: BrandingColors;
  splash: BrandingSplashConfig;
  app_icon: BrandingAppIcon;
  slots: Partial<Record<AssetSlot, string>>;
};

export const DEFAULT_BRANDING: BrandingDocument = {
  colors: {
    primary: '#313193',
    secondary: '#25C5D1',
    background: '#FFFFFF',
  },
  splash: {
    animation_type: 'none',
    duration_ms: 2500,
    animation_enabled: false,
  },
  app_icon: {
    android: 'icon_01',
    ios: 'icon_01',
  },
  slots: {},
};

export function isBrandingApp(value: string): value is BrandingApp {
  return (BRANDING_APPS as readonly string[]).includes(value);
}

/** Accepts customer|driver or CUSTOMER|DRIVER; defaults to customer when empty. */
export function normalizeBrandingApp(value?: string | null): BrandingApp {
  const raw = (value ?? 'customer').trim().toLowerCase();
  if (isBrandingApp(raw)) return raw;
  throw new Error(`Invalid branding app: ${value}`);
}

export function isAssetSlot(value: string): value is AssetSlot {
  return (ASSET_SLOTS as readonly string[]).includes(value);
}

export function isAppIconId(value: string): value is AppIconId {
  return (APP_ICON_IDS as readonly string[]).includes(value);
}

export function isAnimationType(value: string): value is AnimationType {
  return (ANIMATION_TYPES as readonly string[]).includes(value);
}

export type ReportLang = 'ar' | 'en';

export function resolveReportLang(value?: string): ReportLang {
  return value === 'en' ? 'en' : 'ar';
}

type Dict = {
  brand: string;
  overviewTitle: string;
  driversTitle: string;
  generatedAt: string;
  windowFrom: string;
  windowTo: string;
  timezone: string;
  branch: string;
  allBranches: string;
  section: string;
  metric: string;
  value: string;
  overviewSection: string;
  cancellationsSection: string;
  assignmentSection: string;
  acceptanceSection: string;
  coverageSection: string;
  alertsSection: string;
  seriesSection: string;
  requests: string;
  completed: string;
  cancelled: string;
  cancelledByCustomer: string;
  cancelledByDriver: string;
  cancelledByStaff: string;
  unserved: string;
  cancellationRate: string;
  completionRate: string;
  finished: string;
  avgAssignment: string;
  p50Assignment: string;
  p90Assignment: string;
  assignmentSamples: string;
  accepted: string;
  declined: string;
  expired: string;
  acceptanceRate: string;
  coverageAlerts: string;
  coverageOpenNow: string;
  onlineHours: string;
  onlineSessions: string;
  alertType: string;
  alertSeverity: string;
  alertCount: string;
  bucket: string;
  seriesRequests: string;
  seriesCompleted: string;
  seriesCancelled: string;
  rank: string;
  driverId: string;
  fullName: string;
  phone: string;
  driverCompleted: string;
  driverCancelled: string;
  driverAccepted: string;
  driverDeclined: string;
  driverExpired: string;
  acceptRate: string;
  avgStars: string;
  ratingCount: string;
  filenameOverview: string;
  filenameDrivers: string;
  alertTypes: Record<string, string>;
  severities: Record<string, string>;
};

const AR: Dict = {
  brand: 'بيرويا أون',
  overviewTitle: 'التقرير التشغيلي — نظرة عامة',
  driversTitle: 'التقرير التشغيلي — أداء السائقين',
  generatedAt: 'تاريخ التوليد',
  windowFrom: 'من',
  windowTo: 'إلى',
  timezone: 'المنطقة الزمنية',
  branch: 'الفرع',
  allBranches: 'كل الفروع',
  section: 'القسم',
  metric: 'المؤشر',
  value: 'القيمة',
  overviewSection: 'ملخص الفترة',
  cancellationsSection: 'الإلغاءات',
  assignmentSection: 'وقت التعيين (ثوانٍ)',
  acceptanceSection: 'نتائج العروض',
  coverageSection: 'التغطية والجاهزية',
  alertsSection: 'تنبيهات النافذة',
  seriesSection: 'السلسلة الزمنية',
  requests: 'الطلبات',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
  cancelledByCustomer: 'إلغاء عميل',
  cancelledByDriver: 'إلغاء سائق',
  cancelledByStaff: 'إلغاء موظف',
  unserved: 'بدون سائق',
  cancellationRate: 'نسبة الإلغاء %',
  completionRate: 'نسبة الإكمال %',
  finished: 'منتهية (مكتملة + ملغاة)',
  avgAssignment: 'متوسط التعيين (ث)',
  p50Assignment: 'الوسيط p50 (ث)',
  p90Assignment: 'p90 (ث)',
  assignmentSamples: 'عينات التعيين',
  accepted: 'عروض مقبولة',
  declined: 'عروض مرفوضة',
  expired: 'عروض منتهية',
  acceptanceRate: 'نسبة قبول العروض %',
  coverageAlerts: 'تنبيهات نقص التغطية',
  coverageOpenNow: 'تنبيهات مفتوحة الآن',
  onlineHours: 'ساعات أونلاين',
  onlineSessions: 'جلسات الاتصال',
  alertType: 'نوع التنبيه',
  alertSeverity: 'الشدة',
  alertCount: 'العدد',
  bucket: 'الفترة',
  seriesRequests: 'طلبات',
  seriesCompleted: 'مكتملة',
  seriesCancelled: 'ملغاة',
  rank: 'الترتيب',
  driverId: 'معرّف السائق',
  fullName: 'الاسم',
  phone: 'الهاتف',
  driverCompleted: 'رحلات مكتملة',
  driverCancelled: 'إلغاءات السائق',
  driverAccepted: 'عروض مقبولة',
  driverDeclined: 'عروض مرفوضة',
  driverExpired: 'عروض منتهية',
  acceptRate: 'نسبة القبول %',
  avgStars: 'متوسط التقييم',
  ratingCount: 'عدد التقييمات',
  filenameOverview: 'بيرويا-تقرير-تشغيلي',
  filenameDrivers: 'بيرويا-أداء-السائقين',
  alertTypes: {
    DRIVER_COVERAGE_LOW: 'نقص تغطية السائقين',
    ASSIGNMENT_DELAYED: 'تأخر إسناد سائق',
    CANCELLATION_RATE_HIGH: 'ارتفاع نسبة الإلغاء',
  },
  severities: {
    CRITICAL: 'حرج',
    WARNING: 'تحذير',
    INFO: 'معلومة',
    WATCH: 'مراقبة',
  },
};

const EN: Dict = {
  brand: 'Beroya On',
  overviewTitle: 'Operational report — Overview',
  driversTitle: 'Operational report — Driver performance',
  generatedAt: 'Generated at',
  windowFrom: 'From',
  windowTo: 'To',
  timezone: 'Timezone',
  branch: 'Branch',
  allBranches: 'All branches',
  section: 'Section',
  metric: 'Metric',
  value: 'Value',
  overviewSection: 'Period summary',
  cancellationsSection: 'Cancellations',
  assignmentSection: 'Assignment time (seconds)',
  acceptanceSection: 'Offer outcomes',
  coverageSection: 'Coverage & readiness',
  alertsSection: 'Alerts in window',
  seriesSection: 'Time series',
  requests: 'Requests',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelledByCustomer: 'Cancelled by customer',
  cancelledByDriver: 'Cancelled by driver',
  cancelledByStaff: 'Cancelled by staff',
  unserved: 'Unserved (no driver)',
  cancellationRate: 'Cancellation rate %',
  completionRate: 'Completion rate %',
  finished: 'Finished (completed + cancelled)',
  avgAssignment: 'Avg assignment (sec)',
  p50Assignment: 'Median p50 (sec)',
  p90Assignment: 'p90 (sec)',
  assignmentSamples: 'Assignment samples',
  accepted: 'Offers accepted',
  declined: 'Offers declined',
  expired: 'Offers expired',
  acceptanceRate: 'Offer accept rate %',
  coverageAlerts: 'Coverage shortage alerts',
  coverageOpenNow: 'Alerts open now',
  onlineHours: 'Online hours',
  onlineSessions: 'Online sessions',
  alertType: 'Alert type',
  alertSeverity: 'Severity',
  alertCount: 'Count',
  bucket: 'Bucket',
  seriesRequests: 'Requests',
  seriesCompleted: 'Completed',
  seriesCancelled: 'Cancelled',
  rank: 'Rank',
  driverId: 'Driver ID',
  fullName: 'Full name',
  phone: 'Phone',
  driverCompleted: 'Completed rides',
  driverCancelled: 'Driver cancellations',
  driverAccepted: 'Offers accepted',
  driverDeclined: 'Offers declined',
  driverExpired: 'Offers expired',
  acceptRate: 'Accept rate %',
  avgStars: 'Avg rating',
  ratingCount: 'Ratings count',
  filenameOverview: 'beroya-ops-overview',
  filenameDrivers: 'beroya-driver-performance',
  alertTypes: {
    DRIVER_COVERAGE_LOW: 'Low driver coverage',
    ASSIGNMENT_DELAYED: 'Driver assignment delayed',
    CANCELLATION_RATE_HIGH: 'High cancellation rate',
  },
  severities: {
    CRITICAL: 'Critical',
    WARNING: 'Warning',
    INFO: 'Info',
    WATCH: 'Watch',
  },
};

export function reportCopy(lang: ReportLang): Dict {
  return lang === 'en' ? EN : AR;
}

/** Semicolon works reliably with Arabic/European Excel list-separator settings. */
const CSV_SEP = ';';

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  const text = value;
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(CSV_SEP);
}

/** Blank spacer row between sections. */
export function csvBlank(): string {
  return '';
}

/** Section banner on its own row so Excel readers see a clear break. */
export function csvSection(title: string): string {
  return csvRow([title]);
}

export function csvPair(label: string, value: string | number | null | undefined): string {
  return csvRow([label, value]);
}

/** Excel tip line: forces the delimiter regardless of Windows regional settings. */
export function csvExcelSepHint(): string {
  return `sep=${CSV_SEP}`;
}

function intlTag(lang: ReportLang) {
  return lang === 'en' ? 'en-US' : 'ar-SY-u-nu-latn';
}

export function formatExportDate(iso: string, lang: ReportLang) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlTag(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatExportDay(iso: string, lang: ReportLang) {
  const date = new Date(iso.includes('T') ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlTag(lang), { dateStyle: 'medium' }).format(date);
}

/**
 * Series buckets from SQL look like `2026-10-30T21:00` (local wall time, no zone).
 * Format without timezone shifting so Excel shows a readable day/hour.
 */
export function formatExportBucket(bucket: string, lang: ReportLang, withTime = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(bucket.trim());
  if (!match) return formatExportDay(bucket, lang);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 0;
  const minute = match[5] != null ? Number(match[5]) : 0;
  if (!year || !month || !day) return bucket;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (Number.isNaN(date.getTime())) return bucket;
  if (!withTime) {
    return new Intl.DateTimeFormat(intlTag(lang), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
  return new Intl.DateTimeFormat(intlTag(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

export function asciiFilename(stem: string, fromIso: string, toIso: string) {
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  return `${stem}-${from}_${to}.csv`;
}

export function localizedFilename(stem: string, fromIso: string, toIso: string) {
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  return `${stem}-${from}_${to}.csv`;
}

export function contentDisposition(asciiName: string, utf8Name: string) {
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

export function alertLabel(lang: ReportLang, type: string) {
  return reportCopy(lang).alertTypes[type] ?? type.replaceAll('_', ' ');
}

export function severityLabel(lang: ReportLang, severity: string) {
  return reportCopy(lang).severities[severity] ?? severity;
}

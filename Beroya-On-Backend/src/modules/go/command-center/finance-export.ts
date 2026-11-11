import {
  asciiFilename,
  contentDisposition,
  csvBlank,
  csvExcelSepHint,
  csvPair,
  csvRow,
  csvSection,
  formatExportBucket,
  formatExportDate,
  localizedFilename,
  resolveReportLang,
  type ReportLang,
} from '../reports/reports-export';

type FinanceDict = {
  brand: string;
  title: string;
  generatedAt: string;
  windowFrom: string;
  windowTo: string;
  timezone: string;
  branch: string;
  allBranches: string;
  metric: string;
  value: string;
  marketplace: string;
  revenue: string;
  costs: string;
  result: string;
  completedRides: string;
  grossFares: string;
  discounts: string;
  customerPayable: string;
  netCommission: string;
  commissionCollected: string;
  commissionReversed: string;
  penalties: string;
  revenueTotal: string;
  incentives: string;
  beroyaComp: string;
  costsTotal: string;
  contribution: string;
  takeRate: string;
  seriesSection: string;
  bucket: string;
  seriesGross: string;
  seriesCommission: string;
  seriesPenalties: string;
  seriesIncentives: string;
  topDrivers: string;
  rank: string;
  driver: string;
  phone: string;
  commission: string;
  txCount: string;
  filename: string;
};

const AR: FinanceDict = {
  brand: 'بيرويا أون',
  title: 'الأداء المالي',
  generatedAt: 'تاريخ التوليد',
  windowFrom: 'من',
  windowTo: 'إلى',
  timezone: 'المنطقة الزمنية',
  branch: 'الفرع',
  allBranches: 'كل الفروع',
  metric: 'المؤشر',
  value: 'القيمة',
  marketplace: 'حجم السوق',
  revenue: 'إيراد الشركة',
  costs: 'تكاليف الشركة',
  result: 'النتيجة',
  completedRides: 'رحلات مكتملة',
  grossFares: 'إجمالي الأجور (ليس إيراداً)',
  discounts: 'خصومات',
  customerPayable: 'ما دفعه الزبائن',
  netCommission: 'صافي العمولة',
  commissionCollected: 'عمولة محصّلة',
  commissionReversed: 'عمولة مُعادة',
  penalties: 'غرامات إلغاء السائقين',
  revenueTotal: 'إجمالي إيراد الشركة',
  incentives: 'حوافز مدفوعة',
  beroyaComp: 'تعويضات تتحملها الشركة',
  costsTotal: 'إجمالي التكاليف',
  contribution: 'صافي المساهمة',
  takeRate: 'نسبة العمولة من الأجور %',
  seriesSection: 'السلسلة الزمنية',
  bucket: 'الفترة',
  seriesGross: 'أجور',
  seriesCommission: 'عمولة',
  seriesPenalties: 'غرامات',
  seriesIncentives: 'حوافز',
  topDrivers: 'أعلى مساهمة بالعمولة',
  rank: 'الترتيب',
  driver: 'السائق',
  phone: 'الهاتف',
  commission: 'العمولة',
  txCount: 'عمليات',
  filename: 'بيرويا-أداء-مالي',
};

const EN: FinanceDict = {
  brand: 'Beroya On',
  title: 'Financial performance',
  generatedAt: 'Generated at',
  windowFrom: 'From',
  windowTo: 'To',
  timezone: 'Timezone',
  branch: 'Branch',
  allBranches: 'All branches',
  metric: 'Metric',
  value: 'Value',
  marketplace: 'Marketplace volume',
  revenue: 'Company revenue',
  costs: 'Company costs',
  result: 'Result',
  completedRides: 'Completed rides',
  grossFares: 'Gross fares (not company revenue)',
  discounts: 'Discounts',
  customerPayable: 'Customer payable',
  netCommission: 'Net commission',
  commissionCollected: 'Commission collected',
  commissionReversed: 'Commission reversed',
  penalties: 'Driver cancel penalties',
  revenueTotal: 'Total company revenue',
  incentives: 'Incentives paid',
  beroyaComp: 'Compensation borne by company',
  costsTotal: 'Total costs',
  contribution: 'Contribution margin',
  takeRate: 'Commission take rate %',
  seriesSection: 'Time series',
  bucket: 'Bucket',
  seriesGross: 'Gross fares',
  seriesCommission: 'Commission',
  seriesPenalties: 'Penalties',
  seriesIncentives: 'Incentives',
  topDrivers: 'Top commission contributors',
  rank: 'Rank',
  driver: 'Driver',
  phone: 'Phone',
  commission: 'Commission',
  txCount: 'Transactions',
  filename: 'beroya-finance-performance',
};

function copy(lang: ReportLang) {
  return lang === 'en' ? EN : AR;
}

export type FinanceExportPayload = {
  generated_at: string;
  timezone: string;
  branch_id: string | null;
  window: { from: string; to: string };
  ride_fares: {
    completed_rides: number;
    gross_fares: number;
    discounts: number;
    customer_payable: number;
  };
  company_revenue: {
    commission_collected: number;
    commission_reversed: number;
    net_commission: number;
    driver_cancel_penalties: number;
    total: number;
  };
  company_costs: {
    incentives_paid: number;
    compensation_borne_by_beroya: number;
    total: number;
  };
  result: { contribution: number; take_rate_pct: number | null };
  series: {
    points: {
      bucket: string;
      gross_fares: number;
      commission: number;
      penalties: number;
      incentives: number;
    }[];
  };
  top_commission_drivers: {
    full_name: string | null;
    phone: string | null;
    commission: number;
    tx_count: number;
  }[];
};

export function buildFinanceCsv(data: FinanceExportPayload, langRaw?: string) {
  const lang = resolveReportLang(langRaw);
  const L = copy(lang);
  const lines: string[] = [
    csvExcelSepHint(),
    csvSection(L.brand),
    csvSection(L.title),
    csvBlank(),
    csvPair(L.generatedAt, formatExportDate(data.generated_at, lang)),
    csvPair(L.windowFrom, formatExportDate(data.window.from, lang)),
    csvPair(L.windowTo, formatExportDate(data.window.to, lang)),
    csvPair(L.timezone, data.timezone),
    csvPair(L.branch, data.branch_id ?? L.allBranches),
    csvBlank(),
    csvSection(L.marketplace),
    csvRow([L.metric, L.value]),
    csvPair(L.completedRides, data.ride_fares.completed_rides),
    csvPair(L.grossFares, data.ride_fares.gross_fares),
    csvPair(L.discounts, data.ride_fares.discounts),
    csvPair(L.customerPayable, data.ride_fares.customer_payable),
    csvBlank(),
    csvSection(L.revenue),
    csvRow([L.metric, L.value]),
    csvPair(L.netCommission, data.company_revenue.net_commission),
    csvPair(L.commissionCollected, data.company_revenue.commission_collected),
    csvPair(L.commissionReversed, data.company_revenue.commission_reversed),
    csvPair(L.penalties, data.company_revenue.driver_cancel_penalties),
    csvPair(L.revenueTotal, data.company_revenue.total),
    csvBlank(),
    csvSection(L.costs),
    csvRow([L.metric, L.value]),
    csvPair(L.incentives, data.company_costs.incentives_paid),
    csvPair(L.beroyaComp, data.company_costs.compensation_borne_by_beroya),
    csvPair(L.costsTotal, data.company_costs.total),
    csvBlank(),
    csvSection(L.result),
    csvRow([L.metric, L.value]),
    csvPair(L.contribution, data.result.contribution),
    csvPair(L.takeRate, data.result.take_rate_pct),
  ];

  if (data.series.points.length > 0) {
    const withTime = data.series.points.some((p) => /T(?!00:00)\d{2}:\d{2}/.test(p.bucket));
    lines.push(
      csvBlank(),
      csvSection(L.seriesSection),
      csvRow([L.bucket, L.seriesGross, L.seriesCommission, L.seriesPenalties, L.seriesIncentives]),
      ...data.series.points.map((p) =>
        csvRow([
          formatExportBucket(p.bucket, lang, withTime),
          p.gross_fares,
          p.commission,
          p.penalties,
          p.incentives,
        ]),
      ),
    );
  }

  if (data.top_commission_drivers.length > 0) {
    lines.push(
      csvBlank(),
      csvSection(L.topDrivers),
      csvRow([L.rank, L.driver, L.phone, L.commission, L.txCount]),
      ...data.top_commission_drivers.map((row, index) =>
        csvRow([index + 1, row.full_name, row.phone, row.commission, row.tx_count]),
      ),
    );
  }

  const ascii = asciiFilename('beroya-finance-performance', data.window.from, data.window.to);
  const utf8 = localizedFilename(L.filename, data.window.from, data.window.to);
  return {
    disposition: contentDisposition(ascii, utf8),
    body: `\uFEFF${lines.join('\r\n')}`,
  };
}

"use client";

import { t } from "@/features/desk/i18n/t";
import { useRequireHome } from "@/features/desk/shell";

export function HomeRedirect() {
  useRequireHome();
  return <p className="text-sm text-muted">{t("جارٍ فتح الشاشة المناسبة لدورك…")}</p>;
}

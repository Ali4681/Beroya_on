import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, isLocale, localeCookie, locales, type Locale } from "@/core/i18n/config";

function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) {
    return null;
  }

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { base: tag.toLowerCase().split("-")[0], weight: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((entry) => entry.base && Number.isFinite(entry.weight))
    .sort((a, b) => b.weight - a.weight);

  for (const entry of ranked) {
    if (isLocale(entry.base)) {
      return entry.base;
    }
  }

  return null;
}

const STAFF_ROLES = new Set([
  "CUSTOMER_SERVICE",
  "CUSTOMER_SERVICE_SUPERVISOR",
  "OPERATIONS",
  "WALLET_OPERATOR",
  "FINANCE",
  "ADMIN",
  "SUPER_ADMIN",
  "STORE_OPERATOR",
]);

function isDeskPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/erp" ||
    pathname.startsWith("/erp/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

function isPublicTrackPath(pathname: string) {
  return pathname === "/t" || pathname.startsWith("/t/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public ride tracking uses /t/:token?lang= — do not force /{locale} prefix.
  if (isPublicTrackPath(pathname)) {
    return;
  }

  if (isDeskPath(pathname)) {
    if (pathname === "/login" || pathname.startsWith("/login/")) {
      return;
    }

    const role = request.cookies.get("beroya_staff_role")?.value;
    if (!role || !STAFF_ROLES.has(role)) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      const back = `${pathname}${request.nextUrl.search}`;
      login.search = `?next=${encodeURIComponent(back)}`;
      return NextResponse.redirect(login);
    }

    return;
  }

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (hasLocale) {
    return;
  }

  const saved = request.cookies.get(localeCookie)?.value;
  const locale =
    (saved && isLocale(saved) ? saved : null) ??
    fromAcceptLanguage(request.headers.get("accept-language")) ??
    defaultLocale;

  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

import { Suspense } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Bell, CalendarDays, Info } from "lucide-react";
import { signOut } from "@/app/actions";
import { fmtDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { recentNoticeCount } from "@/lib/services/notifications";
import { homeFor, type SessionUser } from "@/lib/session";
import { BrandMark, GovFooter, GovFrame, GovTopBar, PageBand, type NavKey } from "./gov-chrome";
import { PortalNav, UserMenu, type NavItem } from "./portal-nav";

export const ROLE_LABEL: Record<Role, string> = {
  INSTITUTION: "Institution",
  BANK: "Bank",
  RO: "Regional Office",
  BUREAU: "Regulation Bureau",
  CELL: "Cell reviewer",
  AUTHORITY: "Competent Authority",
  ADMIN: "Admin",
};

const OFFICER: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/officer", label: "Verification queue", icon: "inbox" },
  { href: "/registry", label: "FDR registry", icon: "registry" },
  { href: "/officer?view=all&type=RELEASE", label: "Release cases", icon: "release" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/audit", label: "Audit trail", icon: "audit" },
  { href: "/verify", label: "Verify a NOC", icon: "verify" },
];

export const NAV: Record<Role, NavItem[]> = {
  INSTITUTION: [
    { href: "/institution", label: "Dashboard", icon: "dashboard" },
    { href: "/institution/submit", label: "Submit FDR", icon: "submit" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/verify", label: "Verify a NOC", icon: "verify" },
  ],
  BANK: [
    { href: "/bank", label: "NOC inbox", icon: "bank" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: "/verify", label: "Verify a NOC", icon: "verify" },
  ],
  RO: OFFICER,
  BUREAU: OFFICER,
  CELL: OFFICER.filter((n) => n.href !== "/audit"),
  AUTHORITY: OFFICER,
  ADMIN: OFFICER,
};

function initials(name: string) {
  return name
    .replace(/^(Dr\.|Prof\.)\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Signed-in portal: the government top bar, an identity header with the bell and user menu, a role menu bar. */
export async function PortalShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [lang, notices] = await Promise.all([getLang(), recentNoticeCount(user)]);
  const org = user.institution?.name.split(",")[0] ?? user.bank?.name ?? user.designation ?? "";
  const role = `${ROLE_LABEL[user.role]}${user.cell ? ` · ${user.cell.toLowerCase()} cell` : ""}`;
  return (
    <div className="flex min-h-screen flex-col">
      <GovTopBar lang={lang} wide />
      <header className="border-b bg-card">
        <div className="tricolor h-1 w-full" aria-hidden />
        <div className="mx-auto flex max-w-350 items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <Link href={homeFor(user.role)} className="flex min-w-0 items-center gap-3">
              <BrandMark className="size-10 shrink-0 sm:size-11" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-base font-bold tracking-tight text-navy sm:text-lg">FDR Intelligence Hub</span>
                <span lang="hi" className="block truncate text-xs font-semibold text-saffron-deep">
                  एफडीआर इंटेलिजेंस हब
                </span>
                <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{t(lang, "brandTagline")}</span>
              </span>
            </Link>
            <div className="hidden border-l pl-5 leading-tight xl:block">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t(lang, "prototypeFor")}</div>
              <div className="text-sm font-semibold">{t(lang, "bureau")}</div>
              <div className="text-xs text-muted-foreground">{t(lang, "council")}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs text-foreground/80 lg:inline-flex">
              <CalendarDays className="size-3.5" aria-hidden />
              {t(lang, "today")}: <strong className="font-semibold">{fmtDate(new Date())}</strong>
            </span>
            <Link
              href="/notifications"
              aria-label={`Notifications${notices ? `: ${notices} in the last 7 days` : ""}`}
              title="Notifications"
              className="relative flex size-10 items-center justify-center rounded-full border bg-card hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Bell className="size-[18px] text-foreground/80" aria-hidden />
              {notices > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-card">
                  {notices > 99 ? "99+" : notices}
                </span>
              )}
            </Link>
            <UserMenu name={user.name} initials={initials(user.name)} role={role} org={org} homeHref={homeFor(user.role)} signOut={signOut} />
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="h-11 bg-gov-blue" />}>
        <PortalNav items={NAV[user.role]} label={t(lang, "menu")} />
      </Suspense>
      <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
        <p className="mx-auto flex max-w-350 items-start gap-2 px-4 py-1.5 text-xs leading-relaxed sm:px-6 lg:px-8">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Prototype for SIH 2026 · fictional institutions, banks and people · bank confirmation via Mock AA sandbox · not an official AICTE website
        </p>
      </div>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-350 flex-1 px-4 pb-10 outline-none sm:px-6 lg:px-8">
        {children}
      </main>
      <GovFooter lang={lang} wide />
    </div>
  );
}

export type Band = { crumbs: Crumb[]; title: React.ReactNode; subtitle?: React.ReactNode };

/** Public pages (verification, results, rules): the full government frame, with an optional title band. */
export function PublicShell({ user, children, wide, active, band }: { user: SessionUser | null; children: React.ReactNode; wide?: boolean; active?: NavKey; band?: Band }) {
  return (
    <GovFrame user={user} active={active}>
      {band && <PageBand {...band} />}
      <main className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>
    </GovFrame>
  );
}

export type Crumb = { label: string; href?: string };

/**
 * Portal page title band: breadcrumb, title, one-line description and actions. The tinted background
 * bleeds to the window edges while the text stays aligned with the page content.
 */
export function PageHeader({ title, subtitle, actions, crumbs, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: Crumb[]; eyebrow?: React.ReactNode }) {
  return (
    <div className="band-bleed mb-6 py-6">
      <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {(crumbs?.length ? crumbs : eyebrow ? [{ label: String(eyebrow) }] : []).map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>›</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground/80">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-[28px]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

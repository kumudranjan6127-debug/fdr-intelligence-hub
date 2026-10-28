import Link from "next/link";
import { CalendarDays, Info, LogIn } from "lucide-react";
import { A11yControls, LangSwitch } from "@/components/gov-controls";
import { fmtDate } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { homeFor, type SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

// Government-portal chrome (GIGW conventions): utility bar with skip link, text size, contrast and
// language; a white identity header; a blue menu bar; a prototype disclaimer strip; a full footer.
// No national emblem or AICTE logo is used: this is a prototype, and the disclaimer says so.

export type NavKey = "home" | "verify" | "how" | "results" | "rules" | "faq" | "signin";

const MENU: { key: NavKey; href: string; label: Parameters<typeof t>[1] }[] = [
  { key: "home", href: "/", label: "navHome" },
  { key: "verify", href: "/verify", label: "navVerify" },
  { key: "how", href: "/#how", label: "navHow" },
  { key: "results", href: "/metrics", label: "navResults" },
  { key: "rules", href: "/policy", label: "navRules" },
  { key: "faq", href: "/#faq", label: "navFaq" },
];

/** The portal's own mark: a document with a verification seal. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="11" fill="var(--color-navy)" />
      <path d="M14 10h14l7 7v21a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z" fill="#fff" />
      <path d="M28 10v7h7" fill="none" stroke="var(--color-navy)" strokeWidth="1.5" opacity=".35" />
      <path d="M16.5 21h12M16.5 25.5h9M16.5 30h6" stroke="var(--color-navy)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <circle cx="33" cy="33" r="8" fill="var(--color-saffron)" stroke="#fff" strokeWidth="2" />
      <path d="m29.6 33.2 2.3 2.3 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GovTopBar({ lang }: { lang: Lang }) {
  return (
    <div className="bg-navy text-[12px] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full border border-saffron/70 bg-white/10 px-2 py-px text-[11px] font-semibold">SIH 2026</span>
          <span className="hidden truncate text-white/85 md:inline">{t(lang, "sihLine")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a href="#main" className="hidden rounded px-1 text-white/90 hover:underline focus-visible:outline-2 focus-visible:outline-white lg:inline">
            {t(lang, "skip")}
          </a>
          <span className="hidden h-3.5 w-px bg-white/25 lg:inline" aria-hidden />
          <A11yControls labels={{ smaller: t(lang, "textSmaller"), normal: t(lang, "textNormal"), larger: t(lang, "textLarger"), contrast: t(lang, "contrast") }} />
          <span className="h-3.5 w-px bg-white/25" aria-hidden />
          <LangSwitch lang={lang} />
        </div>
      </div>
    </div>
  );
}

function Brand({ lang, href = "/" }: { lang: Lang; href?: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3">
      <BrandMark className="size-11 shrink-0 sm:size-12" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-lg font-bold tracking-tight text-navy sm:text-xl">FDR Intelligence Hub</span>
        <span lang="hi" className="block truncate text-[13px] font-semibold text-saffron-deep">
          एफडीआर इंटेलिजेंस हब
        </span>
        <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">{t(lang, "brandTagline")}</span>
      </span>
    </Link>
  );
}

export function GovHeader({ lang, user }: { lang: Lang; user: SessionUser | null }) {
  return (
    <header className="border-b bg-card">
      <div className="tricolor h-1 w-full" aria-hidden />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Brand lang={lang} />
          <div className="hidden border-l pl-5 leading-tight lg:block">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t(lang, "prototypeFor")}</div>
            <div className="text-sm font-semibold text-foreground">{t(lang, "bureau")}</div>
            <div className="text-xs text-muted-foreground">{t(lang, "council")}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs text-foreground/80 md:inline-flex">
            <CalendarDays className="size-3.5" aria-hidden />
            {t(lang, "today")}: <strong className="font-semibold">{fmtDate(new Date())}</strong>
          </span>
          {user ? (
            <Link href={homeFor(user.role)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {t(lang, "workspace")}
            </Link>
          ) : (
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <LogIn className="size-4" aria-hidden />
              {t(lang, "signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function GovNav({ lang, active }: { lang: Lang; active?: NavKey }) {
  return (
    <nav aria-label={t(lang, "menu")} className="bg-gov-blue text-white">
      <ul className="mx-auto flex max-w-6xl overflow-x-auto px-2 sm:px-4">
        {MENU.map((m) => (
          <li key={m.key} className="shrink-0">
            <Link
              href={m.href}
              aria-current={active === m.key ? "page" : undefined}
              className={cn(
                "block border-b-[3px] border-transparent px-3.5 py-3 text-sm font-medium text-white/95 hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white sm:px-4",
                active === m.key && "border-saffron bg-white/12 font-semibold text-white",
              )}
            >
              {t(lang, m.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Disclaimer({ lang }: { lang: Lang }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-xs leading-relaxed sm:px-6">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t(lang, "disclaimer")}
      </p>
    </div>
  );
}

const BUILD_DATE = process.env.BUILD_DATE;

export function GovFooter({ lang }: { lang: Lang }) {
  const links: [string, Parameters<typeof t>[1]][] = [
    ["/", "navHome"],
    ["/verify", "navVerify"],
    ["/metrics", "navResults"],
    ["/policy", "navRules"],
    ["/#faq", "navFaq"],
    ["/login", "signIn"],
  ];
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className="tricolor h-1 w-full" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-9" />
            <div className="leading-tight">
              <div className="font-semibold">FDR Intelligence Hub</div>
              <div lang="hi" className="text-xs text-white/70">
                एफडीआर इंटेलिजेंस हब
              </div>
            </div>
          </div>
          <h2 className="sr-only">{t(lang, "footAbout")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">{t(lang, "footAboutBody")}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t(lang, "footLinks")}</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-white/80">
            {links.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="hover:text-white hover:underline">
                  {t(lang, key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t(lang, "footHelp")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">{t(lang, "footA11y")}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{t(lang, "footHindi")}</p>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-white/65 sm:px-6 md:flex-row md:items-start md:justify-between md:gap-8">
          <p className="max-w-3xl">
            {t(lang, "disclaimer")} {t(lang, "footBoundary")}
          </p>
          {BUILD_DATE && (
            <p className="shrink-0">
              {t(lang, "lastUpdated")}: {fmtDate(BUILD_DATE)}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

/** The full public frame: top bar, header, menu, disclaimer, page, footer. */
export async function GovFrame({ user, active, children }: { user: SessionUser | null; active?: NavKey; children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <div className="flex min-h-screen flex-col">
      <GovTopBar lang={lang} />
      <GovHeader lang={lang} user={user} />
      <GovNav lang={lang} active={active} />
      <Disclaimer lang={lang} />
      <div id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </div>
      <GovFooter lang={lang} />
    </div>
  );
}

/** A government-style page band: breadcrumb, title and one-line description. */
export function PageBand({ crumbs, title, subtitle }: { crumbs: { label: string; href?: string }[]; title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="border-b bg-navy-soft/60">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>›</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground/80">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

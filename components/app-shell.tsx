import Link from "next/link";
import type { Role } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { signOut } from "@/app/actions";
import { homeFor, type SessionUser } from "@/lib/session";
import { getLang } from "@/lib/lang";
import { BrandMark, GovFrame, GovTopBar, PageBand, type NavKey } from "./gov-chrome";
import { MobileNav, SidebarNav, type NavItem } from "./sidebar-nav";

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
  { href: "/officer", label: "Verification queue", icon: "inbox" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/audit", label: "Audit trail", icon: "audit" },
  { href: "/verify", label: "Verify a NOC", icon: "verify" },
];

export const NAV: Record<Role, NavItem[]> = {
  INSTITUTION: [
    { href: "/institution", label: "My deposits", icon: "wallet" },
    { href: "/institution/submit", label: "Submit instrument", icon: "submit" },
    { href: "/verify", label: "Verify a NOC", icon: "verify" },
  ],
  BANK: [
    { href: "/bank", label: "NOC inbox", icon: "bank" },
    { href: "/verify", label: "Verify a NOC", icon: "verify" },
  ],
  RO: OFFICER,
  BUREAU: OFFICER,
  CELL: OFFICER.filter((n) => n.href !== "/audit"),
  AUTHORITY: OFFICER,
  ADMIN: OFFICER,
};

function Brand({ compact, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <BrandMark className="size-9 shrink-0" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-navy">FDR Intelligence Hub</span>
          <span lang="hi" className="block text-[11px] font-semibold text-saffron-deep">
            एफडीआर इंटेलिजेंस हब
          </span>
        </span>
      )}
    </Link>
  );
}

function initials(name: string) {
  return name
    .replace(/^(Dr\.|Prof\.)\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserCard({ user }: { user: SessionUser }) {
  const org = user.institution?.name.split(",")[0] ?? user.bank?.name ?? user.designation ?? "";
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(user.name)}</span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {ROLE_LABEL[user.role]}
            {user.cell ? ` · ${user.cell.toLowerCase()}` : ""}
          </div>
        </div>
      </div>
      {org && <div className="mt-2 truncate text-xs text-muted-foreground" title={org}>{org}</div>}
      <form action={signOut} className="mt-2.5">
        <button className="w-full rounded-lg border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted">Switch user</button>
      </form>
    </div>
  );
}

/** Signed-in portal: government top bar, then a left sidebar on desktop and a collapsible menu on mobile. */
export async function PortalShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = NAV[user.role];
  const lang = await getLang();
  return (
    <div className="min-h-screen">
      <GovTopBar lang={lang} />
      <div className="tricolor h-1 w-full" aria-hidden />
      <div className="lg:flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r bg-card lg:flex">
          <div className="px-5 py-5">
            <Brand href={homeFor(user.role)} />
          </div>
          <div className="px-3">
            <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            <SidebarNav items={items} />
          </div>
          <div className="mt-auto space-y-3 p-3">
            <UserCard user={user} />
            <p className="px-1 text-[10px] leading-snug text-muted-foreground">SIH26265 prototype · fictional data · Mock AA sandbox</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <Brand compact href={homeFor(user.role)} />
            <MobileNav items={items} userName={user.name} role={ROLE_LABEL[user.role]} />
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-350 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
          <Footer />
        </div>
      </div>
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

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-350 px-4 py-4 text-xs leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
        All institutions, banks and people are fictional · bank confirmation via <strong className="font-medium text-foreground/80">Mock AA sandbox</strong> · hashes anchored in DB (ledger in Phase 3).{" "}
        <strong className="font-medium text-foreground/80">A matching hash proves a record is unchanged, not that a bank issued it</strong> — authenticity comes from the bank.
      </div>
    </footer>
  );
}

export type Crumb = { label: string; href?: string };

export function PageHeader({ title, subtitle, actions, crumbs, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: Crumb[]; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
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
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

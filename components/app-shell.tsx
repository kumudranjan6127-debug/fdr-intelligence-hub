import Link from "next/link";
import type { Role } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import type { SessionUser } from "@/lib/session";

const NAV: Record<Role, { href: string; label: string }[]> = {
  INSTITUTION: [
    { href: "/institution", label: "My deposits" },
    { href: "/institution/submit", label: "Submit instrument" },
  ],
  BANK: [
    { href: "/bank", label: "NOC inbox" },
    { href: "/verify", label: "Verify a NOC" },
  ],
  RO: [
    { href: "/officer", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/audit", label: "Audit trail" },
  ],
  BUREAU: [
    { href: "/officer", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/audit", label: "Audit trail" },
  ],
  CELL: [
    { href: "/officer", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
  ],
  AUTHORITY: [
    { href: "/officer", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/audit", label: "Audit trail" },
  ],
  ADMIN: [
    { href: "/officer", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/audit", label: "Audit trail" },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  INSTITUTION: "Institution",
  BANK: "Bank",
  RO: "Regional Office",
  BUREAU: "Regulation Bureau",
  CELL: "Cell reviewer",
  AUTHORITY: "Competent Authority",
  ADMIN: "Admin",
};

export function AppShell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <ShieldCheck className="size-5" aria-hidden />
            FDR Intelligence Hub
          </Link>
          {user && (
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV[user.role].map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-primary-foreground/85 hover:bg-white/10 hover:text-primary-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <div className="text-right leading-tight">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-primary-foreground/75">
                    {ROLE_LABEL[user.role]}
                    {user.cell ? ` · ${user.cell.toLowerCase()}` : ""}
                    {user.institution ? ` · ${user.institution.name.split(",")[0]}` : ""}
                    {user.bank ? ` · ${user.bank.name}` : ""}
                  </div>
                </div>
                <form action={signOut}>
                  <button className="rounded-md border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10">Switch user</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="rounded-md border border-white/30 px-2.5 py-1 text-xs hover:bg-white/10">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          SIH26265 prototype · all institutions, banks and people are fictional · bank confirmation via <strong>Mock AA sandbox</strong> ·
          hashes anchored in DB (ledger in Phase 3). <strong>A matching hash proves a record is unchanged, not that a bank issued it</strong> —
          authenticity comes from the bank (Account Aggregator / bank portal).
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

import Link from "next/link";
import { ArrowDown, ArrowUp, Download, Inbox, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { InstrumentStatusBadge, LienBadge, TrustBadge } from "@/components/badges";
import { EmptyState } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { fmtDate, formatINR, formatLakh } from "@/lib/format";
import { CATEGORIES, SORTS, asCategory, inCategory, matches, type SortKey } from "@/lib/registry";
import { queryRegistry } from "@/lib/services/registry";
import { requirePageUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "FDR registry" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const EXAMPLES = ["expiring in 90 days above 40 lakh", "matured and not renewed", "not bank verified", "lien not marked", "high risk", "flagged in Maharashtra"];

type SP = { q?: string; cat?: string; sort?: string; dir?: string; page?: string };

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/registry?${s}` : "/registry";
}

function due(days: number | null) {
  if (days === null) return null;
  if (days < 0) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800 ring-1 ring-red-200">{-days} days overdue</span>;
  if (days <= 90) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">in {days} days</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">in {days} days</span>;
}

function SortHead({ sp, sort, dir, k, children, className }: { sp: SP; sort: SortKey; dir: "asc" | "desc"; k?: SortKey; children: React.ReactNode; className?: string }) {
  if (!k) return <th className={cn("px-3 py-2.5 font-semibold", className)}>{children}</th>;
  const on = sort === k;
  const next = on && dir === "desc" ? "asc" : "desc";
  return (
    <th className={cn("px-3 py-2.5 font-semibold", className)} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href(sp, { sort: k, dir: next, page: undefined })} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {on && (dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </Link>
    </th>
  );
}

export default async function RegistryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePageUser(["BUREAU", "RO", "CELL", "AUTHORITY", "ADMIN"]);
  const sp = await searchParams;
  const sort: SortKey = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as SortKey) : "submitted";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const cat = asCategory(sp.cat);
  const { rows, all, parsed } = await queryRegistry(db, { q: sp.q, cat, sort, dir });
  const pages = Math.ceil(rows.length / PAGE);
  const page = Math.max(1, Math.min(pages || 1, Number(sp.page) || 1));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const total = rows.reduce((a, r) => a + r.amountPaise, 0n);
  const searched = all.filter((r) => matches(r, parsed.query));
  const csv = `/api/registry?${new URLSearchParams(Object.entries({ q: sp.q ?? "", cat: sp.cat ?? "", sort, dir }).filter(([, v]) => v)).toString()}`;
  const head = { sp, sort, dir } as const;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "FDR registry" }]}
        title="FDR registry"
        subtitle="Every security-deposit instrument on the portal: search in plain words or filter precisely."
        actions={
          <>
            <Link href="/officer" className={buttonVariants({ variant: "outline" })}>
              <Inbox className="size-4" aria-hidden />
              Verification queue
            </Link>
            <a href={csv} download className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          </>
        }
      />

      <section className="card-surface border-t-2 border-t-gov-blue p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gov-blue">
          <Sparkles className="size-3.5" aria-hidden />
          Smart search · ask in plain words
        </h2>
        <form action="/registry" className="mt-3 flex gap-2">
          {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              aria-label="Search the registry in plain words"
              placeholder="Try “expiring in 60 days in Maharashtra above 40 lakh”"
              className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button className={cn(buttonVariants(), "h-11 px-5")}>Search</button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Try:</span>
          {EXAMPLES.map((e) => (
            <Link key={e} href={href({}, { q: e })} className="rounded-full border bg-background px-2.5 py-1 hover:border-primary/40 hover:bg-primary/5">
              {e}
            </Link>
          ))}
        </div>
        {sp.q && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
            <span className="font-medium">Understood as:</span>
            {parsed.chips.length ? (
              parsed.chips.map((c) => (
                <span key={c} className="rounded-full bg-card px-2 py-0.5 ring-1 ring-border">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">nothing specific</span>
            )}
            <Link href={href(sp, { q: undefined, page: undefined })} className="ml-auto font-medium text-primary hover:underline">
              Clear search
            </Link>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Understands states, banks, amounts in lakh or crore, maturity windows, bank checks, liens, risk and flags. The rules run on the portal itself; nothing is sent to an outside AI service.
        </p>
      </section>

      <nav aria-label="Categories" className="my-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const n = searched.filter((r) => inCategory(r, c.key)).length;
          return (
            <Link
              key={c.key}
              href={href(sp, { cat: c.key === "all" ? undefined : c.key, page: undefined })}
              aria-current={cat === c.key ? "true" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm font-medium", cat === c.key ? "border-gov-blue bg-gov-blue text-white" : "bg-card hover:bg-muted")}
            >
              {c.label} <span className="opacity-70">{n}</span>
            </Link>
          );
        })}
      </nav>

      <section className="card-surface overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <h2 className="font-semibold">Instruments</h2>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{rows.length}</strong> instruments · <strong className="text-foreground">{formatLakh(total)}</strong> total value
          </p>
        </header>
        {rows.length === 0 ? (
          <EmptyState icon={Search} title="No instrument matches">
            Try fewer words, or clear the search.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-275 text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <SortHead {...head} className="pl-5">
                    Reference
                  </SortHead>
                  <SortHead {...head} k="institution">
                    Institution
                  </SortHead>
                  <SortHead {...head} k="amount" className="text-right">
                    Amount
                  </SortHead>
                  <SortHead {...head} k="maturity">
                    Maturity
                  </SortHead>
                  <SortHead {...head}>Status</SortHead>
                  <SortHead {...head}>Trust level</SortHead>
                  <SortHead {...head} k="risk">
                    Risk
                  </SortHead>
                  <SortHead {...head}>Lien</SortHead>
                  <SortHead {...head} k="submitted" className="pr-5">
                    Submitted
                  </SortHead>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const flagged = r.trust === "MISMATCH" || r.openDiscrepancies > 0;
                  return (
                    <tr key={r.id} className={cn("border-b align-top last:border-b-0 hover:bg-muted/30", flagged && "shadow-[inset_3px_0_0_var(--color-red-500)]")}>
                      <td className="py-3 pl-5 pr-3">
                        <Link href={`/institution/instruments/${r.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                          {r.code}
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.bank ?? "—"}
                          {r.fdrNumber ? ` · ${r.fdrNumber}` : ""}
                        </div>
                      </td>
                      <td className="max-w-64 px-3 py-3">
                        <div className="font-medium leading-snug">{r.institution.split(",")[0]}</div>
                        <div className="text-xs text-muted-foreground">{r.state}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{formatINR(r.amountPaise)}</td>
                      <td className="px-3 py-3">
                        <div className="tabular-nums">{fmtDate(r.maturityDate)}</div>
                        <div className="mt-1">{["ACTIVE", "EXPIRING", "MATURED"].includes(r.status) ? due(r.daysToMaturity) : null}</div>
                      </td>
                      <td className="px-3 py-3">
                        <InstrumentStatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <TrustBadge trust={r.trust} />
                          {r.openDiscrepancies > 0 && (
                            <span className="text-xs font-medium text-red-700">
                              {r.openDiscrepancies} open discrepanc{r.openDiscrepancies === 1 ? "y" : "ies"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums",
                            r.risk >= 60 ? "bg-red-600 text-white" : r.risk >= 30 ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800",
                          )}
                          title="Institution risk score"
                        >
                          {Math.round(r.risk)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <LienBadge lien={r.lien} confirmed={r.lienConfirmed} />
                      </td>
                      <td className="py-3 pl-3 pr-5 tabular-nums text-muted-foreground">{fmtDate(r.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm sm:px-5">
            <span className="text-muted-foreground">
              Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, rows.length)} of {rows.length}
            </span>
            <nav aria-label="Pages" className="flex gap-1">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={href(sp, { page: n === 1 ? undefined : String(n) })}
                  aria-current={n === page ? "page" : undefined}
                  className={cn("flex size-8 items-center justify-center rounded-md border text-sm", n === page ? "border-gov-blue bg-gov-blue font-semibold text-white" : "bg-card hover:bg-muted")}
                >
                  {n}
                </Link>
              ))}
            </nav>
          </footer>
        )}
      </section>
    </>
  );
}

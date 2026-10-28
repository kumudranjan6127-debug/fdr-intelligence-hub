import Link from "next/link";
import { ArrowRight, CalendarRange, Landmark, Layers, ShieldAlert } from "lucide-react";
import { Section } from "@/components/ui-kit";
import { formatLakh } from "@/lib/format";
import type { ProtectionGap } from "@/lib/protection";
import { inCategory, type Category, type RegistryRow, type Trust } from "@/lib/registry";
import { cn } from "@/lib/utils";

/** Red headline card: rupees that do not fully protect AICTE today, and why. */
export function ProtectionGapCard({ gap }: { gap: ProtectionGap }) {
  const pct = gap.requiredPaise ? Number((gap.protectedPaise * 1000n) / gap.requiredPaise) / 10 : 100;
  return (
    <section className="relative overflow-hidden rounded-xl bg-linear-to-br from-red-700 to-red-600 p-5 text-white shadow-sm sm:p-6" aria-labelledby="gap-title">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/8" />
      <h2 id="gap-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/85">
        <ShieldAlert className="size-4" aria-hidden />
        Protection gap right now
      </h2>
      <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{formatLakh(gap.gapPaise)}</div>
      <p className="mt-1 max-w-md text-sm text-white/85">
        {gap.underCovered} of {gap.institutions} institutions are not fully protected by live, bank-checked deposits that carry no open issue.
      </p>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-white/80">
          <span>Protected {formatLakh(gap.protectedPaise)}</span>
          <span>
            Required {formatLakh(gap.requiredPaise)} ({pct}%)
          </span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-white/25" role="img" aria-label={`${pct}% of the required deposit is protected`}>
          <div className="h-2 rounded-full bg-white" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {gap.reasons.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="group flex h-full items-start justify-between gap-2 rounded-lg bg-white/12 px-3.5 py-3 ring-1 ring-white/20 hover:bg-white/20">
              <span>
                <span className="block text-xs text-white/85">{r.label}</span>
                <span className="mt-0.5 block text-lg font-bold tabular-nums">{formatLakh(r.paise)}</span>
                <span className="block text-[11px] text-white/75">
                  {r.count} {r.key === "shortfall" ? "institution" : "instrument"}
                  {r.count === 1 ? "" : "s"}
                </span>
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 opacity-70 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-white/70">The amounts behind the gap can overlap. Bank checks in this prototype come from the Mock AA sandbox.</p>
    </section>
  );
}

const CATS: { key: Category; label: string; hint: string; tone: string }[] = [
  { key: "active", label: "Active", hint: "In force, more than 90 days left", tone: "border-l-emerald-600" },
  { key: "expiring", label: "Expiring (≤ 90 days)", hint: "Renewal due soon", tone: "border-l-amber-500" },
  { key: "matured", label: "Matured", hint: "Past maturity, not renewed", tone: "border-l-red-600" },
  { key: "renewed", label: "Renewed / replaced", hint: "Succeeded by a newer FDR", tone: "border-l-teal-600" },
  { key: "released", label: "Released", hint: "Returned with a NOC", tone: "border-l-slate-500" },
  { key: "pending", label: "Pending action", hint: "Awaiting AICTE action", tone: "border-l-violet-600" },
];

export function CategoryTiles({ rows, hrefBase = "/registry" }: { rows: RegistryRow[]; hrefBase?: string | null }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {CATS.map((c) => {
        const hit = rows.filter((r) => inCategory(r, c.key));
        const amount = hit.reduce((a, r) => a + r.amountPaise, 0n);
        const body = (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{hit.length}</div>
            <div className="text-xs font-medium tabular-nums text-foreground/80">{formatLakh(amount)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
            {hrefBase && <div className="mt-2 text-xs font-semibold text-primary">View list →</div>}
          </>
        );
        return (
          <li key={c.key}>
            {hrefBase ? (
              <Link href={`${hrefBase}?cat=${c.key}`} className={cn("card-surface block h-full border-l-4 p-4 hover:shadow-md", c.tone)}>
                {body}
              </Link>
            ) : (
              <div className={cn("card-surface h-full border-l-4 p-4", c.tone)}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const TRUST_ORDER: { key: Trust; label: string; cls: string; note: string }[] = [
  { key: "CLAIMED", label: "Claimed only", cls: "bg-amber-400", note: "Typed by the institution" },
  { key: "EXTRACTED", label: "Document matches", cls: "bg-blue-500", note: "AI read the receipt; it matches" },
  { key: "SANDBOX", label: "Bank-checked (sandbox)", cls: "bg-emerald-500", note: "Matches the Mock AA sandbox" },
  { key: "CONFIRMED", label: "Bank-confirmed (live)", cls: "bg-emerald-700", note: "Live bank channel (Phase 4)" },
  { key: "MISMATCH", label: "Mismatch", cls: "bg-red-600", note: "Sources disagree" },
];

/** How far the live deposits have been proven, rung by rung. */
export function TrustLadder({ rows }: { rows: RegistryRow[] }) {
  const live = rows.filter((r) => r.status === "ACTIVE" || r.status === "EXPIRING" || r.status === "SUBMITTED" || r.status === "UNDER_SCRUTINY");
  const n = Math.max(1, live.length);
  const parts = TRUST_ORDER.map((t) => ({ ...t, count: live.filter((r) => r.trust === t.key).length }));
  return (
    <Section title="Trust ladder" icon={Layers} description={`How far ${live.length} live and pending instruments have been proven`}>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.label}: ${p.count}`).join(", ")}>
        {parts.map((p) => (p.count ? <div key={p.key} className={p.cls} style={{ width: `${(p.count / n) * 100}%` }} title={`${p.label}: ${p.count}`} /> : null))}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {parts.map((p, i) => (
          <li key={p.key} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <span className={cn("size-3 shrink-0 rounded-sm", p.cls)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {p.key === "MISMATCH" ? "" : `${i}. `}
                {p.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{p.note}</span>
            </span>
            <span className="text-right">
              <span className="block text-lg font-bold tabular-nums">{p.count}</span>
              <span className="block text-[11px] text-muted-foreground">{Math.round((p.count / n) * 100)}%</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Amount maturing in each of the next 12 months, for live instruments. */
export function MaturityChart({ rows, now }: { rows: RegistryRow[]; now: Date }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }), paise: 0n, count: 0 };
  });
  const index = new Map(months.map((m, i) => [m.key, i]));
  const live = rows.filter((r) => (r.status === "ACTIVE" || r.status === "EXPIRING") && r.maturityDate);
  for (const r of live) {
    const i = index.get(r.maturityDate!.slice(0, 7));
    if (i !== undefined && r.daysToMaturity! >= 0) {
      months[i].paise += r.amountPaise;
      months[i].count++;
    }
  }
  const overdue = rows.filter((r) => inCategory(r, "matured"));
  const max = months.reduce((m, x) => (x.paise > m ? x.paise : m), 1n);
  const in30 = live.filter((r) => r.daysToMaturity! >= 0 && r.daysToMaturity! <= 30);
  const in90 = live.filter((r) => r.daysToMaturity! >= 0 && r.daysToMaturity! <= 90);
  const sum = (l: RegistryRow[]) => formatLakh(l.reduce((a, r) => a + r.amountPaise, 0n));
  return (
    <Section title="Maturity calendar · next 12 months" icon={CalendarRange} description="Amount of live deposits maturing each month">
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={months.map((m) => `${m.label}: ${m.count} deposits, ${formatLakh(m.paise)}`).join("; ")}>
        {months.map((m) => (
          <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m.label}: ${m.count} · ${formatLakh(m.paise)}`}>
            {m.count > 0 && <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{m.count}</span>}
            <div className={cn("w-full rounded-t-sm", m.count ? "bg-saffron" : "bg-muted")} style={{ height: m.count ? `${Math.max(6, Number((m.paise * 100n) / max))}%` : "3px" }} />
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <Link href="/registry?q=expiring+in+30+days" className="rounded-lg border bg-background px-3 py-2 hover:bg-muted/50">
          <span className="block text-xs text-muted-foreground">In 30 days</span>
          <span className="font-bold tabular-nums">{in30.length}</span> <span className="text-xs text-muted-foreground">· {sum(in30)}</span>
        </Link>
        <Link href="/registry?cat=expiring" className="rounded-lg border bg-background px-3 py-2 hover:bg-muted/50">
          <span className="block text-xs text-muted-foreground">In 90 days</span>
          <span className="font-bold tabular-nums">{in90.length}</span> <span className="text-xs text-muted-foreground">· {sum(in90)}</span>
        </Link>
        <Link href="/registry?cat=matured" className={cn("rounded-lg border px-3 py-2", overdue.length ? "border-red-200 bg-red-50 hover:bg-red-100" : "bg-background hover:bg-muted/50")}>
          <span className="block text-xs text-muted-foreground">Matured, not renewed</span>
          <span className="font-bold tabular-nums">{overdue.length}</span> <span className="text-xs text-muted-foreground">· {sum(overdue)}</span>
        </Link>
      </div>
    </Section>
  );
}

/** Live deposits per bank and how much of each bank's book has been checked with the bank. */
export function BankTable({ rows }: { rows: RegistryRow[] }) {
  const live = rows.filter((r) => r.status === "ACTIVE" || r.status === "EXPIRING" || r.status === "MATURED");
  const banks = [...new Set(live.map((r) => r.bank ?? "Not stated"))]
    .map((b) => {
      const list = live.filter((r) => (r.bank ?? "Not stated") === b);
      const checked = list.filter((r) => r.trust === "CONFIRMED" || r.trust === "SANDBOX").length;
      return {
        bank: b,
        count: list.length,
        paise: list.reduce((a, r) => a + r.amountPaise, 0n),
        share: Math.round((checked / list.length) * 100),
        issues: list.filter((r) => r.trust === "MISMATCH" || r.openDiscrepancies > 0 || r.lien === false).length,
      };
    })
    .sort((a, b) => (b.paise > a.paise ? 1 : -1));
  return (
    <Section title="Deposits by bank" icon={Landmark} description="Live and matured deposits per bank, and the share checked with the bank" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Bank</th>
              <th className="px-3 py-2.5 text-right font-semibold">FDRs</th>
              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              <th className="px-3 py-2.5 font-semibold">Bank-checked</th>
              <th className="px-5 py-2.5 text-right font-semibold">Open issues</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.bank} className="border-b last:border-b-0">
                <td className="px-5 py-2.5 font-medium">
                  <Link href={`/registry?q=${encodeURIComponent(b.bank)}`} className="hover:text-primary hover:underline">
                    {b.bank}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{b.count}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatLakh(b.paise)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 rounded-full bg-muted">
                      <div className={cn("h-2 rounded-full", b.share >= 90 ? "bg-emerald-600" : b.share >= 60 ? "bg-amber-500" : "bg-red-600")} style={{ width: `${b.share}%` }} />
                    </div>
                    <span className="text-xs tabular-nums">{b.share}%</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right">
                  {b.issues ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">{b.issues}</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

import { AlertTriangle, BadgeCheck, CircleDashed, Plug, Scale, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, PublicShell } from "@/components/app-shell";
import { Section } from "@/components/ui-kit";
import { db } from "@/lib/db";
import { getActiveRules } from "@/lib/services/core";
import { currentUser } from "@/lib/session";
import { DISCIPLINES, DISCIPLINE_LABEL, POLICY_CHECKED_ON, POLICY_EFFECTIVE, RULE_REGISTER, type RuleStatus } from "@/lib/rules";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rule register" };
export const dynamic = "force-dynamic";

const STATUS: Record<RuleStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  VERIFIED: { label: "Verified", cls: "border-emerald-300 bg-emerald-50 text-emerald-900", Icon: BadgeCheck },
  CONFLICT: { label: "Conflict between sources", cls: "border-amber-300 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  NOT_WIRED: { label: "Verified, no data feed", cls: "border-slate-300 bg-slate-50 text-slate-700", Icon: Plug },
  ILLUSTRATIVE: { label: "Portal setting", cls: "border-dashed border-slate-400 bg-white text-slate-700", Icon: CircleDashed },
};

export default async function PolicyPage() {
  const [user, { rules, version }] = await Promise.all([currentUser(), getActiveRules(db)]);
  const counts = RULE_REGISTER.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});

  return (
    <PublicShell user={user} wide>
      <PageHeader
        eyebrow="Policy engine"
        title="Rule register"
        subtitle={`Every rule the engine applies, the clause it comes from, and whether it was checked against the source · ${POLICY_EFFECTIVE} · checked ${POLICY_CHECKED_ON} · active rule set ${version}`}
      />

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {(Object.keys(STATUS) as RuleStatus[]).map((s) => (
          <span key={s} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium", STATUS[s].cls)}>
            {(() => {
              const I = STATUS[s].Icon;
              return <I className="size-3.5" aria-hidden />;
            })()}
            {counts[s] ?? 0} {STATUS[s].label.toLowerCase()}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {RULE_REGISTER.map((r) => {
          const st = STATUS[r.status];
          return (
            <section key={r.id} className={cn("card-surface p-5", r.status === "CONFLICT" && "border-amber-300")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold tracking-tight">{r.rule}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Engine: <span className="text-foreground">{r.engine}</span>
                  </p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", st.cls)}>
                  <st.Icon className="size-3" aria-hidden />
                  {st.label}
                </span>
              </div>
              {r.sources.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {r.sources.map((s, i) => (
                    <li key={i} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <div className="text-xs font-medium text-muted-foreground">
                        {s.doc} · cl. {s.clause}
                        {s.page !== "—" ? ` · p. ${s.page}` : ""}
                      </div>
                      <blockquote className="mt-1 leading-relaxed">“{s.quote}”</blockquote>
                    </li>
                  ))}
                </ul>
              )}
              {r.note && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.note}</p>}
            </section>
          );
        })}
      </div>

      <Section title="Table 1.4 as encoded" icon={Table2} description={`${rules.depositTableRef} · ₹ lakh · doubled for a private leased building / land`} className="mt-6 min-w-0" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-110 text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Programme</th>
                <th className="px-3 py-2.5 text-right font-medium">Diploma</th>
                <th className="px-3 py-2.5 text-right font-medium">UG</th>
                <th className="px-5 py-2.5 text-right font-medium">PG</th>
              </tr>
            </thead>
            <tbody>
              {DISCIPLINES.map((d) => (
                <tr key={d} className="border-b last:border-b-0">
                  <td className="px-5 py-2">{DISCIPLINE_LABEL[d]}</td>
                  {(["DIPLOMA", "UG", "PG"] as const).map((l) => (
                    <td key={l} className={cn("px-3 py-2 text-right tabular-nums", l === "PG" && "pr-5")}>
                      {rules.depositTableLakh[d][l] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Rule values live in a versioned RuleSet, so a correction from AICTE (for example on the 20% / 50% conflict) is a data change, not a code change. Page numbers are the printed numbers of the
        handbook. Quotes are abridged where marked with “…”.
      </p>
    </PublicShell>
  );
}

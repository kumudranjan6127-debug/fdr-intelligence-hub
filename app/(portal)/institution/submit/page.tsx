import { PageHeader } from "@/components/app-shell";
import { SubmitWizard, type PredecessorOption } from "@/components/submit-wizard";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { SAMPLE_DOCS } from "@/lib/sample-specs";
import { bestEvidence, effectiveValue, normalize, tierFieldsOf } from "@/lib/provenance";
import { requiredAmount } from "@/lib/rules";
import { requirePageUser } from "@/lib/session";
import { getActiveRules } from "@/lib/services/core";

export const metadata = { title: "Submit instrument" };
export const dynamic = "force-dynamic";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ predecessor?: string }> }) {
  const user = await requirePageUser(["INSTITUTION"]);
  const { predecessor } = await searchParams;
  const inst = await db.institution.findUniqueOrThrow({ where: { id: user.institutionId! } });
  const [{ rules, version }, candidates, banks] = await Promise.all([
    getActiveRules(db),
    db.instrument.findMany({
      where: { institutionId: inst.id, status: { in: ["ACTIVE", "EXPIRING", "MATURED"] } },
      include: { successors: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.bank.findMany({ orderBy: { name: "asc" } }),
  ]);

  const predecessors: PredecessorOption[] = candidates
    .filter((c) => !c.successors.some((s) => !["REJECTED", "DRAFT"].includes(s.status)))
    .map((c) => {
      const f = tierFieldsOf(c);
      return {
        id: c.id,
        code: c.code,
        type: c.type,
        status: c.status,
        label: `${c.code} · ${formatINR(String(effectiveValue(f.amount)))} · matures ${normalize("maturityDate", bestEvidence(f.maturityDate).value) ?? "—"}`,
        bankName: String(effectiveValue(f.bankName) ?? ""),
        amountRupees: Number(effectiveValue(f.amount) ?? 0) / 100,
        maturityDate: normalize("maturityDate", bestEvidence(f.maturityDate).value),
      };
    });

  const required = requiredAmount(inst, rules);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My deposits", href: "/institution" }, { label: "Submit instrument" }]}
        eyebrow="Guided submission"
        title="Submit a security deposit"
        subtitle={`${inst.name} · required ${formatINR(required)} (${inst.programmes} programmes${inst.isLeased ? ", doubled for leased premises" : ""}; rules ${version})`}
      />
      <SubmitWizard
        predecessors={predecessors}
        initialPredecessor={predecessors.some((p) => p.id === predecessor) ? predecessor! : null}
        banks={banks.map((b) => b.name)}
        requiredRupees={Number(required) / 100}
        samples={SAMPLE_DOCS.map((s) => ({ file: s.file, title: s.title, hint: s.hint }))}
        affidavitWindowDays={rules.affidavitWindowDays}
      />
    </>
  );
}

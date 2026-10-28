import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, KeyRound, PlayCircle } from "lucide-react";
import { PublicShell } from "@/components/app-shell";
import { signInAs } from "@/app/actions";
import { demoPassword, isDemoMode } from "@/lib/auth";
import { allChains, analyzeChain } from "@/lib/chain";
import { db } from "@/lib/db";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { toChainNode } from "@/lib/services/core";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Judge's demo guide" };
export const dynamic = "force-dynamic";

type Scenario = { n: number; tag: string; title: string; body: string; steps: string[]; who: string; email: string; next: string };

const CAPABILITIES: [string, string, [string, string][]][] = [
  ["Centralised repository", "One registry of every FDR and online deposit, with plain-words search, categories and CSV export.", [["FDR registry", "/registry"], ["Dashboard", "/dashboard"]]],
  ["Digital document management", "Receipts uploaded as PDF; AI reads them into the Extracted tier; each file is SHA-256 anchored.", [["Submit FDR", "/institution/submit"]]],
  ["Verification & discrepancy detection", "Claimed vs Extracted vs Confirmed on every field, duplicate detection, a risk-sorted queue.", [["Verification queue", "/officer"]]],
  ["Validity & maturity tracking", "Days to maturity everywhere, a 12-month maturity calendar and an unclaimed-deposit finder.", [["Dashboard", "/dashboard"]]],
  ["Renewal & replacement monitoring", "The renewal-chain X-ray finds coverage gaps, amount drops and missing liens.", [["Chain alerts", "/dashboard"]]],
  ["Release & refund workflow", "Clearances, a clause-cited penalty engine, approval, a QR-verifiable NOC with a PDF copy, bank confirmation.", [["Release cases", "/officer?view=all&type=RELEASE"]]],
  ["Alerts & escalation", "90 / 30 / 7-day reminders from a daily job, notifications and a bell; SLA breaches flagged.", [["Notifications", "/notifications"]]],
  ["Dashboard & reports", "Protection gap, categories, trust ladder, bank table, risk leaderboard, measured results.", [["Dashboard", "/dashboard"], ["Results", "/metrics"]]],
  ["Audit trail & access control", "Every state change is a hash-chained event; role checks on every action; signed sessions.", [["Audit trail", "/audit"]]],
  ["Integration & data security", "Account Aggregator interface (Mock AA sandbox), evidence controls, public NOC verification.", [["Verify a NOC", "/verify"], ["Rules", "/policy"]]],
];

export default async function DemoGuide() {
  const [user, lang] = await Promise.all([currentUser(), getLang()]);
  const demo = isDemoMode();
  const [release, valid, revoked, instruments] = await Promise.all([
    db.case.findFirst({ where: { type: "RELEASE", status: "CLEARANCES_PENDING" }, select: { id: true } }),
    db.noc.findFirst({ where: { revokedAt: null }, orderBy: { issuedAt: "desc" }, select: { code: true } }),
    db.noc.findFirst({ where: { revokedAt: { not: null } }, select: { code: true } }),
    db.instrument.findMany({ include: { institution: { select: { name: true } } } }),
  ]);
  const chain = allChains(instruments.map(toChainNode))
    .map(analyzeChain)
    .find((a) => a.gaps.length);
  const chainHref = chain ? `/institution/instruments/${chain.nodes[chain.nodes.length - 1].id}?tab=chain` : "/dashboard";

  const SCENARIOS: Scenario[] = [
    {
      n: 1,
      tag: "New FDR submission",
      title: "AI reads the receipt and catches a wrong amount",
      body: "Ganga Valley claims ₹50 L; the uploaded specimen says ₹45 L.",
      steps: ["Choose FDR / New deposit, fill the form, upload the specimen “FDR ₹45 L”.", "The Extracted tier shows ₹45 L in red against the ₹50 L claim.", "Submit: the passport opens with the case created."],
      who: "Rakesh Tiwari · Institution",
      email: "accounts@gangavalley.demo",
      next: "/institution/submit",
    },
    {
      n: 2,
      tag: "Discrepancy identification",
      title: "Officer checks with the bank and asks for clarification",
      body: "The risk-sorted queue puts the riskiest institutions first.",
      steps: ["Open the Ganga Valley case: document on the left, three tiers on the right.", "Click “Fetch bank confirmation” (Mock AA sandbox).", "Request clarification with a reason."],
      who: "Arjun Mehta · Regulation Bureau",
      email: "dd.regulation@aicte.demo",
      next: "/officer",
    },
    {
      n: 3,
      tag: "Renewal monitoring",
      title: "Renewal-chain X-ray finds a 47-day gap",
      body: "Every renewal is linked; gaps, amount drops and missing liens are flagged.",
      steps: ["The chain tab shows Shivneri's coverage gap.", "The dashboard lists Narmada's ₹50 L → ₹45 L drop and Kaveri's missing lien."],
      who: "Arjun Mehta · Regulation Bureau",
      email: "dd.regulation@aicte.demo",
      next: chainHref,
    },
    {
      n: 4,
      tag: "Validity tracking",
      title: "Protection gap, maturity calendar and reminders",
      body: "How many rupees do not protect AICTE today, and why.",
      steps: ["Read the red protection-gap card and open a reason.", "Click “Run maturity job”: reminders are created; a second run creates none."],
      who: "Arjun Mehta · Regulation Bureau",
      email: "dd.regulation@aicte.demo",
      next: "/dashboard",
    },
    {
      n: 5,
      tag: "Authorised release",
      title: "Clear, approve, issue a NOC, verify it, tamper with it",
      body: "Konkan's release is stuck with the Legal cell, past its SLA.",
      steps: [
        "As the Legal cell, click Clear: a 10% deduction under APH cl. 2.21(h).",
        "As Dr. S. Raghavan: Approve release, then Issue lien-release NOC and download its PDF.",
        "Open the QR page: Valid. Flip one byte: hash mismatch.",
        "As the bank (Suresh Iyer): Confirm lien lifted.",
      ],
      who: "Rohini Kulkarni · Legal cell",
      email: "legal.cell@aicte.demo",
      next: release ? `/officer/cases/${release.id}` : "/officer?view=all&type=RELEASE",
    },
    {
      n: 6,
      tag: "Smart search",
      title: "Ask the registry in plain words",
      body: "Rules on the portal read the query; nothing goes to an outside AI.",
      steps: ["Try “matured and not renewed”, “lien not marked” or “expiring in 90 days above 40 lakh”.", "Export the result as CSV."],
      who: "Arjun Mehta · Regulation Bureau",
      email: "dd.regulation@aicte.demo",
      next: "/registry?q=expiring+in+90+days+above+40+lakh",
    },
  ];

  return (
    <PublicShell
      user={user}
      wide
      active="demo"
      band={{ crumbs: [{ label: t(lang, "navHome"), href: "/" }, { label: "Demo guide" }], title: "Judge's demo guide", subtitle: "Run every problem-statement scenario in one click. All people, institutions and banks are fictional." }}
    >
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl bg-navy p-6 text-white">
          <div className="text-xs font-bold uppercase tracking-wider text-saffron">Problem statement SIH26265 · AICTE</div>
          <div className="mt-2 text-4xl font-bold">10 / 10</div>
          <p className="mt-1 max-w-lg text-sm text-white/80">capability areas are working in this prototype. Each scenario below signs you in as the right person and opens the exact screen.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {["#scenarios", "#coverage"].map((h) => (
              <a key={h} href={h} className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/25 hover:bg-white/20">
                {h === "#scenarios" ? "Test scenarios" : "Coverage"}
              </a>
            ))}
            <Link href="/metrics" className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/25 hover:bg-white/20">
              Measured results
            </Link>
          </div>
        </section>
        <section className="card-surface p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-4 text-primary" aria-hidden />
            How to use this guide
          </h2>
          <ol className="mt-3 space-y-2.5 text-sm">
            {["Pick a scenario. Each one is a test case from the problem statement.", "Click “Sign in & open”: no typing, you land on the right screen.", "Follow the steps on the card; the result shows on that screen."].map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-soft text-[11px] font-bold text-navy">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
            <KeyRound className="size-3.5" aria-hidden />
            Password for every demo account: <code className="font-mono font-semibold">{demoPassword()}</code>
          </p>
        </section>
      </div>

      <h2 id="scenarios" className="mt-10 scroll-mt-6 text-xl font-bold tracking-tight text-navy">
        Test scenarios
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {SCENARIOS.map((s) => (
          <article key={s.n} className="card-surface flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-saffron/15 font-bold text-saffron-deep ring-1 ring-saffron/40">{s.n}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gov-blue">{s.tag}</div>
                <h3 className="font-semibold leading-snug">{s.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-9 text-sm">
              {s.steps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground" style={{ marginTop: "1rem" }}>
              <span>As {s.who}</span>
              {demo ? (
                <form action={signInAs}>
                  <input type="hidden" name="email" value={s.email} />
                  <input type="hidden" name="next" value={s.next} />
                  <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    <PlayCircle className="size-4" aria-hidden />
                    Sign in &amp; open
                  </button>
                </form>
              ) : (
                <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  Sign in <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </article>
        ))}
        <article className="card-surface flex flex-col p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-saffron/15 font-bold text-saffron-deep ring-1 ring-saffron/40">7</span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-gov-blue">Public verification · no sign-in</div>
              <h3 className="font-semibold leading-snug">Anyone can check a NOC</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">The QR on every NOC opens this page. A revoked NOC says so in red.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-3" style={{ marginTop: "1rem" }}>
            {valid && (
              <Link href={`/verify/${valid.code}`} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Valid NOC {valid.code}
              </Link>
            )}
            {revoked && (
              <Link href={`/verify/${revoked.code}`} className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50">
                Revoked NOC {revoked.code}
              </Link>
            )}
          </div>
        </article>
      </div>

      <h2 id="coverage" className="mt-10 scroll-mt-6 text-xl font-bold tracking-tight text-navy">
        Problem statement coverage
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">The capability areas of SIH26265 and where to see each one working.</p>
      <div className="card-surface mt-4 overflow-x-auto">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Capability area</th>
              <th className="px-3 py-2.5 font-semibold">How the portal delivers it</th>
              <th className="px-5 py-2.5 font-semibold">Where to see it</th>
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map(([cap, how, links], i) => (
              <tr key={cap} className={cn("border-b last:border-b-0", i % 2 && "bg-muted/20")}>
                <td className="px-5 py-3 align-top">
                  <span className="flex items-start gap-2 font-medium">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-india-green" aria-hidden />
                    {i + 1}. {cap}
                  </span>
                </td>
                <td className="px-3 py-3 align-top text-muted-foreground">{how}</td>
                <td className="px-5 py-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {links.map(([label, href]) => (
                      <Link key={href + label} href={href} className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/5">
                        {label}
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Sandbox boundaries stay labelled: bank confirmation uses the Mock AA sandbox, hashes are anchored in the database, and every document is a fictional specimen.
      </p>
    </PublicShell>
  );
}

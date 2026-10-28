import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSearch,
  Fingerprint,
  Gavel,
  Hourglass,
  Landmark,
  QrCode,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TierBadge } from "@/components/badges";
import { GovFrame } from "@/components/gov-chrome";
import { demoPassword, isDemoMode } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { FAQ, t, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { db } from "@/lib/db";
import { currentUser, homeFor } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Landmark, title: "Bank confirmation via Account Aggregator", body: "An AAProvider interface returning the TERM_DEPOSIT shape. Mock AA sandbox today; Setu / Finvu in Phase 4." },
  { icon: Scale, title: "APH rules and penalty engine", body: "Versioned rules for the deposit table, affidavit window, late tiers and release deductions, each checked against the handbook clause and page." },
  { icon: TrendingUp, title: "Institution risk score", body: "Late renewals, gap days, open discrepancies and overdue cases roll into one score. The queue is sorted by it." },
  { icon: Wallet, title: "Unclaimed deposit finder", body: "Deposits past their 10-year term with no release application, with a one-click notice draft." },
  { icon: Hourglass, title: "“Why is this pending?”", body: "Every open case names its blocking step, owner, days pending and the next action." },
  { icon: Fingerprint, title: "Hash-chained audit trail", body: "Each event's hash covers the previous one, and the chain is re-verified on the audit page." },
];

const STEPS: { icon: LucideIcon; who: string; title: string; body: string }[] = [
  { icon: Building2, who: "Institution", title: "Submits the deposit", body: "Types the details and uploads the FDR copy. These values are the Claimed tier." },
  { icon: FileSearch, who: "AI", title: "Reads the document", body: "Claude extracts each field with a confidence score into the Extracted tier. Nothing is auto-accepted." },
  { icon: Landmark, who: "Bank", title: "Confirms at source", body: "One click fetches the bank's record through the Account Aggregator interface: the Confirmed tier." },
  { icon: UserCheck, who: "AICTE officer", title: "Decides with evidence", body: "Mismatches are red, the queue is risk-sorted, and every pending case says why." },
  { icon: QrCode, who: "Anyone", title: "Verifies the NOC", body: "The lien-release NOC carries a QR. Banks scan it to check validity, revocation and tampering." },
];

const ROLES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Building2, title: "Institution", body: "Submit, renew, apply for release" },
  { icon: UserCheck, title: "Regulation Bureau", body: "Verify submissions, dashboard" },
  { icon: Users, title: "Regional Office", body: "Affidavit scrutiny" },
  { icon: Scale, title: "Finance / Legal cells", body: "Release clearances" },
  { icon: Gavel, title: "Competent Authority", body: "Approve release, issue NOCs" },
  { icon: Landmark, title: "Bank", body: "Verify NOCs, confirm lien lifted" },
  { icon: Settings, title: "Admin", body: "Rules, users, audit" },
];

const HONEST: string[] = [
  "Bank confirmation runs on a Mock AA sandbox that returns the same JSON shape a real Account Aggregator would.",
  "Hashes are anchored in the database today; the EVM ledger anchor arrives in Phase 3.",
  "A matching hash proves a record is unchanged, not that a bank issued it. Authenticity comes from the bank.",
  "AI extraction never auto-accepts. It fills the Extracted tier and an officer decides.",
  "Demo mode adds one-click sign-in for the demo accounts (still a signed session). All institutions, banks, people and documents are fictional and stamped SPECIMEN.",
];

const DEMO_ROLES: [string, string][] = [
  ["Institution", "Rakesh Tiwari"],
  ["AICTE officer", "Arjun Mehta"],
  ["Legal cell", "Rohini Kulkarni"],
  ["Competent Authority", "Dr. S. Raghavan"],
  ["Bank", "Suresh Iyer"],
];

const ROADMAP: [string, string][] = [
  ["P2", "Real authentication and full RO, cell and authority workflows"],
  ["P3", "EVM ledger anchoring for NOCs and revocations"],
  ["P4", "Live Account Aggregator (Setu / Finvu) and bank portal fallback"],
  ["P5", "Self-hosted PaddleOCR (English + Hindi) cross-checked with Claude"],
  ["P6", "Email, SMS and WhatsApp reminders with an escalation ladder"],
  ["P7", "Affidavit-6 generation, Aadhaar eSign, digitally signed NOC PDF"],
  ["P8", "Legacy Excel and portal import with duplicate merge"],
  ["P10", "Metrics: planted defects caught, turnaround with vs without AA"],
];

async function liveStats(lang: Lang) {
  try {
    const [instruments, institutions, discrepancies, nocs, events] = await Promise.all([
      db.instrument.count(),
      db.institution.count(),
      db.discrepancy.count({ where: { resolvedAt: null } }),
      db.noc.count(),
      db.event.count(),
    ]);
    return [
      { value: instruments, label: t(lang, "statDeposits") },
      { value: institutions, label: t(lang, "statInstitutions") },
      { value: discrepancies, label: t(lang, "statDiscrepancies") },
      { value: nocs, label: t(lang, "statNocs") },
      { value: events, label: t(lang, "statEvents") },
    ];
  } catch {
    return null;
  }
}

export default async function Landing() {
  const [user, lang] = await Promise.all([currentUser(), getLang()]);
  const stats = await liveStats(lang);
  const demo = isDemoMode();
  const cta = user ? { href: homeFor(user.role), label: t(lang, "openWorkspace") } : { href: "/login", label: t(lang, "tryDemo") };

  return (
    <GovFrame user={user} active="home">
      {/* hero */}
      <section className="relative overflow-hidden border-b bg-linear-to-b from-navy-soft to-background">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-28 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-16">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-saffron-deep">{t(lang, "heroEyebrow")}</div>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-navy sm:text-5xl">
              {t(lang, "heroTitleA")} <span className="text-gov-blue">{t(lang, "heroTitleB")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-foreground/80 sm:text-lg">{t(lang, "heroBody")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta.href} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                {cta.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-card px-5 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
                <QrCode className="size-4" aria-hidden />
                {t(lang, "navVerify")}
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/75">
              {["Three-tier verification", "Renewal chain X-ray", "QR-verifiable NOC"].map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-india-green" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">{t(lang, "heroNote")}</p>
          </div>

          {/* product preview */}
          <div className="relative">
            <div aria-hidden className="absolute -inset-3 rotate-2 rounded-3xl bg-gov-blue/10" />
            <div className="relative rounded-2xl border bg-card p-5 text-foreground shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">New submission · FDR</div>
                  <div className="mt-0.5 font-semibold">Ganga Valley School of Management</div>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">Risk 100 · High</span>
              </div>

              <div className="mt-4 rounded-xl border">
                <div className="grid grid-cols-3 gap-2 border-b bg-muted/40 px-3 py-2">
                  <TierBadge tier="CLAIMED" className="justify-self-start" />
                  <TierBadge tier="EXTRACTED" className="justify-self-start" />
                  <TierBadge tier="CONFIRMED" className="justify-self-start" />
                </div>
                <div className="px-3 pt-3 text-xs font-medium text-muted-foreground">Principal amount</div>
                <div className="grid grid-cols-3 gap-2 px-3 pb-3 pt-1">
                  <div className="font-semibold tabular-nums text-red-700">₹50,00,000</div>
                  <div>
                    <div className="font-semibold tabular-nums text-red-700">₹45,00,000</div>
                    <div className="mt-1 h-1 w-full rounded-full bg-muted">
                      <div className="h-1 w-[97%] rounded-full bg-blue-500" />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">Claude · 97%</div>
                  </div>
                  <div>
                    <div className="font-semibold tabular-nums text-red-700">₹45,00,000</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">Mock AA sandbox</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 border-t bg-red-50 px-3 py-2.5 text-xs text-red-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <strong className="font-semibold">Mismatch:</strong> institution claimed ₹50 L; the document and the bank both say ₹45 L.
                  </span>
                </div>
              </div>

              <ul className="mt-3 space-y-1.5 text-sm">
                {[
                  ["Bank", "Bharat Union Bank"],
                  ["FDR number", "BUB2026160022"],
                  ["Lien in favour of AICTE", "Yes, lien marked"],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-3 rounded-lg px-1">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="flex items-center gap-1.5 font-medium">
                      {v}
                      <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="all three sources match" />
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Clock className="size-3.5" aria-hidden />
                  Why is this pending?
                </div>
                <div className="mt-0.5">Awaiting the institution&apos;s response · owner: Institution</div>
              </div>
              <p className="mt-3 text-center text-[10px] text-muted-foreground">Specimen case from the demo dataset</p>
            </div>
          </div>
        </div>
      </section>

      {/* live numbers */}
      {stats && (
        <section className="relative z-10 mx-auto -mt-14 max-w-6xl px-4 sm:px-6 lg:-mt-20">
          <div className="card-surface grid grid-cols-2 divide-border overflow-hidden sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            {stats.map((s) => (
              <div key={s.label} className="p-5 last:col-span-2 sm:last:col-span-1">
                <div className="text-3xl font-semibold tabular-nums tracking-tight text-navy">{s.value.toLocaleString("en-IN")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">{t(lang, "liveFrom")} · {fmtDate(new Date())}</p>
        </section>
      )}

      {/* problem */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>{t(lang, "secProblem")}</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(lang, "secProblemTitle")}</h2>
            <ul className="mt-8 space-y-5">
              {[
                ["A deposit outlives its paperwork", "Over a decade an FDR is renewed, replaced and topped up. Each event is a new instrument that needs a fresh lien, and nothing links the chain."],
                ["Typed values look like verified ones", "Officers cannot tell what an institution entered from what a bank actually confirmed."],
                ["Records live everywhere", "Spreadsheets, email and a legacy portal, across lakhs of instruments."],
              ].map(([t, b]) => (
                <li key={t} className="flex gap-4">
                  <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <AlertTriangle className="size-3.5" aria-hidden />
                  </span>
                  <div>
                    <div className="font-semibold">{t}</div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-surface relative overflow-hidden p-6 sm:p-8">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-saffron" />
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ScrollText className="size-4" aria-hidden />
              AICTE notice, February 2019, on FDRs from 2010-11
            </div>
            <p className="mt-4 text-lg font-medium leading-relaxed">The notice lists three failures:</p>
            <ol className="mt-4 space-y-3">
              {["Banks not responding", "Interest not refunded", "Releases never applied for"].map((f, i) => (
                <li key={f} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                  <span className="font-mono text-sm font-semibold text-muted-foreground">0{i + 1}</span>
                  <span className="font-medium">{f}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-xl bg-navy p-5 text-white">
              <div className="text-xs font-medium uppercase tracking-wider text-white/60">One root cause</div>
              <p className="mt-1.5 text-lg font-semibold">No system says what each instrument needs next.</p>
              <p className="mt-1 text-sm text-white/70">This portal does.</p>
            </div>
          </div>
        </div>
      </section>

      {/* signature features */}
      <section id="features" className="scroll-mt-6 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <Eyebrow>{t(lang, "secFeatures")}</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(lang, "secFeaturesTitle")}</h2>
            <p className="mt-4 text-muted-foreground">Three ideas carry the design. Everything else supports them.</p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <BigFeature
              n="01"
              title="Three tiers on every field"
              body="Claimed by the institution, Extracted by AI with a confidence score, Confirmed by the bank. When they disagree, the field turns red and the officer sees why."
            >
              <div className="flex flex-wrap gap-2">
                <TierBadge tier="CLAIMED" />
                <TierBadge tier="EXTRACTED" />
                <TierBadge tier="CONFIRMED" />
                <TierBadge tier="MISMATCH" />
              </div>
            </BigFeature>

            <BigFeature
              n="02"
              title="Renewal chain X-ray"
              body="Every renewal, replacement and top-up is linked into one timeline. Coverage gaps, amount drops and missing liens are caught automatically."
            >
              <div className="space-y-1.5" aria-label="Example chain with a 47-day gap and an amount drop">
                <ChainBar left="0%" width="38%" label="₹50 L" />
                <ChainBar left="38%" width="30%" label="₹50 L" />
                <div className="relative h-6">
                  <div className="absolute inset-y-0 left-[68%] w-[5%] rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-red-300)_0_3px,transparent_3px_6px)]" />
                  <div className="absolute inset-y-0 left-[73%] flex w-[27%] items-center rounded-md border border-red-300 bg-red-50 px-2 text-[11px] font-semibold text-red-800">₹45 L ↓</div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-semibold">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">47-day gap</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">₹50 L → ₹45 L</span>
                </div>
              </div>
            </BigFeature>

            <BigFeature
              n="03"
              title="NOCs a bank can verify"
              body="Each lien-release NOC is SHA-256 anchored at issue and carries a QR. A public page shows whether it is valid or revoked, and catches a single changed byte."
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-900">
                  <ShieldCheck className="size-3.5" aria-hidden /> Valid NOC
                </div>
                <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 font-semibold text-red-900">
                  <AlertTriangle className="size-3.5" aria-hidden /> Revoked NOC: do not act on it
                </div>
                <div className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">sha256 6f7102732ad41f9314e87c02daed4c14f31dd0f5…</div>
              </div>
            </BigFeature>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-background p-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>{t(lang, "secHow")}</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(lang, "secHowTitle")}</h2>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card-surface relative p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-white">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <span className="font-mono text-sm font-semibold text-muted-foreground/60">0{i + 1}</span>
              </div>
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-primary">{s.who}</div>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-16">
          <h3 className="text-lg font-semibold">One portal, seven roles</h3>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <li key={r.title} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <r.icon className="size-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* honest boundaries + roadmap */}
      <section id="honest" className="scroll-mt-6 border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-28">
          <div>
            <Eyebrow>{t(lang, "secHonest")}</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t(lang, "secHonestTitle")}</h2>
            <p className="mt-4 text-muted-foreground">
              A prototype should say where it stops. The portal labels each of these in the interface too, and a reproducible evaluation reports what the engines actually catch:{" "}
              <Link href="/metrics" className="font-medium text-primary hover:underline">
                see the measured results
              </Link>
              .
            </p>
            <ul className="mt-8 space-y-3">
              {HONEST.map((h) => (
                <li key={h} className="flex gap-3 text-sm leading-relaxed">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-india-green" aria-hidden />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Eyebrow>{t(lang, "secRoadmap")}</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t(lang, "secRoadmapTitle")}</h2>
            <ul className="mt-8 divide-y rounded-xl border bg-background">
              {ROADMAP.map(([p, t]) => (
                <li key={p} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-10 shrink-0 font-mono text-xs font-semibold text-primary">{p}</span>
                  <span className="text-sm">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* for judges */}
      <section className="bg-gov-blue text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:py-16">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-saffron">{t(lang, "secJudges")}</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">{t(lang, "secJudgesTitle")}</h2>
            <p className="mt-3 max-w-xl text-white/80">{t(lang, "secJudgesBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={cta.href} className="inline-flex items-center gap-2 rounded-md bg-saffron px-5 py-3 text-sm font-semibold text-navy hover:bg-saffron/90">
                {cta.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-md border border-white/40 px-5 py-3 text-sm font-semibold hover:bg-white/10">
                {t(lang, "navVerify")}
              </Link>
            </div>
          </div>
          {demo && (
            <div className="rounded-xl border border-white/20 bg-white/10 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Demo accounts</div>
              <ul className="mt-3 divide-y divide-white/15 text-sm">
                {DEMO_ROLES.map(([role, who]) => (
                  <li key={role} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-white/80">{role}</span>
                    <span className="font-medium">{who}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-white/75">
                {t(lang, "demoPassword")}: <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-white">{demoPassword()}</code>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-6 px-4 py-16 sm:px-6 lg:py-20">
        <div className="text-center">
          <Eyebrow>{t(lang, "secFaq")}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy">{t(lang, "secFaqTitle")}</h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQ.map((f, i) => (
            <details key={i} className="group card-surface" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q[lang]}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="border-t px-5 py-4 text-sm leading-relaxed text-muted-foreground">{f.a[lang]}</p>
            </details>
          ))}
        </div>
      </section>
    </GovFrame>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{children}</div>;
}

function BigFeature({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border bg-background p-6">
      <span className="font-mono text-sm font-semibold text-saffron">{n}</span>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-auto pt-6">{children}</div>
    </div>
  );
}

function ChainBar({ left, width, label }: { left: string; width: string; label: string }) {
  return (
    <div className="relative h-6">
      <div className="absolute inset-y-0 flex items-center rounded-md border bg-navy-soft px-2 text-[11px] font-medium text-navy" style={{ left, width }}>
        {label}
      </div>
    </div>
  );
}

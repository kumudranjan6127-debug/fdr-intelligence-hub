import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
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

const ROADMAP: [string, string][] = [
  ["P2", "Real authentication and full RO, cell and authority workflows"],
  ["P3", "EVM ledger anchoring for NOCs and revocations"],
  ["P4", "Live Account Aggregator (Setu / Finvu) and bank portal fallback"],
  ["P5", "Self-hosted PaddleOCR (English + Hindi) cross-checked with Claude"],
  ["P6", "Email, SMS and WhatsApp reminders with an escalation ladder"],
  ["P7", "Affidavit-6 generation, Aadhaar eSign, NOC PDF with QR"],
  ["P8", "Legacy Excel and portal import with duplicate merge"],
  ["P10", "Metrics: planted defects caught, turnaround with vs without AA"],
];

async function liveStats() {
  try {
    const [instruments, institutions, discrepancies, nocs, events] = await Promise.all([
      db.instrument.count(),
      db.institution.count(),
      db.discrepancy.count({ where: { resolvedAt: null } }),
      db.noc.count(),
      db.event.count(),
    ]);
    return [
      { value: instruments, label: "deposits tracked" },
      { value: institutions, label: "institutions" },
      { value: discrepancies, label: "open discrepancies flagged" },
      { value: nocs, label: "NOCs verifiable by QR" },
      { value: events, label: "hash-chained audit events" },
    ];
  } catch {
    return null;
  }
}

export default async function Landing() {
  const [user, stats] = await Promise.all([currentUser(), liveStats()]);
  const cta = user ? { href: homeFor(user.role), label: "Open my workspace", short: "Workspace" } : { href: "/login", label: "Try the live demo", short: "Live demo" };

  return (
    <div className="min-h-screen bg-background">
      <div className="tricolor h-1 w-full" aria-hidden />

      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy text-[11px] font-bold tracking-tight text-white shadow-sm">FDR</span>
            <span className="leading-tight">
              <span className="block whitespace-nowrap text-[15px] font-semibold tracking-tight">FDR Intelligence Hub</span>
              <span className="block text-[11px] text-muted-foreground">AICTE · Security Deposits</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#honest" className="hover:text-foreground">Honest boundaries</a>
            <Link href="/metrics" className="hover:text-foreground">Results</Link>
            <Link href="/policy" className="hover:text-foreground">Rules</Link>
            <Link href="/verify" className="hover:text-foreground">Verify a NOC</Link>
          </nav>
          <Link href={cta.href} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <span className="sm:hidden">{cta.short}</span>
            <span className="hidden sm:inline">{cta.label}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-120 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-white/5" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-28 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-36 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="size-1.5 rounded-full bg-saffron" aria-hidden />
              Smart India Hackathon 2026 · SIH26265 · AICTE
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Security deposits, <span className="text-saffron">verified</span>, not just recorded.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              Technical institutions keep a security deposit with AICTE for 10 years. This portal shows who vouched for every field, checks every renewal chain automatically, and makes every
              lien-release NOC verifiable with one QR scan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta.href} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-navy shadow-sm hover:bg-white/90">
                {cta.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/verify" className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
                <QrCode className="size-4" aria-hidden />
                Verify a NOC
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/55">One-click demo accounts · fictional data · Mock AA sandbox</p>
          </div>

          {/* product preview */}
          <div className="relative">
            <div aria-hidden className="absolute -inset-4 rounded-3xl bg-saffron/10 blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-card p-5 text-foreground shadow-2xl">
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
          <p className="mt-2 text-center text-xs text-muted-foreground">Live from the demo database · all data fictional</p>
        </section>
      )}

      {/* problem */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Ten years, many renewals, and no single source of truth.</h2>
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
      <section id="features" className="scroll-mt-20 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl">
            <Eyebrow>What makes it different</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Verification first. Not another register.</h2>
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
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From submission to a NOC anyone can check.</h2>
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
      <section id="honest" className="scroll-mt-20 border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-28">
          <div>
            <Eyebrow>Honest boundaries</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">What is real, and what is a sandbox.</h2>
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
            <Eyebrow>Roadmap</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built to grow into production.</h2>
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

      {/* final call to action */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-96 rounded-full bg-white/5" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See it work in five minutes.</h2>
            <p className="mt-3 max-w-xl text-white/70">Sign in as an institution, an AICTE officer or a bank. Submit a deposit, catch a mismatch, issue a NOC and try to tamper with it.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={cta.href} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-white/90">
              {cta.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/verify" className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold hover:bg-white/10">
              Verify a NOC
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <span>Smart India Hackathon 2026 · SIH26265 · Streamline of Security Deposit / FDR Portal</span>
          <span>Prototype · fictional data · Mock AA sandbox · hashes anchored in DB (ledger in Phase 3)</span>
        </div>
      </footer>
    </div>
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

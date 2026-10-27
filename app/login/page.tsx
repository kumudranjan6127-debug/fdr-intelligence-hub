import type { Role } from "@prisma/client";
import { Building2, FileSearch, Gavel, Landmark, Scale, ScrollText, Settings, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROLE_LABEL } from "@/components/app-shell";
import { signInAs, signInWithPassword } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoPassword, isDemoMode, LOCKOUT_MINUTES } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ROLES: { role: Role; icon: LucideIcon; hint: string }[] = [
  { role: "INSTITUTION", icon: Building2, hint: "Submit deposits, track renewals, apply for release" },
  { role: "BUREAU", icon: UserCheck, hint: "Verify submissions · risk-sorted queue · dashboard" },
  { role: "RO", icon: Users, hint: "Affidavit scrutiny for the region" },
  { role: "CELL", icon: Scale, hint: "Finance / Legal / Grievance clearances" },
  { role: "AUTHORITY", icon: Gavel, hint: "Approve release · issue and revoke NOCs" },
  { role: "BANK", icon: Landmark, hint: "Verify NOCs · confirm lien lifted" },
  { role: "ADMIN", icon: Settings, hint: "Rules, users, audit" },
];

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileSearch, title: "Claimed · Extracted · Confirmed", body: "Institution, AI and bank values side by side on every field" },
  { icon: ScrollText, title: "Renewal chain X-ray", body: "Coverage gaps, amount drops and missing liens caught automatically" },
  { icon: Landmark, title: "Bank confirmation", body: "Account Aggregator interface (Mock AA sandbox in this prototype)" },
  { icon: ShieldCheck, title: "Verifiable NOC", body: "QR on every lien-release letter, with a byte-level tamper check" },
];

const ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: `Too many failed attempts. This account is locked for ${LOCKOUT_MINUTES} minutes.`,
  "demo-off": "One-click demo sign-in is turned off on this deployment. Use your email and password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demo = isDemoMode();
  const users = demo ? await db.user.findMany({ select: { email: true, name: true, role: true, designation: true, institution: { select: { name: true } }, bank: { select: { name: true } } }, orderBy: { name: "asc" } }) : [];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="tricolor fixed inset-x-0 top-0 z-10 h-1" aria-hidden />

      {/* brand panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-navy px-6 py-10 text-white sm:px-10 lg:sticky lg:top-0 lg:h-screen lg:w-[44%] lg:px-12 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white text-xs font-bold text-navy">FDR</span>
            <div className="leading-tight">
              <div className="text-lg font-semibold">FDR Intelligence Hub</div>
              <div className="text-xs text-white/70">All India Council for Technical Education · Regulation Bureau</div>
            </div>
          </div>
          <h1 className="mt-10 max-w-lg text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Every deposit field shows who vouched for it.</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/75">
            Institutions keep security deposits with AICTE for 10 years. In 2019, AICTE noted that FDRs from 2010-11 were still un-encashed, interest had not been refunded and releases had never
            been applied for, because nothing said what each instrument needed next. This portal does.
          </p>
          <ul className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <li key={p.title} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p.icon className="size-4 text-saffron" aria-hidden />
                <div className="mt-2 text-sm font-medium">{p.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-white/65">{p.body}</div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 text-xs text-white/55">Smart India Hackathon 2026 · SIH26265 · Prototype with fictional data</p>
      </section>

      {/* sign-in */}
      <section className="flex-1 bg-background px-4 py-10 sm:px-10 lg:py-12">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Signed session cookie · passwords hashed with scrypt · accounts lock after repeated failures.</p>

          <form action={signInWithPassword} className="card-surface mt-5 space-y-3 p-4">
            {error && ERRORS[error] && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                {ERRORS[error]}
              </p>
            )}
            <label className="block text-sm font-medium">
              Email
              <Input name="email" type="email" autoComplete="username" required className="mt-1 h-9" />
            </label>
            <label className="block text-sm font-medium">
              Password
              <Input name="password" type="password" autoComplete="current-password" required className="mt-1 h-9" />
            </label>
            <Button type="submit" className="h-9 w-full">
              Sign in
            </Button>
          </form>

          {demo && (
            <>
              <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold tracking-tight">Demo accounts</h2>
                <p className="text-xs text-muted-foreground">
                  Demo mode · one click signs you in · password for every account: <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoPassword()}</code>
                </p>
              </div>
          <div className="mt-3 space-y-3">
            {ROLES.map(({ role, icon: Icon, hint }) => {
              const list = users.filter((u) => u.role === role);
              if (!list.length) return null;
              return (
                <div key={role} className="card-surface p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{ROLE_LABEL[role]}</h3>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((u) => (
                      <form key={u.email} action={signInAs}>
                        <input type="hidden" name="email" value={u.email} />
                        <button className="group w-full rounded-lg border bg-background px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
                          <div className="text-sm font-medium group-hover:text-primary">{u.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.institution?.name ?? u.bank?.name ?? u.designation}</div>
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

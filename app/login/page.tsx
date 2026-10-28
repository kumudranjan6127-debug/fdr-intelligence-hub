import type { Role } from "@prisma/client";
import { Building2, FileSearch, Gavel, Landmark, Scale, ScrollText, Settings, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROLE_LABEL } from "@/components/app-shell";
import { BrandMark, GovFrame, PageBand } from "@/components/gov-chrome";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { signInAs, signInWithPassword } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoPassword, isDemoMode, LOCKOUT_MINUTES } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ROLES: { role: Role; icon: LucideIcon; hint: string }[] = [
  {
    role: "INSTITUTION",
    icon: Building2,
    hint: "Submit deposits, track renewals, apply for release",
  },
  {
    role: "BUREAU",
    icon: UserCheck,
    hint: "Verify submissions · risk-sorted queue · dashboard",
  },
  { role: "RO", icon: Users, hint: "Affidavit scrutiny for the region" },
  { role: "CELL", icon: Scale, hint: "Finance / Legal / Grievance clearances" },
  {
    role: "AUTHORITY",
    icon: Gavel,
    hint: "Approve release · issue and revoke NOCs",
  },
  { role: "BANK", icon: Landmark, hint: "Verify NOCs · confirm lien lifted" },
  { role: "ADMIN", icon: Settings, hint: "Rules, users, audit" },
];

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileSearch,
    title: "Claimed · Extracted · Confirmed",
    body: "Institution, AI and bank values side by side on every field",
  },
  {
    icon: ScrollText,
    title: "Renewal chain X-ray",
    body: "Coverage gaps, amount drops and missing liens caught automatically",
  },
  {
    icon: Landmark,
    title: "Bank confirmation",
    body: "Account Aggregator interface (Mock AA sandbox in this prototype)",
  },
  {
    icon: ShieldCheck,
    title: "Verifiable NOC",
    body: "QR on every lien-release letter, with a byte-level tamper check",
  },
];

const ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: `Too many failed attempts. This account is locked for ${LOCKOUT_MINUTES} minutes.`,
  "demo-off": "One-click demo sign-in is turned off on this deployment. Use your email and password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demo = isDemoMode();
  const lang = await getLang();
  const users = demo
    ? await db.user.findMany({
        select: {
          email: true,
          name: true,
          role: true,
          designation: true,
          institution: { select: { name: true } },
          bank: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <GovFrame user={null} active="signin">
      <PageBand crumbs={[{ label: t(lang, "navHome"), href: "/" }, { label: t(lang, "signInTitle") }]} title={t(lang, "signInTitle")} subtitle={t(lang, "signInSub")} />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        {/* about the portal */}
        <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white sm:px-8 lg:sticky lg:top-6">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-white p-1">
                <BrandMark className="size-10" />
              </span>
              <div className="leading-tight">
                <div className="text-lg font-semibold">FDR Intelligence Hub</div>
                <div lang="hi" className="text-sm font-semibold text-saffron">
                  एफडीआर इंटेलिजेंस हब
                </div>
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-semibold leading-tight tracking-tight">Every deposit field shows who vouched for it.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              Institutions keep security deposits with AICTE for 10 years. In 2019, AICTE noted that FDRs from 2010-11 were still un-encashed, interest had not been refunded and releases had never
              been applied for, because nothing said what each instrument needed next. This portal does.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {PILLARS.map((p) => (
                <li key={p.title} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                  <p.icon className="size-4 text-saffron" aria-hidden />
                  <div className="mt-2 text-sm font-medium">{p.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-white/65">{p.body}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* sign-in */}
        <section className="min-w-0">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{lang === "hi" ? "अपने खाते में साइन इन करें" : "Sign in to your account"}</h2>
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
    </GovFrame>
  );
}

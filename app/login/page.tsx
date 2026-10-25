import type { Role } from "@prisma/client";
import { Building2, FileSearch, Landmark, ShieldCheck } from "lucide-react";
import { AppShell, ROLE_LABEL } from "@/components/app-shell";
import { signInAs } from "@/app/actions";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ORDER: Role[] = ["INSTITUTION", "BUREAU", "RO", "CELL", "AUTHORITY", "BANK", "ADMIN"];
const HINT: Record<Role, string> = {
  INSTITUTION: "Submit deposits, track renewals, apply for release",
  BUREAU: "Verify submissions, risk-sorted queue, dashboard (PS owner)",
  RO: "Affidavit scrutiny for the region",
  CELL: "Finance / Legal / Grievance clearances on release",
  AUTHORITY: "Approve release, issue and revoke NOCs",
  BANK: "Verify NOCs, confirm lien lifted",
  ADMIN: "Rules, users, audit",
};

export default async function LoginPage() {
  const [users, me] = await Promise.all([db.user.findMany({ include: { institution: true, bank: true }, orderBy: { name: "asc" } }), currentUser()]);

  return (
    <AppShell user={me}>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium text-primary">SIH26265 · AICTE Regulation Bureau</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Every deposit field shows who vouched for it.</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Institutions keep security deposits with AICTE for 10 years. In 2019 AICTE publicly noted FDRs from 2010-11 still un-encashed, interest
              unrefunded and releases never applied for — because nothing said what each instrument needed next. This portal does.
            </p>
          </div>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              [Building2, "Claimed · Extracted · Confirmed", "Institution, AI and bank values side by side on every field"],
              [FileSearch, "Renewal chain X-ray", "Coverage gaps, amount drops and missing liens found automatically"],
              [Landmark, "Bank confirmation", "Account Aggregator interface — Mock AA sandbox in this prototype"],
              [ShieldCheck, "Verifiable NOC", "QR on every lien-release letter; tamper check against the anchored hash"],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Building2;
              return (
                <li key={t as string} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <I className="size-4 text-primary" aria-hidden />
                    {t as string}
                  </div>
                  <p className="mt-1 text-muted-foreground">{d as string}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Sign in as a demo user</h2>
          <p className="mb-4 text-sm text-muted-foreground">Prototype role switcher — no passwords. Real authentication arrives in Phase 2.</p>
          <div className="space-y-4">
            {ORDER.map((role) => {
              const list = users.filter((u) => u.role === role);
              if (!list.length) return null;
              return (
                <div key={role}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium">{ROLE_LABEL[role]}</h3>
                    <span className="text-xs text-muted-foreground">{HINT[role]}</span>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {list.map((u) => (
                      <form key={u.id} action={signInAs}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-primary/5">
                          <div className="font-medium">{u.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.institution?.name ?? u.bank?.name ?? u.designation}</div>
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

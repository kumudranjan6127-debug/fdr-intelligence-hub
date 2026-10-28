import { redirect } from "next/navigation";
import { QrCode, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Verify a NOC" };
export const dynamic = "force-dynamic";

export default async function VerifyIndex({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code?.trim()) redirect(`/verify/${encodeURIComponent(code.trim().toUpperCase())}`);
  const [user, lang] = await Promise.all([currentUser(), getLang()]);
  return (
    <PublicShell
      user={user}
      active="verify"
      band={{ crumbs: [{ label: t(lang, "navHome"), href: "/" }, { label: t(lang, "navVerify") }], title: t(lang, "verifyTitle"), subtitle: t(lang, "verifySub") }}
    >
      <div className="card-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          NOC number
        </h2>
        <form action="/verify" className="mt-3 flex gap-2">
          <Input name="code" placeholder="NOC-2026-…" aria-label="NOC number" className="h-10" required />
          <Button type="submit" className="h-10 px-5">
            {t(lang, "verifyButton")}
          </Button>
        </form>
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden />
          The check re-computes the NOC record&apos;s SHA-256, compares it with the anchor taken at issue, and shows whether the NOC is valid or revoked. A matching hash proves the record is
          unchanged, not that a bank issued the underlying FDR.
        </p>
      </div>
    </PublicShell>
  );
}

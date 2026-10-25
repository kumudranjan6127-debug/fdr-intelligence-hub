import { redirect } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Verify a NOC" };
export const dynamic = "force-dynamic";

export default async function VerifyIndex({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code?.trim()) redirect(`/verify/${encodeURIComponent(code.trim().toUpperCase())}`);
  const user = await currentUser();
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-xl">
        <PageHeader title="Verify a lien-release NOC" subtitle="Scan the QR on the letter, or enter the NOC number printed under the title." />
        <form action="/verify" className="flex gap-2">
          <Input name="code" placeholder="NOC-2026-…" aria-label="NOC number" className="h-9" required />
          <Button type="submit" className="h-9">
            Verify
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

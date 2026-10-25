import { redirect } from "next/navigation";
import { PortalShell } from "@/components/app-shell";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <PortalShell user={user}>{children}</PortalShell>;
}

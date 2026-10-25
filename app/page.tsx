import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/session";

export default async function Home() {
  const u = await currentUser();
  redirect(u ? homeFor(u.role) : "/login");
}

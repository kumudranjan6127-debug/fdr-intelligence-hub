"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FilePlus2, Inbox, Landmark, LayoutDashboard, Menu, ScrollText, ShieldCheck, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  inbox: Inbox,
  dashboard: LayoutDashboard,
  audit: ScrollText,
  verify: ShieldCheck,
  wallet: Wallet,
  submit: FilePlus2,
  bank: Landmark,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

function isActive(pathname: string, href: string, items: NavItem[]) {
  if (pathname === href) return true;
  if (items.some((i) => i.href === pathname)) return false;
  // the longest matching prefix wins, so /institution/submit doesn't also light up /institution
  const best = items.filter((i) => pathname.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === href;
}

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((n) => {
        const Icon = ICONS[n.icon];
        const active = isActive(pathname, n.href, items) || (n.href === "/officer" && pathname.startsWith("/officer/"));
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/8 text-primary" : "text-foreground/75 hover:bg-muted hover:text-foreground",
              )}
            >
              {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
              <Icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ items, userName, role }: { items: NavItem[]; userName: string; role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border p-2 hover:bg-muted" aria-label="Open menu" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="leading-tight">
                <div className="text-sm font-medium">{userName}</div>
                <div className="text-xs text-muted-foreground">{role}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav items={items} onNavigate={() => setOpen(false)} />
            <a href="/login" className="mt-auto rounded-lg border px-3 py-2 text-center text-sm font-medium hover:bg-muted">
              Switch user
            </a>
          </div>
        </div>
      )}
    </>
  );
}

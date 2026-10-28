"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpenCheck,
  ChevronDown,
  Database,
  FilePlus2,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldCheck,
  Undo2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  inbox: Inbox,
  dashboard: LayoutDashboard,
  audit: ScrollText,
  verify: ShieldCheck,
  wallet: Wallet,
  submit: FilePlus2,
  bank: Landmark,
  registry: Database,
  release: Undo2,
  bell: Bell,
  guide: BookOpenCheck,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

/** The item whose href best matches the current URL (path first, then query) is active. */
function activeHref(pathname: string, query: string, items: NavItem[]) {
  const score = (href: string) => {
    const [path, q] = href.split("?");
    if (pathname !== path && !pathname.startsWith(path + "/")) return -1;
    let s = path.length * 10;
    if (q) {
      const want = new URLSearchParams(q);
      const have = new URLSearchParams(query);
      for (const [k, v] of want) {
        if (have.get(k) !== v) return -1;
        s += 5;
      }
    }
    return s;
  };
  let best: string | null = null;
  let bestScore = -1;
  for (const i of items) {
    const sc = score(i.href);
    if (sc > bestScore) [best, bestScore] = [i.href, sc];
  }
  return best;
}

/** The blue menu bar of the signed-in portal. Scrolls sideways on small screens. */
export function PortalNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const active = activeHref(pathname, query, items);
  return (
    <nav aria-label={label} className="bg-gov-blue text-white">
      <ul className="mx-auto flex max-w-350 overflow-x-auto px-2 sm:px-4 lg:px-6">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          const on = n.href === active;
          return (
            <li key={n.href} className="shrink-0">
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-[3px] border-transparent px-3.5 py-3 text-sm font-medium text-white/95 hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
                  on && "border-saffron bg-white/12 font-semibold text-white",
                )}
              >
                <Icon className="size-4 opacity-85" aria-hidden />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function UserMenu({
  name,
  initials,
  role,
  org,
  homeHref,
  signOut,
}: {
  name: string;
  initials: string;
  role: string;
  org: string;
  homeHref: string;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-full border bg-card py-1 pl-1 pr-2.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-navy-soft text-xs font-bold text-navy">{initials}</span>
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block max-w-44 truncate text-sm font-semibold">{name}</span>
          <span className="block max-w-44 truncate text-[11px] text-muted-foreground">{org || role}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border bg-card p-1.5 shadow-lg">
          <div className="border-b px-3 pb-2.5 pt-1.5">
            <div className="text-sm font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground">{role}</div>
            {org && <div className="mt-0.5 truncate text-xs text-muted-foreground">{org}</div>}
          </div>
          <div className="py-1">
            <Link role="menuitem" href={homeHref} className={item}>
              <LayoutDashboard className="size-4 text-muted-foreground" aria-hidden />
              My home
            </Link>
            <Link role="menuitem" href="/notifications" className={item}>
              <Bell className="size-4 text-muted-foreground" aria-hidden />
              Notifications
            </Link>
            <Link role="menuitem" href="/demo" className={item}>
              <BookOpenCheck className="size-4 text-muted-foreground" aria-hidden />
              Judge&apos;s demo guide
            </Link>
          </div>
          <form action={signOut} className="border-t pt-1">
            <button role="menuitem" className={cn(item, "w-full text-red-700")}>
              <LogOut className="size-4" aria-hidden />
              Switch user / sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

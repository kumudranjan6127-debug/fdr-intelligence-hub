"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Contrast } from "lucide-react";
import { CONTRAST_KEY, SIZE_KEY } from "@/lib/a11y";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Accessibility controls in the top bar (GIGW style): text size, high contrast, language.
// Size and contrast are per-browser preferences kept in localStorage; an inline script in the root
// layout applies them before first paint (lib/a11y.ts).
type Size = "sm" | "md" | "lg";

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function A11yControls({ labels }: { labels: { smaller: string; normal: string; larger: string; contrast: string } }) {
  const [size, setSize] = useState<Size>("md");
  const [high, setHigh] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    setSize((el.dataset.text as Size) || "md");
    setHigh(el.dataset.contrast === "high");
  }, []);

  const pickSize = (s: Size) => {
    setSize(s);
    if (s === "md") delete document.documentElement.dataset.text;
    else document.documentElement.dataset.text = s;
    store(SIZE_KEY, s === "md" ? null : s);
  };
  const toggleContrast = () => {
    const next = !high;
    setHigh(next);
    if (next) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
    store(CONTRAST_KEY, next ? "high" : null);
  };

  const btn = "rounded px-1.5 py-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/20";
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" className={cn(btn, "text-[11px]")} aria-label={labels.smaller} aria-pressed={size === "sm"} onClick={() => pickSize("sm")}>
        A-
      </button>
      <button type="button" className={cn(btn, "text-xs")} aria-label={labels.normal} aria-pressed={size === "md"} onClick={() => pickSize("md")}>
        A
      </button>
      <button type="button" className={cn(btn, "text-sm")} aria-label={labels.larger} aria-pressed={size === "lg"} onClick={() => pickSize("lg")}>
        A+
      </button>
      <span className="mx-1.5 h-3.5 w-px bg-white/25" aria-hidden />
      <button type="button" className={btn} aria-label={labels.contrast} aria-pressed={high} title={labels.contrast} onClick={toggleContrast}>
        <Contrast className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const pick = (l: Lang) => {
    if (l === lang) return;
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    router.refresh();
  };
  const btn = "rounded px-2 py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-white";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language / भाषा">
      <button type="button" lang="en" aria-pressed={lang === "en"} onClick={() => pick("en")} className={cn(btn, lang === "en" ? "bg-white text-navy" : "hover:bg-white/15")}>
        English
      </button>
      <button type="button" lang="hi" aria-pressed={lang === "hi"} onClick={() => pick("hi")} className={cn(btn, lang === "hi" ? "bg-white text-navy" : "hover:bg-white/15")}>
        हिंदी
      </button>
    </div>
  );
}


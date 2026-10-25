"use client";
// Tamper evidence: hash a copy in the browser and compare it with the hashes anchored at NOC issue.
import { useState } from "react";
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Anchored = { kind: string; sha256: string; fileId: string | null };
type Result = { label: string; sha256: string; match: Anchored | null };

async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function CopyChecker({ anchored }: { anchored: Anchored[] }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(buf: ArrayBuffer, label: string) {
    const h = await sha256(buf);
    setResult({ label, sha256: h, match: anchored.find((a) => a.sha256 === h) ?? null });
  }

  async function demo(tamper: boolean) {
    const target = anchored.find((a) => a.fileId);
    if (!target) return;
    setBusy(true);
    try {
      const buf = await (await fetch(`/api/files/${target.fileId}`)).arrayBuffer();
      if (tamper) {
        const bytes = new Uint8Array(buf);
        const i = Math.floor(bytes.length / 2);
        bytes[i] = bytes[i] ^ 0x01; // flip one bit of one byte
        await check(bytes.buffer, `${target.kind} with one byte changed (at offset ${i})`);
      } else await check(buf, `${target.kind} as anchored`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Check a copy you hold</h2>
      <p className="text-sm text-muted-foreground">Choose the FDR copy or affidavit you received. It is hashed in your browser (SHA-256) — nothing is uploaded.</p>
      <input
        type="file"
        className="mt-3 block text-sm"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await check(await f.arrayBuffer(), f.name);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <FlaskConical className="size-3.5" aria-hidden /> Demo:
        </span>
        <Button type="button" size="sm" variant="outline" disabled={busy || !anchored.some((a) => a.fileId)} onClick={() => demo(false)}>
          Check the anchored copy
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !anchored.some((a) => a.fileId)} onClick={() => demo(true)}>
          Flip one byte &amp; re-check
        </Button>
      </div>
      {result && (
        <div role="status" className={`mt-3 rounded-lg border p-3 text-sm ${result.match ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950"}`}>
          <div className="flex items-center gap-2 font-medium">
            {result.match ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {result.match ? `Matches the anchored ${result.match.kind}` : "Hash mismatch — this copy is not the document anchored at issue"}
          </div>
          <div className="mt-1 text-xs">{result.label}</div>
          <div className="break-all font-mono text-[11px]">{result.sha256}</div>
        </div>
      )}
    </section>
  );
}

"use client";
// Guided wizard: type → details (claimed) → upload (AI extracts) → confirm field-by-field → submit.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FilePlus2, FileSearch, Globe, Landmark, Loader2, RefreshCw, Replace, Upload } from "lucide-react";
import { submitInstrument, uploadForExtraction, uploadPlain, type UploadResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TierBadge } from "@/components/badges";
import type { ExtractionResult } from "@/lib/extract";
import { FIELD_LABELS, valuesEqual, type FieldKey, type FieldValue } from "@/lib/provenance";
import { cn } from "@/lib/utils";

export type PredecessorOption = {
  id: string;
  code: string;
  type: "FDR" | "ONLINE_DEPOSIT";
  status: string;
  label: string;
  bankName: string;
  amountRupees: number;
  maturityDate: string | null;
};

type Claimed = { bankName: string; fdrNumber: string; amountRupees: string; issueDate: string; maturityDate: string; lienNoted: boolean };
type Uploaded = Exclude<UploadResult, { error: string }>;

const STEPS = ["Type", "Details", "Upload & extract", "Confirm"] as const;

const inr = (r: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(r);

/** Claimed form value → the canonical tier value used for comparison. */
function claimedValue(k: FieldKey, c: Claimed): FieldValue {
  if (k === "amount") return c.amountRupees ? String(Math.round(Number(c.amountRupees.replace(/,/g, "")) * 100)) : null;
  if (k === "lienNoted") return c.lienNoted;
  return c[k] || null;
}

function displayValue(k: FieldKey, v: FieldValue): string {
  if (v === null || v === "") return "—";
  if (k === "amount") return inr(Number(v) / 100);
  if (k === "lienNoted") return v === true || v === "true" ? "Yes" : "No";
  return String(v);
}

export function SubmitWizard(props: {
  predecessors: PredecessorOption[];
  initialPredecessor: string | null;
  banks: string[];
  requiredRupees: number;
  samples: { file: string; title: string; hint: string }[];
  affidavitWindowDays: number;
}) {
  const router = useRouter();
  const initialPred = props.predecessors.find((p) => p.id === props.initialPredecessor) ?? null;
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"FDR" | "ONLINE_DEPOSIT">(initialPred?.type ?? "FDR");
  const [caseType, setCaseType] = useState<"NEW_SUBMISSION" | "RENEWAL" | "REPLACEMENT">(initialPred ? "RENEWAL" : "NEW_SUBMISSION");
  const [predecessorId, setPredecessorId] = useState<string | null>(initialPred?.id ?? null);
  const [claimed, setClaimed] = useState<Claimed>({
    bankName: initialPred?.bankName ?? "",
    fdrNumber: "",
    amountRupees: initialPred ? String(initialPred.amountRupees) : "",
    issueDate: initialPred?.maturityDate ?? "",
    maturityDate: "",
    lienNoted: true,
  });
  const [upload, setUpload] = useState<Uploaded | null>(null);
  const [affidavit, setAffidavit] = useState<Uploaded | null>(null);
  const [autoFilled, setAutoFilled] = useState<Set<FieldKey>>(new Set());
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const keys: FieldKey[] = type === "FDR" ? ["bankName", "fdrNumber", "amount", "issueDate", "maturityDate", "lienNoted"] : ["bankName", "fdrNumber", "amount", "issueDate", "maturityDate"];
  const pred = props.predecessors.find((p) => p.id === predecessorId) ?? null;
  const set = (k: keyof Claimed, v: string | boolean) => {
    setClaimed((c) => ({ ...c, [k]: v }));
    setAutoFilled((s) => {
      const n = new Set(s);
      n.delete((k === "amountRupees" ? "amount" : k) as FieldKey);
      return n;
    });
  };

  const detailsError = useMemo(() => {
    if (claimed.bankName.trim().length < 2) return "Enter the bank name";
    if (claimed.fdrNumber.trim().length < 3) return "Enter the FDR / transaction number";
    if (!(Number(claimed.amountRupees) > 0)) return "Enter the principal amount";
    if (!claimed.issueDate || !claimed.maturityDate) return "Enter issue and maturity dates";
    return null;
  }, [claimed]);

  function applyExtraction(ex: ExtractionResult, overwriteEmptyOnly: boolean) {
    const filled = new Set<FieldKey>();
    setClaimed((c) => {
      const n = { ...c };
      for (const k of keys) {
        const v = ex.fields[k]?.value;
        if (v === null || v === undefined) continue;
        const current = claimedValue(k, c);
        if (overwriteEmptyOnly && current !== null && current !== "" && k !== "lienNoted") continue;
        if (overwriteEmptyOnly && k === "lienNoted") continue;
        if (k === "amount") n.amountRupees = String(Number(v) / 100);
        else if (k === "lienNoted") n.lienNoted = v === true;
        else (n as Record<string, unknown>)[k] = String(v);
        filled.add(k);
      }
      return n;
    });
    setAutoFilled((s) => new Set([...s, ...filled]));
  }

  async function doUpload(file: File, kind: "fdr" | "affidavit") {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = kind === "fdr" ? await uploadForExtraction(fd) : await uploadPlain(fd);
      if ("error" in res) return setError(res.error);
      if (kind === "fdr") {
        setUpload(res);
        if (res.extraction) applyExtraction(res.extraction, true);
      } else setAffidavit(res);
    });
  }

  async function loadSample(file: string) {
    const blob = await (await fetch(`/samples/${file}`)).blob();
    await doUpload(new File([blob], file, { type: "application/pdf" }), "fdr");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitInstrument({
        type,
        caseType,
        predecessorId: caseType === "NEW_SUBMISSION" ? null : predecessorId,
        claimed: {
          bankName: claimed.bankName.trim(),
          fdrNumber: claimed.fdrNumber.trim(),
          amountRupees: Number(claimed.amountRupees.replace(/,/g, "")),
          issueDate: claimed.issueDate,
          maturityDate: claimed.maturityDate,
          lienNoted: type === "FDR" ? claimed.lienNoted : null,
        },
        upload: upload?.extraction ? { fileId: upload.fileId, extraction: upload.extraction } : null,
        affidavitFileId: affidavit?.fileId ?? null,
      });
      if ("error" in res) return setError(res.error);
      router.push(`/institution/instruments/${res.instrumentId}?submitted=1`);
    });
  }

  const ex = upload?.extraction ?? null;
  const mismatches = ex ? keys.filter((k) => ex.fields[k]?.value !== null && ex.fields[k]?.value !== undefined && !valuesEqual(k, claimedValue(k, claimed), ex.fields[k].value)) : [];
  const amountShort = Number(claimed.amountRupees) > 0 && Number(claimed.amountRupees) < props.requiredRupees;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 lg:flex-col" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                i === step ? "border-primary bg-primary/5 font-medium" : i < step ? "bg-card hover:bg-muted" : "bg-muted/40 text-muted-foreground",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px]", i < step ? "bg-primary text-primary-foreground" : "border")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="card-surface p-6">
        {step === 0 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Instrument type</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["FDR", "Fixed Deposit Receipt", "FD at a bank in favour of Member Secretary, AICTE, with lien marked", Landmark],
                    ["ONLINE_DEPOSIT", "Online deposit", "Paid through the AICTE portal to AICTE's account (since 2019-20)", Globe],
                  ] as const
                ).map(([v, t, d, Icon]) => (
                  <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 transition hover:border-primary/40", type === v && "border-primary bg-primary/5 ring-1 ring-primary")}>
                    <input type="radio" name="type" className="sr-only" checked={type === v} onChange={() => setType(v)} />
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", type === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium">{t}</span>
                      <span className="block text-xs text-muted-foreground">{d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Why are you submitting?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["NEW_SUBMISSION", "New deposit", "New institution or added programmes", FilePlus2],
                    ["RENEWAL", "Renewal", "Same deposit renewed on maturity", RefreshCw],
                    ["REPLACEMENT", "Replacement", "Bank change, early maturity or re-issue", Replace],
                  ] as const
                ).map(([v, t, d, Icon]) => (
                  <label
                    key={v}
                    className={cn(
                      "cursor-pointer rounded-xl border p-4 transition hover:border-primary/40",
                      caseType === v && "border-primary bg-primary/5 ring-1 ring-primary",
                      v !== "NEW_SUBMISSION" && !props.predecessors.length && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input type="radio" name="caseType" className="sr-only" checked={caseType === v} disabled={v !== "NEW_SUBMISSION" && !props.predecessors.length} onChange={() => setCaseType(v)} />
                    <Icon className={cn("mb-2 size-4", caseType === v ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <div className="font-medium">{t}</div>
                    <div className="text-xs text-muted-foreground">{d}</div>
                  </label>
                ))}
              </div>
            </fieldset>
            {caseType !== "NEW_SUBMISSION" && (
              <div>
                <Label htmlFor="pred">Instrument being {caseType === "RENEWAL" ? "renewed" : "replaced"}</Label>
                <select
                  id="pred"
                  className="mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-sm"
                  value={predecessorId ?? ""}
                  onChange={(e) => {
                    const p = props.predecessors.find((x) => x.id === e.target.value) ?? null;
                    setPredecessorId(p?.id ?? null);
                    if (p) setClaimed((c) => ({ ...c, bankName: c.bankName || p.bankName, amountRupees: c.amountRupees || String(p.amountRupees), issueDate: c.issueDate || p.maturityDate || "" }));
                  }}
                >
                  <option value="">Select…</option>
                  {props.predecessors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">The new instrument is linked into the renewal chain; gaps in cover and amount drops are checked automatically.</p>
              </div>
            )}
            <Nav onNext={() => setStep(1)} nextDisabled={caseType !== "NEW_SUBMISSION" && !predecessorId} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the details exactly as you know them. These become the <TierBadge tier="CLAIMED" /> values; the uploaded document and the bank will be compared against them.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={type === "FDR" ? "Bank" : "Collecting bank"} htmlFor="bank">
                <Input id="bank" list="banks" value={claimed.bankName} onChange={(e) => set("bankName", e.target.value)} autoComplete="off" />
                <datalist id="banks">
                  {props.banks.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
              <Field label={type === "FDR" ? "FDR / receipt number" : "Transaction reference"} htmlFor="no">
                <Input id="no" value={claimed.fdrNumber} onChange={(e) => set("fdrNumber", e.target.value)} />
              </Field>
              <Field label="Principal amount (₹)" htmlFor="amt" hint={`Required: ${inr(props.requiredRupees)}${pred ? ` · predecessor ${inr(pred.amountRupees)}` : ""}`}>
                <Input id="amt" inputMode="numeric" value={claimed.amountRupees} onChange={(e) => set("amountRupees", e.target.value)} />
              </Field>
              <div />
              <Field label={type === "FDR" ? "Date of deposit" : "Payment date"} htmlFor="iss" hint={pred?.maturityDate ? `Predecessor matures ${pred.maturityDate} — start on or before it to avoid a gap` : undefined}>
                <Input id="iss" type="date" value={claimed.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
              </Field>
              <Field label={type === "FDR" ? "Date of maturity" : "End of holding term"} htmlFor="mat">
                <Input id="mat" type="date" value={claimed.maturityDate} onChange={(e) => set("maturityDate", e.target.value)} />
              </Field>
              {type === "FDR" && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={claimed.lienNoted} onChange={(e) => set("lienNoted", e.target.checked)} />
                  Lien is marked in favour of Member Secretary, AICTE
                </label>
              )}
            </div>
            {amountShort && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">This amount is below the required deposit — the submission will be flagged.</p>}
            <p className="text-xs text-muted-foreground">You can also skip ahead: upload the document first and empty fields are filled from it for you to confirm.</p>
            <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-medium">Upload the {type === "FDR" ? "FDR copy" : "payment acknowledgement"}</h2>
              <p className="text-sm text-muted-foreground">PDF, PNG or JPEG up to 4 MB. AI reads it into the <TierBadge tier="EXTRACTED" /> tier — nothing is accepted automatically. A SHA-256 is recorded on upload.</p>
            </div>
            <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.02] p-8 text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5", busy && "pointer-events-none opacity-60")}>
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
              {busy ? "Reading document…" : upload ? `Replace ${upload.filename}` : "Choose a file"}
              <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0], "fdr")} />
            </label>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Or use a specimen (fictional bank, stamped SPECIMEN):</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {props.samples.map((s) => (
                  <button
                    key={s.file}
                    type="button"
                    disabled={busy}
                    onClick={() => loadSample(s.file)}
                    className="flex items-start gap-2.5 rounded-lg border bg-background px-3 py-2 text-left text-xs transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                    title={s.hint}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded bg-red-50 text-[9px] font-bold text-red-700">PDF</span>
                    <span>
                      <span className="block font-medium">{s.title}</span>
                      <span className="block text-muted-foreground">{s.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {upload && ex && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <FileSearch className="size-4 text-blue-700" aria-hidden /> Extracted by {ex.engine}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground" title={upload.sha256}>
                    SHA-256 {upload.sha256.slice(0, 16)}…
                  </span>
                </div>
                {ex.notes && <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">{ex.notes}</p>}
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2">
                          <TierBadge tier="CLAIMED" />
                        </th>
                        <th className="px-3 py-2">
                          <TierBadge tier="EXTRACTED" />
                        </th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => {
                        const e = ex.fields[k];
                        const cv = claimedValue(k, claimed);
                        const bad = e?.value !== null && e?.value !== undefined && !valuesEqual(k, cv, e.value);
                        return (
                          <tr key={k} className={cn("border-t", bad && "bg-red-50")}>
                            <th scope="row" className="px-3 py-2 text-left font-medium">
                              {FIELD_LABELS[k]}
                            </th>
                            <td className={cn("px-3 py-2", bad && "font-semibold text-red-800")}>
                              {displayValue(k, cv)}
                              {autoFilled.has(k) && <span className="ml-1 text-[11px] font-normal text-blue-800">(filled from document — please confirm)</span>}
                            </td>
                            <td className="px-3 py-2">
                              {displayValue(k, e?.value ?? null)}
                              {e && e.value !== null && <span className="ml-1 text-[11px] text-muted-foreground">{Math.round(e.confidence * 100)}%</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {bad ? (
                                <button
                                  type="button"
                                  className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100"
                                  onClick={() => {
                                    if (k === "amount") set("amountRupees", String(Number(e!.value) / 100));
                                    else if (k === "lienNoted") set("lienNoted", e!.value === true);
                                    else set(k as keyof Claimed, String(e!.value));
                                  }}
                                >
                                  Use document value
                                </button>
                              ) : e?.value !== null && e?.value !== undefined ? (
                                <span className="text-xs text-emerald-800">✓ matches</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">not read</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {mismatches.length > 0 && (
                  <p className="text-xs text-red-800">
                    {mismatches.length} field{mismatches.length > 1 ? "s differ" : " differs"} from the document. You may keep your value — the officer will see both, side by side.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border p-3">
              <div className="text-sm font-medium">Affidavit-3 (optional now, due within {props.affidavitWindowDays} days)</div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0], "affidavit")} />
                {affidavit && <span className="text-emerald-800">✓ {affidavit.filename}</span>}
              </div>
            </div>

            <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={busy || !!detailsError} nextLabel={detailsError ?? "Review"} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-medium">Review and submit</h2>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                {type === "FDR" ? "Fixed Deposit Receipt" : "Online deposit"} · {caseType.replace("_", " ").toLowerCase()}
                {pred ? ` of ${pred.code}` : ""}
              </dd>
              {keys.map((k) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{FIELD_LABELS[k]}</dt>
                  <dd className={cn(mismatches.includes(k) && "font-medium text-red-800")}>
                    {displayValue(k, claimedValue(k, claimed))}
                    {mismatches.includes(k) && ex && ` (document reads ${displayValue(k, ex.fields[k].value)})`}
                  </dd>
                </div>
              ))}
              <dt className="text-muted-foreground">Documents</dt>
              <dd>{[upload ? `FDR copy (${upload.filename})` : "no FDR copy", affidavit ? "Affidavit-3" : "Affidavit-3 pending"].join(" · ")}</dd>
            </dl>
            <label className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
              I confirm these details are true. I understand the deposit is held in favour of the Member Secretary, AICTE, that interest accrues to AICTE, and that it
              cannot be encashed without AICTE&apos;s NOC.
            </label>
            <Nav onBack={() => setStep(2)} onNext={submit} nextDisabled={busy || !declared || !!detailsError} nextLabel={busy ? "Submitting…" : "Submit to AICTE"} />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled, nextLabel = "Continue" }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between gap-2 border-t pt-4">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel} <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}

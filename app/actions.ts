"use server";
// Server actions. Zod on every input; role checks happen server-side in each command.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DocumentKind } from "@prisma/client";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/errors";
import { extractFdr, type ExtractionResult } from "@/lib/extract";
import { makeAffidavitPdf } from "@/lib/samples";
import { SESSION_COOKIE, homeFor, requireRole } from "@/lib/session";
import { storeFile } from "@/lib/storage";
import { CASE_ACTIONS, TransitionError, type CaseAction } from "@/lib/transitions";
import { toDay } from "@/lib/format";
import { runMaturityJob, type MaturityJobResult } from "@/lib/services/maturity";
import { addInstrumentDocument, applyForRelease, createSubmission, decideClearance, fetchBankConfirmation, performCaseAction, revokeNoc } from "@/lib/services/workflow";

export type ActionState = { error?: string; ok?: string } | null;

function messageOf(e: unknown): string {
  if (e instanceof AuthError || e instanceof TransitionError) return e.message;
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (e instanceof Error && /larger than|Unsupported file type/.test(e.message)) return e.message;
  console.error(e);
  return "Something went wrong — the change was not saved.";
}

async function guard(fn: () => Promise<string | void>, paths: string[] = []): Promise<ActionState> {
  try {
    const ok = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: ok || "Done" };
  } catch (e) {
    return { error: messageOf(e) };
  }
}

// ───────── session ─────────

export async function signInAs(formData: FormData) {
  const userId = z.string().min(1).parse(formData.get("userId"));
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect(homeFor(user.role));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ───────── uploads ─────────

export type UploadResult = { fileId: string; sha256: string; filename: string; size: number; extraction: ExtractionResult | null } | { error: string };

async function fileFrom(formData: FormData, key = "file") {
  const f = formData.get(key);
  if (!(f instanceof File) || f.size === 0) throw new TransitionError("Choose a file to upload");
  return f;
}

/** Wizard step 3: store the FDR copy and run extraction. Result lands in the `extracted` tier only. */
export async function uploadForExtraction(formData: FormData): Promise<UploadResult> {
  try {
    await requireRole(["INSTITUTION"]);
    const f = await fileFrom(formData);
    const buf = Buffer.from(await f.arrayBuffer());
    const stored = await storeFile(db, buf, f.name, f.type || "application/pdf");
    const extraction = await extractFdr(buf, stored.mime);
    return { fileId: stored.id, sha256: stored.sha256, filename: stored.filename, size: stored.size, extraction };
  } catch (e) {
    return { error: messageOf(e) };
  }
}

export async function uploadPlain(formData: FormData): Promise<UploadResult> {
  try {
    await requireRole(["INSTITUTION"]);
    const f = await fileFrom(formData);
    const stored = await storeFile(db, Buffer.from(await f.arrayBuffer()), f.name, f.type || "application/pdf");
    return { fileId: stored.id, sha256: stored.sha256, filename: stored.filename, size: stored.size, extraction: null };
  } catch (e) {
    return { error: messageOf(e) };
  }
}

// ───────── submission wizard ─────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const fieldValue = z.union([z.string(), z.boolean(), z.null()]);
const SubmissionSchema = z.object({
  type: z.enum(["FDR", "ONLINE_DEPOSIT"]),
  caseType: z.enum(["NEW_SUBMISSION", "RENEWAL", "REPLACEMENT"]),
  predecessorId: z.string().nullable(),
  claimed: z.object({
    bankName: z.string().trim().min(2, "bank name is required"),
    fdrNumber: z.string().trim().min(3, "FDR / transaction number is required"),
    amountRupees: z.number().positive("amount must be positive").max(1e10),
    issueDate: day,
    maturityDate: day,
    lienNoted: z.boolean().nullable(),
  }),
  upload: z
    .object({
      fileId: z.string(),
      extraction: z.object({
        engine: z.string(),
        notes: z.string().nullable(),
        fields: z.record(z.string(), z.object({ value: fieldValue, confidence: z.number() })),
      }),
    })
    .nullable(),
  affidavitFileId: z.string().nullable(),
});

export async function submitInstrument(payload: unknown): Promise<{ caseId: string; instrumentId: string } | { error: string }> {
  try {
    const user = await requireRole(["INSTITUTION"]);
    const input = SubmissionSchema.parse(payload);
    const res = await createSubmission(user, input as Parameters<typeof createSubmission>[1]);
    revalidatePath("/", "layout");
    return res;
  } catch (e) {
    return { error: messageOf(e) };
  }
}

// ───────── case workflow ─────────

const CaseActionSchema = z.object({
  caseId: z.string().min(1),
  action: z.enum(Object.keys(CASE_ACTIONS) as [CaseAction, ...CaseAction[]]),
  reason: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function caseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["INSTITUTION", "BANK", "RO", "BUREAU", "CELL", "AUTHORITY", "ADMIN"]);
    const input = CaseActionSchema.parse(Object.fromEntries(formData));
    await performCaseAction(user, input.caseId, input.action, input.reason);
    return `${CASE_ACTIONS[input.action].label}: recorded`;
  }, ["/"]);
}

const ClearanceSchema = z.object({
  caseId: z.string().min(1),
  cell: z.enum(["FINANCE", "LEGAL", "GRIEVANCE"]),
  decision: z.enum(["CLEARED", "OBJECTION"]),
  note: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function clearanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["CELL", "ADMIN"]);
    const input = ClearanceSchema.parse(Object.fromEntries(formData));
    await decideClearance(user, input.caseId, input.cell, input.decision, input.note);
    return `${input.cell.toLowerCase()} clearance: ${input.decision.toLowerCase()}`;
  }, ["/"]);
}

export async function fetchAAAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["RO", "BUREAU", "ADMIN", "BANK"]);
    const instrumentId = z.string().min(1).parse(formData.get("instrumentId"));
    const r = await fetchBankConfirmation(user, instrumentId);
    return r.found ? `${r.provider}: bank record fetched — confirmed tier updated` : `${r.provider}: no matching term deposit at the bank — flagged`;
  }, ["/"]);
}

export async function applyReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["INSTITUTION"]);
    const instrumentId = z.string().min(1).parse(formData.get("instrumentId"));
    const note = z.string().trim().max(2000).parse(formData.get("note") ?? "") || null;
    const useSpecimen = formData.get("useSpecimen") === "on";
    const files: { kind: DocumentKind; fileId: string }[] = [];
    for (const [key, kind] of [
      ["affidavit6", "AFFIDAVIT_6"],
      ["loaEoa", "LOA_EOA"],
    ] as const) {
      const f = formData.get(key);
      if (f instanceof File && f.size > 0) {
        const s = await storeFile(db, Buffer.from(await f.arrayBuffer()), f.name, f.type || "application/pdf");
        files.push({ kind, fileId: s.id });
      } else if (useSpecimen) {
        const name = user.institution?.name ?? "Institution";
        const bytes = await makeAffidavitPdf(kind === "AFFIDAVIT_6" ? "AFFIDAVIT_6" : "AFFIDAVIT_3", name, toDay(new Date()));
        const s = await storeFile(db, Buffer.from(bytes), kind === "AFFIDAVIT_6" ? "Affidavit-6-specimen.pdf" : "EoA-specimen.pdf", "application/pdf");
        files.push({ kind, fileId: s.id });
      }
    }
    if (!files.some((f) => f.kind === "AFFIDAVIT_6")) throw new TransitionError("Affidavit-6 is mandatory for release (APH §6.46)");
    await applyForRelease(user, instrumentId, files, note);
    return "Release application submitted (APH §6.46)";
  }, ["/"]);
}

export async function revokeNocAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["AUTHORITY", "ADMIN"]);
    const code = z.string().min(1).parse(formData.get("code"));
    const reason = z.string().trim().min(5, "give a reason").parse(formData.get("reason"));
    await revokeNoc(user, code, reason);
    return `${code} revoked`;
  }, ["/"]);
}

export type MaturityActionState = ({ result?: MaturityJobResult } & NonNullable<ActionState>) | null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState passes previous state
export async function runMaturityAction(_prev: MaturityActionState): Promise<MaturityActionState> {
  try {
    await requireRole(["RO", "BUREAU", "ADMIN", "AUTHORITY"]);
    const result = await runMaturityJob(db);
    revalidatePath("/", "layout");
    return { ok: `Checked ${result.checked} instruments · ${result.statusChanges.length} status changes · ${result.remindersCreated.length} reminders sent`, result };
  } catch (e) {
    return { error: messageOf(e) };
  }
}

export async function addDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole(["INSTITUTION"]);
    const instrumentId = z.string().min(1).parse(formData.get("instrumentId"));
    const kind = z.enum(["FDR_COPY", "AFFIDAVIT_3", "AFFIDAVIT_6", "LOA_EOA", "OTHER"]).parse(formData.get("kind"));
    let fileId: string;
    let extraction: ExtractionResult | null = null;
    const f = formData.get("file");
    if (f instanceof File && f.size > 0) {
      const buf = Buffer.from(await f.arrayBuffer());
      const s = await storeFile(db, buf, f.name, f.type || "application/pdf");
      fileId = s.id;
      if (kind === "FDR_COPY") extraction = await extractFdr(buf, s.mime);
    } else if (formData.get("useSpecimen") === "on" && kind === "AFFIDAVIT_3") {
      const bytes = await makeAffidavitPdf("AFFIDAVIT_3", user.institution?.name ?? "Institution", toDay(new Date()));
      fileId = (await storeFile(db, Buffer.from(bytes), "Affidavit-3-specimen.pdf", "application/pdf")).id;
    } else throw new TransitionError("Choose a file to upload");
    await addInstrumentDocument(user, instrumentId, kind, fileId, extraction);
    return `${kind.replace(/_/g, " ").toLowerCase()} uploaded and anchored`;
  }, ["/"]);
}

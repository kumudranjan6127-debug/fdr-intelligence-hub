import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { readFile } from "@/lib/storage";

// Documents are served to signed-in users (institutions only their own). NOC-linked documents are also
// served publicly so a bank can download the anchored copy from /verify.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const docs = await db.document.findMany({ where: { fileId: id }, select: { instrument: { select: { institutionId: true, nocs: { select: { id: true } } } } } });
  const nocLinked = docs.some((d) => d.instrument.nocs.length > 0);
  const allowed =
    nocLinked ||
    (user && (user.role !== "INSTITUTION" || docs.length === 0 || docs.some((d) => d.instrument.institutionId === user.institutionId)));
  if (!allowed) return new Response("Not found", { status: 404 });

  const f = await readFile(db, id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${f.filename.replace(/"/g, "")}"`,
      "X-Content-SHA256": f.sha256,
      "Cache-Control": "private, max-age=60",
    },
  });
}

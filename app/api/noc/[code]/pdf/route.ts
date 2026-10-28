import QRCode from "qrcode";
import { db } from "@/lib/db";
import { renderNocPdf } from "@/lib/noc-pdf";
import { requestOrigin } from "@/lib/origin";
import type { NocPayload } from "@/lib/services/noc";
import { currentUser } from "@/lib/session";
import { canView } from "@/lib/views";

// The NOC as a PDF, for the same users who can open the letter. The QR inside points at the public /verify page.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await currentUser();
  const noc = user ? await db.noc.findUnique({ where: { code }, include: { instrument: true } }) : null;
  if (!user || !noc || !canView(user, noc.instrument)) return new Response("Not found", { status: 404 });

  const verifyUrl = `${await requestOrigin()}/verify/${noc.code}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  const bytes = await renderNocPdf({
    payload: noc.payload as unknown as NocPayload,
    sha256: noc.sha256,
    verifyUrl,
    qrPng: new Uint8Array(qrPng),
    revoked: noc.revokedAt ? { at: noc.revokedAt, reason: noc.revokeReason } : null,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${noc.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// File storage. Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise bytes live in Postgres
// (StoredFile.data) so the demo works anywhere. Every file's SHA-256 is computed on the way in.
import { Prisma, type PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { sha256Hex } from "./hash";

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"];

export async function storeFile(db: Db, buf: Buffer, filename: string, mime: string) {
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("File is larger than 4 MB");
  if (!ALLOWED_MIME.includes(mime)) throw new Error(`Unsupported file type ${mime} — upload a PDF, PNG or JPEG`);
  const sha256 = sha256Hex(buf);
  let blobUrl: string | null = null;
  let data: Uint8Array<ArrayBuffer> | null = new Uint8Array(buf);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const res = await put(`documents/${sha256.slice(0, 16)}-${filename}`, buf, { access: "public", contentType: mime, addRandomSuffix: true });
    blobUrl = res.url;
    data = null;
  }
  const file = await db.storedFile.create({ data: { sha256, mime, size: buf.length, filename, data, blobUrl } });
  return { ...file, url: `/api/files/${file.id}` };
}

export async function readFile(db: Db, fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f) return null;
  let bytes: Buffer;
  if (f.data) bytes = Buffer.from(f.data);
  else if (f.blobUrl) bytes = Buffer.from(await (await fetch(f.blobUrl)).arrayBuffer());
  else return null;
  return { bytes, mime: f.mime, filename: f.filename, sha256: f.sha256 };
}

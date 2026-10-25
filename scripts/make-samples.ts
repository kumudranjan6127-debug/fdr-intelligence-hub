// Writes the specimen PDFs used by the submission wizard into public/samples.
import { writeFileSync } from "fs";
import { SAMPLE_DOCS } from "../lib/sample-specs";
import { makeFdrPdf, makeOnlineReceiptPdf } from "../lib/samples";
import { sha256Hex } from "../lib/hash";

(async () => {
  for (const s of SAMPLE_DOCS) {
    const bytes = s.kind === "FDR" ? await makeFdrPdf(s.spec) : await makeOnlineReceiptPdf(s.spec);
    writeFileSync(`public/samples/${s.file}`, bytes);
    console.log(s.file, bytes.length, sha256Hex(Buffer.from(bytes)).slice(0, 16));
  }
})();

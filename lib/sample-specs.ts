// Downloadable specimen documents for the submission demo (public/samples). The seed also writes matching
// records into the mock bank's book so "Fetch bank confirmation" finds them.
import type { FdrSpec, ReceiptSpec } from "./samples";

export type SampleDoc = { file: string; title: string; hint: string } & ({ kind: "FDR"; spec: FdrSpec; bankKey: string } | { kind: "RECEIPT"; spec: ReceiptSpec; bankKey: string });

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    file: "sample-fdr-50L.pdf",
    title: "FDR ₹50 L · Bharat Union Bank",
    hint: "Clean FDR with lien — matches a ₹50 L claim",
    kind: "FDR",
    bankKey: "BUB",
    spec: { bankName: "Bharat Union Bank", branch: "Civil Lines Branch, Varanasi", ifsc: "BUBK0000318", fdrNumber: "BUB2026160021", amountPaise: "500000000", issueDate: "2026-10-20", maturityDate: "2029-10-20", interestRate: "6.90", depositor: "Ganga Valley Educational Society", lienMarked: true },
  },
  {
    file: "sample-fdr-45L-mismatch.pdf",
    title: "FDR ₹45 L · Bharat Union Bank",
    hint: "Reads ₹45 L — claim ₹50 L to see a mismatch",
    kind: "FDR",
    bankKey: "BUB",
    spec: { bankName: "Bharat Union Bank", branch: "Civil Lines Branch, Varanasi", ifsc: "BUBK0000318", fdrNumber: "BUB2026160022", amountPaise: "450000000", issueDate: "2026-10-21", maturityDate: "2029-10-21", interestRate: "6.90", depositor: "Ganga Valley Educational Society", lienMarked: true },
  },
  {
    file: "sample-fdr-renewal-dcb.pdf",
    title: "Renewal FDR ₹50 L · Deccan Commercial Bank",
    hint: "Renewal for Shivneri's expiring FDR",
    kind: "FDR",
    bankKey: "DCB",
    spec: { bankName: "Deccan Commercial Bank", branch: "Camp Branch, Pune", ifsc: "DCBK0000412", fdrNumber: "DCB2026008841", amountPaise: "500000000", issueDate: "2026-11-20", maturityDate: "2029-11-20", interestRate: "6.80", depositor: "Shivneri Education Trust", lienMarked: true },
  },
  {
    file: "sample-fdr-no-lien.pdf",
    title: "FDR ₹50 L · Ganga Gramin Bank · no lien",
    hint: "Lien not marked in favour of AICTE",
    kind: "FDR",
    bankKey: "GGB",
    spec: { bankName: "Ganga Gramin Bank", branch: "Civil Lines Branch, Varanasi", ifsc: "GGBK0000207", fdrNumber: "GGB2026004410", amountPaise: "500000000", issueDate: "2026-10-18", maturityDate: "2029-10-18", interestRate: "6.70", depositor: "Ganga Valley Educational Society", lienMarked: false },
  },
  {
    file: "sample-online-deposit.pdf",
    title: "Online deposit receipt ₹25 L",
    hint: "AICTE portal payment acknowledgement",
    kind: "RECEIPT",
    bankKey: "BUB",
    spec: { txnRef: "AICTE2026SD455170", amountPaise: "250000000", date: "2026-10-19", termEnd: "2036-10-19", payer: "Ganga Valley Educational Society", gateway: "Bharat Union Bank (AICTE online collection)" },
  },
];

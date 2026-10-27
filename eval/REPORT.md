# Evaluation report

Generated 2026-10-27T19:50:38.808Z · commit `f104b2b` · seed 26265 · 210 cases. Reproduce with `npm run eval` (`-- --workflow` for the workflow phase).

Every case has a generated PDF, real text extraction (the local parser, so no API is involved) and the production detection engines. Bank values come from a sandbox bank book, as in the demo.

## Detection

- **Recall:** 110 of 110 planted defects caught (100%).
- **False positives on clean deposits:** 0 of 70 correct deposits raised any finding (including 20 typed with different case, spacing, dashes or "Ltd.").
- **Both sides of a duplicate:** 30 of 30 copied-from deposits were flagged as the partner too.
- **Alarm precision:** 235 of 235 findings were explained by the planted defect (100%).

| Planted defect | Expected finding | Cases | Caught | Recall |
|---|---|---|---|---|
| AMOUNT_MISMATCH | `CLAIMED_VS_CONFIRMED` | 15 | 15 | 100% |
| FDR_NUMBER_MISMATCH | `CLAIMED_VS_CONFIRMED` | 15 | 15 | 100% |
| LIEN_MISSING | `LIEN_NOT_NOTED` | 15 | 15 | 100% |
| COVERAGE_GAP | `COVERAGE_GAP` | 15 | 15 | 100% |
| AMOUNT_DROP | `AMOUNT_DROP` | 15 | 15 | 100% |
| BELOW_REQUIRED | `BELOW_REQUIRED` | 5 | 5 | 100% |
| DUPLICATE_DOCUMENT | `DUPLICATE_DOCUMENT` | 10 | 10 | 100% |
| DUPLICATE_FDR_NUMBER | `DUPLICATE_FDR_NUMBER` | 10 | 10 | 100% |
| NEAR_DUPLICATE | `NEAR_DUPLICATE_FDR` | 10 | 10 | 100% |

## Extraction accuracy (local parser vs the PDF's printed values)

| Field | Accuracy |
|---|---|
| bankName | 100% |
| fdrNumber | 100% |
| amount | 100% |
| issueDate | 100% |
| maturityDate | 100% |
| lienNoted | 100% |

## Processing time

- Text extraction per document: p50 6 ms, p95 10.6 ms (240 documents).
- Detection per instrument (against all 210 others): p50 0.5 ms, p95 1.1 ms.

## Workflow completion (real services + Postgres)

Submit → sandbox bank confirmation → officer decision, for 30 cases (clean ones should be accepted, amount mismatches sent back for clarification).

- **Completed as expected:** 30 of 30 (100%).
- **Time per case:** p50 3400.3 ms, p95 4348.9 ms (local PGlite database, which serves one connection at a time).
- **Audit hash chain after the run:** intact.

## What the evaluation changed

- An earlier run flagged 2 of 70 correct deposits as near-duplicates: two institutions' unrelated ₹50 L FDRs opened at the same bank on the same day. Deposit amounts are standard, so same-day collisions are common. The rule now also needs the numbers to be within three edits; the planted near-duplicates are still all caught.

## Limits

- The dataset is synthetic and the documents are clean, machine-generated PDFs; scanned or photographed documents (OCR) are not covered yet.
- Bank values come from the sandbox bank book, not a live Account Aggregator.

// Seed = the demo. Every planted defect below maps to a scenario in the brief (§5.5 / §5.6).
// All banks, institutions and people are fictional. Dates are relative to the day the seed runs.
import { PrismaClient, type Cell, type CaseStatus, type CaseType, type DocumentKind, type InstrumentStatus, type Prisma, type Role } from "@prisma/client";
import { recordEvent, type Actor } from "../lib/events";
import { anchor, hashJson } from "../lib/hash";
import { addDays, startOfDayUTC, toDay } from "../lib/format";
import { FIELD_KEYS, makeField, type Confirmed, type FieldKey, type FieldValue } from "../lib/provenance";
import { DEFAULT_RULES, penaltyAmount } from "../lib/rules";
import { makeAffidavitPdf, makeFdrPdf, makeOnlineReceiptPdf } from "../lib/samples";
import { SAMPLE_DOCS } from "../lib/sample-specs";
import { parseFdrText } from "../lib/extract";
import { sha256Hex } from "../lib/hash";
import { demoPassword, hashPassword } from "../lib/auth";
import { syncDiscrepancies, recomputeRisk } from "../lib/services/core";
import type { NocPayload } from "../lib/services/noc";

const db = new PrismaClient();
const T = startOfDayUTC(new Date());
const day = (n: number) => addDays(T, n);
const L = (lakh: number) => String(Math.round(lakh * 100_000 * 100)); // lakh → paise

// ───────────── reference data ─────────────

const BANKS = {
  BUB: { name: "Bharat Union Bank", ifscPrefix: "BUBK", branch: "Connaught Place Branch, New Delhi" },
  DCB: { name: "Deccan Commercial Bank", ifscPrefix: "DCBK", branch: "Camp Branch, Pune" },
  GGB: { name: "Ganga Gramin Bank", ifscPrefix: "GGBK", branch: "Civil Lines Branch, Varanasi" },
  KMB: { name: "Konkan Mercantile Bank", ifscPrefix: "KMBK", branch: "Station Road Branch, Ratnagiri" },
} as const;
type BankKey = keyof typeof BANKS;

const RO = { N: "Northern RO, Kanpur", W: "Western RO, Mumbai", S: "Southern RO, Bengaluru", E: "Eastern RO, Kolkata" };

const INSTITUTIONS = {
  shivneri: { name: "Shivneri Institute of Technology, Pune", state: "Maharashtra", ro: RO.W, pid: "1-4471230091", trust: "Shivneri Education Trust", leased: false, govt: false, eoa: 2026 },
  narmada: { name: "Narmada College of Engineering, Vadodara", state: "Gujarat", ro: RO.W, pid: "1-3328810452", trust: "Narmada Vidya Mandal", leased: false, govt: false, eoa: 2026 },
  kaveri: { name: "Kaveri Institute of Pharmacy, Mysuru", state: "Karnataka", ro: RO.S, pid: "1-5590213374", trust: "Kaveri Shikshana Samithi", leased: false, govt: false, eoa: 2026 },
  ganga: { name: "Ganga Valley School of Management, Varanasi", state: "Uttar Pradesh", ro: RO.N, pid: "1-2219987605", trust: "Ganga Valley Educational Society", leased: false, govt: false, eoa: 2026 },
  sundarbans: { name: "Sundarbans Institute of Technology, Kolkata", state: "West Bengal", ro: RO.E, pid: "1-6672041198", trust: "Sundarbans Shiksha Trust", leased: true, govt: false, eoa: 2026 },
  hooghly: { name: "Hooghly Engineering College, Howrah", state: "West Bengal", ro: RO.E, pid: "1-6681150237", trust: "Hooghly Technical Education Society", leased: false, govt: false, eoa: 2026 },
  aravalli: { name: "Aravalli Institute of Engineering, Jaipur", state: "Rajasthan", ro: RO.N, pid: "1-2840117760", trust: "Aravalli Gyan Peeth Trust", leased: true, govt: false, eoa: 2026 },
  malabar: { name: "Malabar College of Architecture, Kozhikode", state: "Kerala", ro: RO.S, pid: "1-5711094420", trust: "Malabar Educational Trust", leased: true, govt: false, eoa: 2026 },
  deccan: { name: "Deccan Plateau Polytechnic, Hyderabad", state: "Telangana", ro: RO.S, pid: "1-5023318871", trust: "Deccan Plateau Education Society", leased: false, govt: false, eoa: 2026 },
  brahmaputra: { name: "Brahmaputra Institute of Technology, Guwahati", state: "Assam", ro: RO.E, pid: "1-7104456213", trust: "Brahmaputra Vidya Trust", leased: false, govt: false, eoa: 2025 },
  vindhya: { name: "Vindhya College of Pharmacy, Jabalpur", state: "Madhya Pradesh", ro: RO.N, pid: "1-3915560034", trust: "Vindhya Shiksha Samiti", leased: true, govt: false, eoa: 2020 },
  konkan: { name: "Konkan Institute of Hotel Management, Ratnagiri", state: "Maharashtra", ro: RO.W, pid: "1-4490271185", trust: "Konkan Hospitality Education Trust", leased: false, govt: false, eoa: 2026 },
  gpNagpur: { name: "Government Polytechnic, Nagpur", state: "Maharashtra", ro: RO.W, pid: "1-1000203311", trust: "Directorate of Technical Education, Maharashtra", leased: false, govt: true, eoa: 2026 },
  gecBbsr: { name: "Government Engineering College, Bhubaneswar", state: "Odisha", ro: RO.E, pid: "1-1000417729", trust: "Government of Odisha", leased: false, govt: true, eoa: 2026 },
  gcpShimla: { name: "Government College of Pharmacy, Shimla", state: "Himachal Pradesh", ro: RO.N, pid: "1-1000588102", trust: "Government of Himachal Pradesh", leased: false, govt: true, eoa: 2026 },
} as const;
type InstKey = keyof typeof INSTITUTIONS;

type UserSpec = { key: string; name: string; email: string; role: Role; designation: string; inst?: InstKey; bank?: BankKey; cell?: Cell };
const USERS: UserSpec[] = [
  { key: "instShivneri", name: "Anita Deshmukh", email: "registrar@shivneri.demo", role: "INSTITUTION", designation: "Registrar", inst: "shivneri" },
  { key: "instGanga", name: "Rakesh Tiwari", email: "accounts@gangavalley.demo", role: "INSTITUTION", designation: "Accounts Officer", inst: "ganga" },
  { key: "instKonkan", name: "Meera Sawant", email: "principal@konkanihm.demo", role: "INSTITUTION", designation: "Principal", inst: "konkan" },
  { key: "bankKMB", name: "Suresh Iyer", email: "bm.ratnagiri@kmb.demo", role: "BANK", designation: "Branch Manager", bank: "KMB" },
  { key: "bankDCB", name: "Farah Khan", email: "bm.pune@dcb.demo", role: "BANK", designation: "Branch Manager", bank: "DCB" },
  { key: "roWest", name: "Vikram Rao", email: "ad.wro@aicte.demo", role: "RO", designation: "Assistant Director, Western RO" },
  { key: "roEast", name: "Sunita Bose", email: "dd.ero@aicte.demo", role: "RO", designation: "Deputy Director, Eastern RO" },
  { key: "bureau1", name: "Arjun Mehta", email: "dd.regulation@aicte.demo", role: "BUREAU", designation: "Deputy Director, Regulation Bureau" },
  { key: "bureau2", name: "Kavita Nair", email: "ad.regulation@aicte.demo", role: "BUREAU", designation: "Assistant Director, Regulation Bureau" },
  { key: "cellFin", name: "Nikhil Gupta", email: "finance.cell@aicte.demo", role: "CELL", designation: "Finance Officer", cell: "FINANCE" },
  { key: "cellLegal", name: "Rohini Kulkarni", email: "legal.cell@aicte.demo", role: "CELL", designation: "Legal Officer", cell: "LEGAL" },
  { key: "cellGriev", name: "Imran Qureshi", email: "grievance.cell@aicte.demo", role: "CELL", designation: "Grievance Officer", cell: "GRIEVANCE" },
  { key: "auth1", name: "Dr. S. Raghavan", email: "ms@aicte.demo", role: "AUTHORITY", designation: "Member Secretary (Competent Authority)" },
  { key: "auth2", name: "Prof. Lata Menon", email: "adviser1@aicte.demo", role: "AUTHORITY", designation: "Adviser-I, Approval Bureau" },
  { key: "admin1", name: "Deepak Joshi", email: "it.cell@aicte.demo", role: "ADMIN", designation: "System Administrator" },
  { key: "admin2", name: "Pooja Verma", email: "rules.admin@aicte.demo", role: "ADMIN", designation: "Rules Administrator" },
];

// ───────────── instrument specs ─────────────

type Truth = { amountL: number; issue: number; maturity: number; lien: boolean; no: string };
type OpenCase = {
  type: CaseType;
  status: CaseStatus;
  opened: number;
  changed: number;
  blockingReason?: string;
};
type Spec = {
  key: string;
  inst: InstKey;
  type: "FDR" | "ONLINE_DEPOSIT";
  bank: BankKey;
  truth: Truth;
  status: InstrumentStatus;
  pred?: string;
  requiredL?: number;
  claimed?: Partial<Truth>;
  doc?: false | Partial<Truth>;
  bankRecord?: false | Partial<Truth>;
  confirmed?: boolean;
  affidavit?: "ontime" | "late" | "missing";
  openCase?: OpenCase;
  rate?: string;
  note?: string;
};

const fdr = (bank: BankKey, n: number) => `${bank}${n}`;
const Y = 365;

const SPECS: Spec[] = [
  // ── Chain A · Shivneri: 4 links, 47-day coverage gap between A2 → A3; latest expires in 45 days
  { key: "A1", inst: "shivneri", type: "FDR", bank: "DCB", truth: { amountL: 50, issue: -3000, maturity: -2270, lien: true, no: fdr("DCB", 2018004711) }, status: "RENEWED", confirmed: true },
  { key: "A2", inst: "shivneri", type: "FDR", bank: "DCB", pred: "A1", truth: { amountL: 50, issue: -2270, maturity: -1540, lien: true, no: fdr("DCB", 2020009312) }, status: "RENEWED", confirmed: true },
  { key: "A3", inst: "shivneri", type: "FDR", bank: "DCB", pred: "A2", truth: { amountL: 50, issue: -1493, maturity: -763, lien: true, no: fdr("DCB", 2022001187) }, status: "RENEWED", confirmed: true, note: "planted: 47-day coverage gap" },
  { key: "A4", inst: "shivneri", type: "FDR", bank: "DCB", pred: "A3", truth: { amountL: 50, issue: -763, maturity: 45, lien: true, no: fdr("DCB", 2024005530) }, status: "EXPIRING", confirmed: true },
  { key: "A5", inst: "shivneri", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -900, maturity: -900 + 10 * Y, lien: true, no: "AICTE2024SD220871" }, status: "ACTIVE", confirmed: true },

  // ── Chain B · Narmada: renewed for ₹45 L, down from ₹50 L
  { key: "B1", inst: "narmada", type: "FDR", bank: "BUB", truth: { amountL: 50, issue: -2500, maturity: -1400, lien: true, no: fdr("BUB", 2019117420) }, status: "RENEWED", confirmed: true },
  { key: "B2", inst: "narmada", type: "FDR", bank: "BUB", pred: "B1", truth: { amountL: 50, issue: -1400, maturity: -300, lien: true, no: fdr("BUB", 2022130088) }, status: "RENEWED", confirmed: true },
  { key: "B3", inst: "narmada", type: "FDR", bank: "BUB", pred: "B2", truth: { amountL: 45, issue: -300, maturity: 800, lien: true, no: fdr("BUB", 2025141902) }, status: "ACTIVE", confirmed: true, note: "planted: amount drop ₹50L → ₹45L" },
  { key: "B4", inst: "narmada", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -500, maturity: -500 + 10 * Y, lien: true, no: "AICTE2025SD301146" }, status: "ACTIVE", confirmed: true },

  // ── Chain C · Kaveri: latest renewal has no lien in favour of AICTE (claimed yes; document & bank say no)
  { key: "C1", inst: "kaveri", type: "FDR", bank: "GGB", truth: { amountL: 50, issue: -2000, maturity: -1270, lien: true, no: fdr("GGB", 2021000412) }, status: "RENEWED", confirmed: true },
  { key: "C2", inst: "kaveri", type: "FDR", bank: "GGB", pred: "C1", truth: { amountL: 50, issue: -1270, maturity: -540, lien: true, no: fdr("GGB", 2023000977) }, status: "RENEWED", confirmed: true },
  { key: "C3", inst: "kaveri", type: "FDR", bank: "GGB", pred: "C2", truth: { amountL: 50, issue: -540, maturity: 190, lien: false, no: fdr("GGB", 2025001344) }, claimed: { lien: true }, status: "ACTIVE", note: "planted: lien not noted on latest" },
  { key: "C4", inst: "kaveri", type: "FDR", bank: "GGB", requiredL: 25, truth: { amountL: 25, issue: -1830, maturity: -5, lien: true, no: fdr("GGB", 2021007781) }, status: "MATURED", confirmed: true },

  // ── Ganga Valley: the officer-demo case (claimed ₹50 L, document reads ₹45 L) + one expiring in 20 days + one overdue
  { key: "G1", inst: "ganga", type: "FDR", bank: "BUB", truth: { amountL: 50, issue: -1806, maturity: 20, lien: true, no: fdr("BUB", 2021090017) }, status: "EXPIRING", confirmed: true },
  { key: "G2", inst: "ganga", type: "FDR", bank: "GGB", requiredL: 25, truth: { amountL: 25, issue: -1500, maturity: -12, lien: true, no: fdr("GGB", 2022003390) }, status: "MATURED", confirmed: true },
  {
    key: "G3",
    inst: "ganga",
    type: "FDR",
    bank: "BUB",
    truth: { amountL: 45, issue: -9, maturity: 3 * Y - 9, lien: true, no: fdr("BUB", 2026158841) },
    claimed: { amountL: 50 },
    status: "SUBMITTED",
    openCase: { type: "NEW_SUBMISSION", status: "SUBMITTED", opened: -6, changed: -6 },
    note: "planted: claimed ≠ extracted amount",
  },
  { key: "G4", inst: "ganga", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1200, maturity: -1200 + 10 * Y, lien: true, no: "AICTE2023SD118822" }, status: "ACTIVE", confirmed: true },

  // ── Sundarbans (leased → ₹1 Cr) holds the genuine FDR whose number Hooghly re-used
  { key: "S1", inst: "sundarbans", type: "FDR", bank: "KMB", truth: { amountL: 100, issue: -1100, maturity: 700, lien: true, no: fdr("KMB", 2022118834) }, status: "ACTIVE", confirmed: true },
  { key: "S2", inst: "sundarbans", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 50, truth: { amountL: 50, issue: -2400, maturity: -2400 + 10 * Y, lien: true, no: "AICTE2020SD040213" }, status: "ACTIVE", confirmed: true },
  { key: "S3", inst: "sundarbans", type: "FDR", bank: "KMB", requiredL: 50, truth: { amountL: 50, issue: -1015, maturity: 80, lien: true, no: fdr("KMB", 2023120561) }, status: "EXPIRING", confirmed: true },
  { key: "S4", inst: "sundarbans", type: "FDR", bank: "KMB", requiredL: 25, truth: { amountL: 25, issue: -200, maturity: 3 * Y - 200, lien: true, no: fdr("KMB", 2026131007) }, status: "ACTIVE", confirmed: true },

  // ── Hooghly: submits an FDR number already held by Sundarbans (duplicate) — stuck at RO for 20 days
  {
    key: "H1",
    inst: "hooghly",
    type: "FDR",
    bank: "KMB",
    truth: { amountL: 50, issue: -24, maturity: 5 * Y - 24, lien: true, no: fdr("KMB", 2022118834) },
    bankRecord: false,
    status: "UNDER_SCRUTINY",
    openCase: { type: "NEW_SUBMISSION", status: "RO_SCRUTINY", opened: -22, changed: -20 },
    note: "planted: duplicate FDR number",
  },
  { key: "H2", inst: "hooghly", type: "FDR", bank: "KMB", requiredL: 25, truth: { amountL: 25, issue: -1300, maturity: 500, lien: true, no: fdr("KMB", 2023109944) }, status: "ACTIVE", confirmed: true },
  { key: "H3", inst: "hooghly", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1700, maturity: -1700 + 10 * Y, lien: true, no: "AICTE2022SD077610" }, status: "ACTIVE", confirmed: true },

  // ── Aravalli (leased): legacy record keyed in with maturity before issue, no FDR copy on file
  {
    key: "R1",
    inst: "aravalli",
    type: "FDR",
    bank: "DCB",
    truth: { amountL: 100, issue: -400, maturity: 5 * Y - 400, lien: true, no: fdr("DCB", 2025006618) },
    claimed: { maturity: -400 - Y },
    doc: false,
    status: "SUBMITTED",
    openCase: { type: "NEW_SUBMISSION", status: "COMPLETENESS_CHECK", opened: -3, changed: -3 },
    note: "planted: maturity before issue (legacy record)",
  },
  { key: "R2", inst: "aravalli", type: "FDR", bank: "DCB", requiredL: 100, truth: { amountL: 100, issue: -1900, maturity: 290, lien: true, no: fdr("DCB", 2021003377) }, status: "ACTIVE", confirmed: true },
  { key: "R3", inst: "aravalli", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 50, truth: { amountL: 50, issue: -1000, maturity: -1000 + 10 * Y, lien: true, no: "AICTE2024SD199054" }, status: "ACTIVE", confirmed: true },

  // ── Malabar (leased → ₹1 Cr required) holds only ₹50 L; plus an old released FDR with a revoked + re-issued NOC
  { key: "M1", inst: "malabar", type: "FDR", bank: "GGB", truth: { amountL: 50, issue: -700, maturity: 4 * Y - 700, lien: true, no: fdr("GGB", 2024002250) }, status: "ACTIVE", confirmed: true, note: "planted: amount below required" },
  { key: "M2", inst: "malabar", type: "FDR", bank: "GGB", requiredL: 25, truth: { amountL: 25, issue: -3800, maturity: -150, lien: true, no: fdr("GGB", 2016000419) }, status: "RELEASED", confirmed: true },

  // ── Deccan Plateau: online deposit paid 40 days ago, affidavit never uploaded (due 25 days ago)
  {
    key: "D1",
    inst: "deccan",
    type: "ONLINE_DEPOSIT",
    bank: "BUB",
    truth: { amountL: 50, issue: -40, maturity: 10 * Y - 40, lien: true, no: "AICTE2026SD410337" },
    affidavit: "missing",
    status: "SUBMITTED",
    openCase: { type: "NEW_SUBMISSION", status: "CLARIFICATION_REQUIRED", opened: -38, changed: -10, blockingReason: "Upload Affidavit-3 (security deposit undertaking) — it was due within 15 days of intimation." },
    note: "planted: missing affidavit",
  },
  { key: "D2", inst: "deccan", type: "FDR", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1400, maturity: 425, lien: true, no: fdr("BUB", 2022120075) }, status: "ACTIVE", confirmed: true },
  { key: "D3", inst: "deccan", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1600, maturity: -1600 + 10 * Y, lien: true, no: "AICTE2022SD064418" }, status: "ACTIVE", confirmed: true },

  // ── Unclaimed matured deposits: past the 10-year term, no release application
  { key: "U1", inst: "brahmaputra", type: "FDR", bank: "GGB", truth: { amountL: 50, issue: -3900, maturity: -250, lien: true, no: fdr("GGB", 2015000188) }, status: "MATURED", confirmed: true, note: "planted: unclaimed matured" },
  { key: "U2", inst: "brahmaputra", type: "FDR", bank: "GGB", requiredL: 25, truth: { amountL: 25, issue: -1000, maturity: 825, lien: true, no: fdr("GGB", 2024001906) }, status: "ACTIVE", confirmed: true },
  { key: "V1", inst: "vindhya", type: "FDR", bank: "DCB", truth: { amountL: 100, issue: -4100, maturity: -450, lien: true, no: fdr("DCB", 2014000533) }, status: "MATURED", confirmed: true, note: "planted: unclaimed matured; EoA lapsed since 2020" },
  { key: "V2", inst: "vindhya", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 50, truth: { amountL: 50, issue: -700, maturity: -700 + 10 * Y, lien: true, no: "AICTE2024SD251190" }, status: "ACTIVE", confirmed: true },

  // ── Konkan: release case blocked at Legal cell; another release with NOC issued, awaiting the bank
  {
    key: "K1",
    inst: "konkan",
    type: "FDR",
    bank: "KMB",
    truth: { amountL: 50, issue: -3700, maturity: -50, lien: true, no: fdr("KMB", 2016004472) },
    affidavit: "late",
    status: "RELEASE_REQUESTED",
    confirmed: true,
    openCase: { type: "RELEASE", status: "CLEARANCES_PENDING", opened: -25, changed: -18 },
    note: "release: Finance + Grievance cleared, Legal pending",
  },
  {
    key: "K2",
    inst: "konkan",
    type: "FDR",
    bank: "KMB",
    requiredL: 25,
    truth: { amountL: 25, issue: -3750, maturity: -100, lien: true, no: fdr("KMB", 2016003915) },
    status: "RELEASE_REQUESTED",
    confirmed: true,
    openCase: { type: "RELEASE", status: "NOC_ISSUED", opened: -40, changed: -4 },
    note: "release: NOC issued, bank to act",
  },
  { key: "K3", inst: "konkan", type: "FDR", bank: "KMB", requiredL: 50, truth: { amountL: 50, issue: -800, maturity: 300, lien: true, no: fdr("KMB", 2024127730) }, status: "ACTIVE", confirmed: true },
  { key: "K4", inst: "konkan", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1300, maturity: -1300 + 10 * Y, lien: true, no: "AICTE2023SD150052" }, status: "ACTIVE", confirmed: true },

  // ── Fillers to reach 45, spread across statuses
  { key: "F1", inst: "shivneri", type: "FDR", bank: "DCB", requiredL: 25, truth: { amountL: 25, issue: -1100, maturity: 360, lien: true, no: fdr("DCB", 2023007715) }, status: "ACTIVE", confirmed: true },
  { key: "F2", inst: "narmada", type: "FDR", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1825, maturity: -30, lien: true, no: fdr("BUB", 2021101263) }, status: "MATURED", confirmed: true },
  { key: "F3", inst: "hooghly", type: "FDR", bank: "KMB", requiredL: 25, truth: { amountL: 25, issue: -640, maturity: 455, lien: true, no: fdr("KMB", 2025100458) }, status: "ACTIVE", confirmed: true },
  { key: "F4", inst: "malabar", type: "ONLINE_DEPOSIT", bank: "BUB", requiredL: 50, truth: { amountL: 50, issue: -1450, maturity: -1450 + 10 * Y, lien: true, no: "AICTE2022SD102284" }, status: "ACTIVE", confirmed: true },
  { key: "F5", inst: "deccan", type: "FDR", bank: "BUB", requiredL: 25, truth: { amountL: 25, issue: -1035, maturity: 60, lien: true, no: fdr("BUB", 2023125006) }, status: "EXPIRING", confirmed: true },
];

// ───────────── helpers ─────────────

const ids = { inst: {} as Record<InstKey, string>, bank: {} as Record<BankKey, string>, user: {} as Record<string, string>, ins: {} as Record<string, string> };
const userRole: Record<string, Role> = {};
const actor = (key: string): Actor => ({ id: ids.user[key], role: userRole[key] });
const SYS: Actor = { id: null, role: "ADMIN" };
const instUser: Partial<Record<InstKey, string>> = { shivneri: "instShivneri", ganga: "instGanga", konkan: "instKonkan" };
const uploaderFor = (inst: InstKey) => instUser[inst] ?? "admin1"; // legacy data entered by IT cell
const roFor = (inst: InstKey) => (INSTITUTIONS[inst].ro === RO.E ? "roEast" : "roWest");

let codeSeq = 1000;
const nextCode = (p: string) => `${p}-2026-${(codeSeq++).toString(36).toUpperCase().padStart(5, "0")}`;

function materialize(t: Truth, o?: Partial<Truth>): Truth {
  return { ...t, ...(o ?? {}) };
}

function fieldValues(t: Truth, bank: BankKey, type: Spec["type"]): Record<FieldKey, FieldValue> {
  return {
    bankName: BANKS[bank].name,
    fdrNumber: t.no,
    amount: L(t.amountL),
    issueDate: toDay(day(t.issue)),
    maturityDate: toDay(day(t.maturity)),
    lienNoted: type === "FDR" ? t.lien : null,
  };
}

async function storePdf(bytes: Uint8Array, filename: string, at: Date) {
  const buf = Buffer.from(bytes);
  return db.storedFile.create({ data: { sha256: sha256Hex(buf), mime: "application/pdf", size: buf.length, filename, data: new Uint8Array(buf), createdAt: at } });
}

async function attachDoc(insId: string, kind: DocumentKind, file: { id: string; sha256: string; filename: string }, by: string, at: Date, opts: { caseId?: string; extractedJson?: unknown; id?: string } = {}) {
  const doc = await db.document.create({
    data: {
      id: opts.id,
      instrumentId: insId,
      caseId: opts.caseId,
      kind,
      fileId: file.id,
      url: `/api/files/${file.id}`,
      filename: file.filename,
      sha256: file.sha256,
      uploadedById: ids.user[by],
      extractedJson: opts.extractedJson ? (opts.extractedJson as Prisma.InputJsonValue) : undefined,
      createdAt: at,
    },
  });
  await db.ledgerAnchor.create({ data: { refType: "DOCUMENT", refId: doc.id, sha256: doc.sha256, anchoredAt: at } });
  await recordEvent(db, { instrumentId: insId, caseId: opts.caseId, actor: actor(by), action: "DOCUMENT_UPLOADED", after: { kind, filename: doc.filename, sha256: doc.sha256 }, at });
  return doc;
}

// ───────────── main ─────────────

async function wipe() {
  await db.$transaction([
    db.ledgerAnchor.deleteMany(),
    db.noc.deleteMany(),
    db.reminder.deleteMany(),
    db.discrepancy.deleteMany(),
    db.event.deleteMany(),
    db.clearance.deleteMany(),
    db.document.deleteMany(),
    db.case.deleteMany(),
    db.instrument.updateMany({ data: { predecessorId: null } }),
    db.instrument.deleteMany(),
    db.storedFile.deleteMany(),
    db.bankDepositRecord.deleteMany(),
    db.user.deleteMany(),
    db.institution.deleteMany(),
    db.bank.deleteMany(),
    db.ruleSet.deleteMany(),
  ]);
}

async function main() {
  console.log(`Seeding relative to ${toDay(T)} …`);
  await wipe();

  await db.ruleSet.create({
    data: { version: "APH-2024-27-v1", effectiveFrom: new Date("2024-04-01T00:00:00Z"), rules: DEFAULT_RULES as unknown as Prisma.InputJsonValue, approvedBy: "Member Secretary, AICTE (demo)" },
  });

  for (const [k, b] of Object.entries(BANKS)) ids.bank[k as BankKey] = (await db.bank.create({ data: { name: b.name, ifscPrefix: b.ifscPrefix } })).id;

  for (const [k, i] of Object.entries(INSTITUTIONS)) {
    ids.inst[k as InstKey] = (
      await db.institution.create({
        data: { name: i.name, state: i.state, regionalOffice: i.ro, permanentId: i.pid, isGovernment: i.govt, isLeased: i.leased, programmes: 2, lastEoaYear: i.eoa },
      })
    ).id;
  }

  for (const u of USERS) {
    const row = await db.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: hashPassword(demoPassword()),
        role: u.role,
        designation: u.designation,
        cell: u.cell,
        institutionId: u.inst ? ids.inst[u.inst] : null,
        bankId: u.bank ? ids.bank[u.bank] : null,
      },
    });
    ids.user[u.key] = row.id;
    userRole[u.key] = u.role;
  }

  // Bank-book entries for the downloadable specimens, so the AA mock can confirm demo submissions.
  for (const d of SAMPLE_DOCS) {
    const isFdr = d.kind === "FDR";
    await db.bankDepositRecord.create({
      data: {
        bankId: ids.bank[d.bankKey as BankKey],
        fdrNumber: isFdr ? d.spec.fdrNumber : d.spec.txnRef,
        accountHolder: isFdr ? d.spec.depositor : "AICTE Security Deposit Collection A/c",
        inFavourOf: "Member Secretary, AICTE",
        principal: d.spec.amountPaise,
        openingDate: new Date(`${isFdr ? d.spec.issueDate : d.spec.date}T00:00:00Z`),
        maturityDate: new Date(`${isFdr ? d.spec.maturityDate : d.spec.termEnd}T00:00:00Z`),
        interestRate: isFdr ? d.spec.interestRate : "0",
        lienMarked: isFdr ? d.spec.lienMarked : true,
        lienHolder: !isFdr || d.spec.lienMarked ? "Member Secretary, AICTE" : null,
      },
    });
  }

  for (const s of SPECS) await seedInstrument(s);

  await seedReleaseFlows();

  console.log("Running detection + risk …");
  const all = await db.instrument.findMany({ select: { id: true } });
  for (const i of all) await syncDiscrepancies(db, i.id, T);
  for (const id of Object.values(ids.inst)) await recomputeRisk(db, id, new Date());

  const counts = {
    institutions: await db.institution.count(),
    instruments: await db.instrument.count(),
    cases: await db.case.count(),
    openDiscrepancies: await db.discrepancy.count({ where: { resolvedAt: null } }),
    events: await db.event.count(),
    nocs: await db.noc.count(),
  };
  console.log(counts);
}

async function seedInstrument(s: Spec) {
  const inst = INSTITUTIONS[s.inst];
  const instId = ids.inst[s.inst];
  const docTruth = s.doc === false ? null : materialize(s.truth, s.doc);
  const claimedT = materialize(s.truth, s.claimed);
  const bankT = s.bankRecord === false ? null : materialize(s.truth, s.bankRecord);
  const submittedAt = day(Math.min(s.truth.issue + 1, -1));
  const by = uploaderFor(s.inst);

  // 1. bank's own book (the source the mock AA reads)
  if (bankT) {
    await db.bankDepositRecord.create({
      data: {
        bankId: ids.bank[s.bank],
        fdrNumber: bankT.no,
        accountHolder: s.type === "FDR" ? inst.trust : "AICTE Security Deposit Collection A/c",
        inFavourOf: "Member Secretary, AICTE",
        principal: L(bankT.amountL),
        openingDate: day(bankT.issue),
        maturityDate: day(bankT.maturity),
        interestRate: s.rate ?? "6.80",
        lienMarked: s.type === "FDR" ? bankT.lien : true,
        lienHolder: bankT.lien ? "Member Secretary, AICTE" : null,
        status: "ACTIVE",
      },
    });
  }

  // 2. the document (generated PDF) and what the extractor reads from it
  let fdrFile: Awaited<ReturnType<typeof storePdf>> | null = null;
  let extraction: ReturnType<typeof parseFdrText> | null = null;
  if (docTruth) {
    const bytes =
      s.type === "FDR"
        ? await makeFdrPdf({
            bankName: BANKS[s.bank].name,
            branch: BANKS[s.bank].branch,
            ifsc: `${BANKS[s.bank].ifscPrefix}0000${(ids.bank[s.bank].charCodeAt(3) % 900) + 100}`,
            fdrNumber: docTruth.no,
            amountPaise: L(docTruth.amountL),
            issueDate: toDay(day(docTruth.issue)),
            maturityDate: toDay(day(docTruth.maturity)),
            interestRate: s.rate ?? "6.80",
            depositor: `${inst.trust} for ${inst.name}`,
            lienMarked: docTruth.lien,
          })
        : await makeOnlineReceiptPdf({
            txnRef: docTruth.no,
            amountPaise: L(docTruth.amountL),
            date: toDay(day(docTruth.issue)),
            termEnd: toDay(day(docTruth.maturity)),
            payer: inst.trust,
            gateway: `${BANKS[s.bank].name} (AICTE online collection)`,
          });
    fdrFile = await storePdf(bytes, `${s.type === "FDR" ? "FDR" : "Receipt"}-${docTruth.no}.pdf`, submittedAt);
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
    extraction = parseFdrText(text);
  }

  // 3. three-tier fields
  const fdrDocId = fdrFile ? `doc_${s.key}_${Math.random().toString(36).slice(2, 8)}` : null;
  const claimedV = fieldValues(claimedT, s.bank, s.type);
  const bankV = bankT ? fieldValues(bankT, s.bank, s.type) : null;
  const confirmedAt = day(Math.min(s.truth.issue + 10, -1)).toISOString();
  const fields = Object.fromEntries(
    FIELD_KEYS.map((k) => {
      const ex = extraction?.fields[k];
      const extracted = ex && ex.value !== null ? { value: ex.value, confidence: ex.confidence, documentId: fdrDocId, bbox: null, engine: extraction!.engine } : null;
      const skip = s.type === "ONLINE_DEPOSIT" && k === "lienNoted";
      const confirmed: Confirmed | null =
        s.confirmed && bankV && !skip
          ? { value: bankV[k], source: k === "lienNoted" ? "BANK_PORTAL_MOCK" : "AA_MOCK", fetchedAt: confirmedAt, ref: `mock-consent-seed-${s.key.toLowerCase()}` }
          : null;
      return [k, makeField(k, claimedV[k], skip ? null : extracted, confirmed)];
    }),
  ) as Record<FieldKey, ReturnType<typeof makeField>>;

  const intimation = day(s.truth.issue - 3);
  const ins = await db.instrument.create({
    data: {
      code: nextCode("INS"),
      institutionId: instId,
      type: s.type,
      status: s.status,
      bankId: ids.bank[s.bank],
      ...(Object.fromEntries(FIELD_KEYS.map((k) => [k, fields[k] as unknown as Prisma.InputJsonValue])) as Record<FieldKey, Prisma.InputJsonValue>),
      requiredAmount: L(s.requiredL ?? (inst.leased ? 100 : 50)),
      intimationDate: intimation,
      affidavitDueAt: addDays(intimation, DEFAULT_RULES.affidavitWindowDays),
      submittedAt,
      predecessorId: s.pred ? ids.ins[s.pred] : null,
      createdAt: submittedAt,
    },
  });
  ids.ins[s.key] = ins.id;

  await recordEvent(db, {
    instrumentId: ins.id,
    actor: actor(by),
    action: "INSTRUMENT_SUBMITTED",
    after: { code: ins.code, type: s.type, claimed: claimedV },
    reason: s.pred ? "RENEWAL" : s.doc === false ? "Legacy record keyed in from register" : "NEW_SUBMISSION",
    at: submittedAt,
  });

  if (fdrFile) {
    await attachDoc(ins.id, "FDR_COPY", fdrFile, by, submittedAt, { id: fdrDocId!, extractedJson: extraction });
    await recordEvent(db, { instrumentId: ins.id, actor: SYS, action: "AI_EXTRACTED", after: { engine: extraction!.engine, fields: extraction!.fields }, reason: "Extraction stored in the 'extracted' tier; not auto-accepted", at: submittedAt });
  }

  const aff = s.affidavit ?? "ontime";
  if (aff !== "missing") {
    const at = aff === "late" ? addDays(intimation, 35) : day(Math.min(s.truth.issue + 2, -1));
    const f = await storePdf(await makeAffidavitPdf("AFFIDAVIT_3", inst.name, toDay(at)), `Affidavit-3-${inst.pid}.pdf`, at);
    await attachDoc(ins.id, "AFFIDAVIT_3", f, by, at);
  }

  // 4. case history
  const caseType: CaseType = s.openCase?.type === "RELEASE" ? (s.pred ? "RENEWAL" : "NEW_SUBMISSION") : s.openCase?.type ?? (s.pred ? "RENEWAL" : "NEW_SUBMISSION");
  const submissionOpen = s.openCase && s.openCase.type !== "RELEASE";
  const opened = submissionOpen ? day(s.openCase!.opened) : submittedAt;
  const kase = await db.case.create({
    data: {
      code: nextCode("CASE"),
      instrumentId: ins.id,
      type: caseType,
      status: submissionOpen ? s.openCase!.status : "CLOSED",
      assigneeRole: submissionOpen ? (s.openCase!.status === "CLARIFICATION_REQUIRED" ? "INSTITUTION" : s.openCase!.status === "RO_SCRUTINY" ? "RO" : "BUREAU") : null,
      blockingReason: submissionOpen ? s.openCase!.blockingReason : null,
      openedAt: opened,
      statusChangedAt: submissionOpen ? day(s.openCase!.changed) : addDays(submittedAt, 14),
      closedAt: submissionOpen ? null : addDays(submittedAt, 14),
    },
  });
  await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor(by), action: "CASE_OPENED", after: { code: kase.code, type: caseType, status: "SUBMITTED" }, at: opened });

  if (submissionOpen) {
    const oc = s.openCase!;
    if (oc.status === "RO_SCRUTINY") {
      await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor(roFor(s.inst)), action: "CASE_START_SCRUTINY", before: { status: "SUBMITTED" }, after: { status: "RO_SCRUTINY" }, at: day(oc.changed) });
    } else if (oc.status === "COMPLETENESS_CHECK") {
      await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor("bureau2"), action: "CASE_COMPLETENESS_CHECK", before: { status: "SUBMITTED" }, after: { status: "COMPLETENESS_CHECK" }, at: day(oc.changed) });
    } else if (oc.status === "CLARIFICATION_REQUIRED") {
      await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor("bureau1"), action: "CASE_REQUEST_CLARIFICATION", before: { status: "SUBMITTED" }, after: { status: "CLARIFICATION_REQUIRED" }, reason: oc.blockingReason, at: day(oc.changed) });
    }
    return;
  }

  // closed/accepted history
  const acceptedAt = addDays(submittedAt, 14);
  if (s.confirmed) {
    await recordEvent(db, { instrumentId: ins.id, actor: actor("bureau2"), action: "AA_CONFIRMED", after: { provider: "Mock AA sandbox", consentId: `mock-consent-seed-${s.key.toLowerCase()}` }, at: addDays(submittedAt, 9) });
  }
  await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor("bureau1"), action: "CASE_ACCEPT", before: { status: "SUBMITTED" }, after: { status: "CLOSED" }, at: acceptedAt });
  await recordEvent(db, { instrumentId: ins.id, caseId: kase.id, actor: actor("bureau1"), action: "INSTRUMENT_STATUS", before: { status: "SUBMITTED" }, after: { status: "ACTIVE" }, reason: "Verified and recorded", at: acceptedAt });
  if (s.pred) {
    await recordEvent(db, { instrumentId: ids.ins[s.pred], caseId: kase.id, actor: actor("bureau1"), action: "INSTRUMENT_STATUS", before: { status: "ACTIVE" }, after: { status: "RENEWED" }, reason: `Superseded by ${ins.code}`, at: acceptedAt });
  }
}

async function seedReleaseFlows() {
  const konkan = INSTITUTIONS.konkan;

  // K1 — release blocked at Legal cell (Finance + Grievance cleared)
  {
    const insId = ids.ins.K1;
    const opened = day(-25);
    const kase = await db.case.create({
      data: { code: nextCode("CASE"), instrumentId: insId, type: "RELEASE", status: "CLEARANCES_PENDING", assigneeRole: "CELL", openedAt: opened, statusChangedAt: day(-18) },
    });
    await releaseDocs(insId, kase.id, konkan.name, opened);
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("instKonkan"), action: "CASE_OPENED", after: { code: kase.code, type: "RELEASE", status: "SUBMITTED" }, reason: "Term complete; requesting release under APH §6.46", at: opened });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("instKonkan"), action: "INSTRUMENT_STATUS", before: { status: "MATURED" }, after: { status: "RELEASE_REQUESTED" }, at: opened });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("bureau1"), action: "CASE_SEND_FOR_CLEARANCES", before: { status: "SUBMITTED" }, after: { status: "CLEARANCES_PENDING" }, at: day(-18) });
    const decided: [Cell, string | null, number | null][] = [
      ["FINANCE", "cellFin", -12],
      ["GRIEVANCE", "cellGriev", -9],
      ["LEGAL", null, null],
    ];
    for (const [cell, who, when] of decided) {
      await db.clearance.create({
        data: {
          caseId: kase.id,
          cell,
          status: who ? "CLEARED" : "PENDING",
          note: who ? (cell === "FINANCE" ? "No dues outstanding; interest accrued to AICTE reconciled" : "No pending grievance against the institution") : null,
          decidedById: who ? ids.user[who] : null,
          decidedAt: when !== null ? day(when) : null,
        },
      });
      if (who) await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor(who), action: "CLEARANCE_CLEARED", before: { cell, status: "PENDING" }, after: { cell, status: "CLEARED" }, at: day(when!) });
    }
  }

  // K2 — NOC issued 4 days ago; bank to lift lien
  await releaseWithNoc("K2", { opened: -40, nocAt: -4, closed: false });

  // M2 — released last year; first NOC revoked (wrong branch), re-issued NOC valid
  await releaseWithNoc("M2", { opened: -160, nocAt: -140, closed: true, revokeFirst: true });
}

async function releaseDocs(insId: string, caseId: string, instName: string, at: Date) {
  const by = Object.entries(instUser).find(([k]) => ids.inst[k as InstKey] && INSTITUTIONS[k as InstKey].name === instName)?.[1] ?? "admin1";
  const a6 = await storePdf(await makeAffidavitPdf("AFFIDAVIT_6", instName, toDay(at)), `Affidavit-6.pdf`, at);
  await attachDoc(insId, "AFFIDAVIT_6", a6, by, at, { caseId });
  const loa = await storePdf(await makeAffidavitPdf("AFFIDAVIT_3", instName, toDay(at)), `EoA-2026-27.pdf`, at);
  await attachDoc(insId, "LOA_EOA", loa, by, at, { caseId });
}

async function releaseWithNoc(key: string, o: { opened: number; nocAt: number; closed: boolean; revokeFirst?: boolean }) {
  const insId = ids.ins[key];
  const ins = await db.instrument.findUniqueOrThrow({ where: { id: insId }, include: { institution: true } });
  const opened = day(o.opened);
  const nocAt = day(o.nocAt);
  const kase = await db.case.create({
    data: {
      code: nextCode("CASE"),
      instrumentId: insId,
      type: "RELEASE",
      status: o.closed ? "CLOSED" : "NOC_ISSUED",
      assigneeRole: o.closed ? null : "BANK",
      penaltyPct: 0,
      penaltyRuleRef: DEFAULT_RULES.releasePenalties.none.ref,
      penaltyAmount: "0",
      decisionNote: "Release approved — all clearances in order",
      openedAt: opened,
      statusChangedAt: o.closed ? addDays(nocAt, 6) : nocAt,
      closedAt: o.closed ? addDays(nocAt, 6) : null,
    },
  });
  const by = key.startsWith("K") ? "instKonkan" : "admin1";
  await releaseDocs(insId, kase.id, ins.institution.name, opened);
  const steps: [string, string, string, Actor, number][] = [
    ["CASE_OPENED", "—", "SUBMITTED", actor(by), o.opened],
    ["CASE_SEND_FOR_CLEARANCES", "SUBMITTED", "CLEARANCES_PENDING", actor("bureau1"), o.opened + 4],
    ["PENALTY_ASSESSED", "CLEARANCES_PENDING", "PENALTY_ASSESSMENT", SYS, o.opened + 15],
    ["CASE_APPROVE_RELEASE", "PENALTY_ASSESSMENT", "DECISION_RECORDED", actor("auth1"), o.nocAt - 1],
    ["CASE_ISSUE_NOC", "DECISION_RECORDED", "NOC_ISSUED", actor("auth1"), o.nocAt],
  ];
  for (const cell of ["FINANCE", "LEGAL", "GRIEVANCE"] as Cell[]) {
    const who = cell === "FINANCE" ? "cellFin" : cell === "LEGAL" ? "cellLegal" : "cellGriev";
    await db.clearance.create({ data: { caseId: kase.id, cell, status: "CLEARED", note: "No objection", decidedById: ids.user[who], decidedAt: day(o.opened + 10) } });
  }
  for (const [action, from, to, a, when] of steps) {
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: a, action, before: from === "—" ? undefined : { status: from }, after: { status: to }, at: day(when) });
  }

  const docs = await db.document.findMany({ where: { instrumentId: insId, kind: { in: ["FDR_COPY", "AFFIDAVIT_6", "LOA_EOA"] } } });
  const fields = ins as unknown as Record<FieldKey, { claimed: FieldValue; confirmed: Confirmed | null }>;
  const principal = BigInt(String(fields.amount.confirmed?.value ?? fields.amount.claimed));
  const mkNoc = async (at: Date, addressedTo: string) => {
    const code = nextCode("NOC");
    const payload: NocPayload = {
      code,
      caseCode: kase.code,
      issuedAt: at.toISOString(),
      issuer: { name: "Dr. S. Raghavan", designation: "Member Secretary (Competent Authority)", office: "AICTE Regulation Bureau, New Delhi" },
      addressedTo,
      institution: { name: ins.institution.name, permanentId: ins.institution.permanentId, regionalOffice: ins.institution.regionalOffice },
      instrument: { code: ins.code, type: ins.type, bankName: String(fields.bankName.confirmed?.value ?? fields.bankName.claimed), fdrNumber: String(fields.fdrNumber.confirmed?.value ?? fields.fdrNumber.claimed), principalPaise: principal.toString() },
      deduction: { pct: 0, amountPaise: penaltyAmount(principal, 0).toString(), ruleRef: DEFAULT_RULES.releasePenalties.none.ref },
      payableToTrustPaise: principal.toString(),
      interest: "Accrued interest is payable to AICTE (APH 2024-27 §1.12); only principal returns to the Trust.",
      documents: docs.map((d) => ({ kind: d.kind, sha256: d.sha256 })),
    };
    const sha256 = hashJson(payload);
    const noc = await db.noc.create({ data: { code, caseId: kase.id, instrumentId: insId, issuedById: ids.user.auth1, issuedAt: at, payload: payload as unknown as Prisma.InputJsonValue, sha256 } });
    await anchor(db, "NOC", noc.id, sha256);
    await db.ledgerAnchor.updateMany({ where: { refType: "NOC", refId: noc.id }, data: { anchoredAt: at } });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("auth1"), action: "NOC_ISSUED", after: { noc: code, sha256 }, at });
    return noc;
  };

  const bankName = String(fields.bankName.confirmed?.value ?? fields.bankName.claimed);
  if (o.revokeFirst) {
    const first = await mkNoc(addDays(nocAt, -2), `The Branch Manager, ${bankName}, Kozhikode Beach Road Branch`);
    const reason = "Addressed to the wrong branch; superseded by a re-issued NOC";
    await db.noc.update({ where: { id: first.id }, data: { revokedAt: addDays(nocAt, -1), revokeReason: reason } });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("auth1"), action: "NOC_REVOKED", after: { noc: first.code }, reason, at: addDays(nocAt, -1) });
  }
  await mkNoc(nocAt, `The Branch Manager, ${bankName}`);

  if (o.closed) {
    const at = addDays(nocAt, 6);
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("admin1"), action: "CASE_BANK_CONFIRM", before: { status: "NOC_ISSUED" }, after: { status: "BANK_CONFIRMED" }, reason: "Bank confirmation received by letter", at });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("admin1"), action: "INSTRUMENT_STATUS", before: { status: "RELEASE_REQUESTED" }, after: { status: "RELEASED" }, reason: "Lien lifted; principal paid to Trust", at });
    await recordEvent(db, { instrumentId: insId, caseId: kase.id, actor: actor("admin1"), action: "CASE_CLOSED", before: { status: "BANK_CONFIRMED" }, after: { status: "CLOSED" }, at });
    const recs = await db.bankDepositRecord.findMany({ where: { bankId: ins.bankId! } });
    const rec = recs.find((r) => r.fdrNumber === fields.fdrNumber.claimed);
    if (rec) await db.bankDepositRecord.update({ where: { id: rec.id }, data: { status: "LIEN_RELEASED", lienMarked: false } });
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });



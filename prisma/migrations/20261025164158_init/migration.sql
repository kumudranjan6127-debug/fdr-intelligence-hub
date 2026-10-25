-- CreateEnum
CREATE TYPE "Role" AS ENUM ('INSTITUTION', 'BANK', 'RO', 'BUREAU', 'CELL', 'AUTHORITY', 'ADMIN');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('FDR', 'ONLINE_DEPOSIT');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_SCRUTINY', 'ACTIVE', 'EXPIRING', 'MATURED', 'RENEWED', 'REPLACED', 'RELEASE_REQUESTED', 'RELEASED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('NEW_SUBMISSION', 'RENEWAL', 'REPLACEMENT', 'RELEASE');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COMPLETENESS_CHECK', 'RO_SCRUTINY', 'CLARIFICATION_REQUIRED', 'CLEARANCES_PENDING', 'PENALTY_ASSESSMENT', 'DECISION_RECORDED', 'NOC_ISSUED', 'BANK_CONFIRMED', 'CLOSED', 'RETURNED', 'REJECTED', 'WITHDRAWN', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('CLAIMED', 'EXTRACTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('FDR_COPY', 'AFFIDAVIT_3', 'AFFIDAVIT_6', 'LOA_EOA', 'BANK_CONFIRMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "Cell" AS ENUM ('FINANCE', 'LEGAL', 'GRIEVANCE');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('PENDING', 'CLEARED', 'OBJECTION');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MED', 'HIGH');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('MATURITY_90', 'MATURITY_30', 'MATURITY_7', 'OVERDUE', 'AFFIDAVIT_DUE');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INAPP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AnchorRefType" AS ENUM ('DOCUMENT', 'EVENT', 'NOC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "designation" TEXT,
    "cell" "Cell",
    "institutionId" TEXT,
    "bankId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "regionalOffice" TEXT NOT NULL,
    "permanentId" TEXT NOT NULL,
    "isGovernment" BOOLEAN NOT NULL DEFAULT false,
    "isLeased" BOOLEAN NOT NULL DEFAULT false,
    "programmes" INTEGER NOT NULL DEFAULT 1,
    "lastEoaYear" INTEGER,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ifscPrefix" TEXT NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "type" "InstrumentType" NOT NULL,
    "status" "InstrumentStatus" NOT NULL DEFAULT 'DRAFT',
    "bankId" TEXT,
    "bankName" JSONB NOT NULL,
    "fdrNumber" JSONB NOT NULL,
    "amount" JSONB NOT NULL,
    "issueDate" JSONB NOT NULL,
    "maturityDate" JSONB NOT NULL,
    "lienNoted" JSONB NOT NULL,
    "requiredAmount" DECIMAL(16,0) NOT NULL,
    "intimationDate" TIMESTAMP(3),
    "affidavitDueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "predecessorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "data" BYTEA,
    "blobUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "caseId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "fileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "extractedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assigneeRole" "Role",
    "assigneeId" TEXT,
    "blockingReason" TEXT,
    "nextAction" TEXT,
    "penaltyPct" DECIMAL(5,2),
    "penaltyRuleRef" TEXT,
    "penaltyAmount" DECIMAL(16,0),
    "decisionNote" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clearance" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "cell" "Cell" NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Clearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "instrumentId" TEXT,
    "caseId" TEXT,
    "actorId" TEXT,
    "actorRole" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "prevSha256" TEXT,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "message" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "channel" "Channel" NOT NULL DEFAULT 'INAPP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Noc" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "sha256" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "Noc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAnchor" (
    "id" TEXT NOT NULL,
    "refType" "AnchorRefType" NOT NULL,
    "refId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "anchoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txRef" TEXT,

    CONSTRAINT "LedgerAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "rules" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankDepositRecord" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "fdrNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "inFavourOf" TEXT NOT NULL,
    "principal" DECIMAL(16,0) NOT NULL,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "lienMarked" BOOLEAN NOT NULL,
    "lienHolder" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "BankDepositRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_permanentId_key" ON "Institution"("permanentId");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_code_key" ON "Instrument"("code");

-- CreateIndex
CREATE INDEX "Instrument_institutionId_idx" ON "Instrument"("institutionId");

-- CreateIndex
CREATE INDEX "Instrument_status_idx" ON "Instrument"("status");

-- CreateIndex
CREATE INDEX "Document_instrumentId_idx" ON "Document"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_code_key" ON "Case"("code");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Clearance_caseId_cell_key" ON "Clearance"("caseId", "cell");

-- CreateIndex
CREATE UNIQUE INDEX "Event_seq_key" ON "Event"("seq");

-- CreateIndex
CREATE INDEX "Event_instrumentId_idx" ON "Event"("instrumentId");

-- CreateIndex
CREATE INDEX "Event_caseId_idx" ON "Event"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Discrepancy_instrumentId_code_field_key" ON "Discrepancy"("instrumentId", "code", "field");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_instrumentId_kind_key" ON "Reminder"("instrumentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Noc_code_key" ON "Noc"("code");

-- CreateIndex
CREATE INDEX "LedgerAnchor_refType_refId_idx" ON "LedgerAnchor"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSet_version_key" ON "RuleSet"("version");

-- CreateIndex
CREATE UNIQUE INDEX "BankDepositRecord_bankId_fdrNumber_key" ON "BankDepositRecord"("bankId", "fdrNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clearance" ADD CONSTRAINT "Clearance_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Noc" ADD CONSTRAINT "Noc_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Noc" ADD CONSTRAINT "Noc_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Noc" ADD CONSTRAINT "Noc_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankDepositRecord" ADD CONSTRAINT "BankDepositRecord_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

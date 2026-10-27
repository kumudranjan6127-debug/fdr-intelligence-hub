-- Inputs for APH-sourced rules: programme mix (Table 1.4) and lapsed closure documents (cl. 2.21(h)).
ALTER TABLE "Institution" ADD COLUMN "programmeLevels" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "closureDocsLapsed" BOOLEAN NOT NULL DEFAULT false;

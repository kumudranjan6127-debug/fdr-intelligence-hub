-- Real sign-in: scrypt password hash plus a DB-backed lockout after repeated failures.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

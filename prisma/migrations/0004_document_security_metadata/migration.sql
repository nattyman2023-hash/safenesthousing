-- Persist document integrity and malware-scan state without storing file contents.
ALTER TABLE "Document" ADD COLUMN "sha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "malwareScanStatus" TEXT NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "Document" ADD COLUMN "malwareScannedAt" DATETIME;

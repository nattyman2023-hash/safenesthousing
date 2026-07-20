-- Add governed retention and data-subject request review state.
ALTER TABLE "DataRetentionRule" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DataRetentionRule" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DataSubjectRequest" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DataSubjectRequest" ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DataSubjectRequest" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "DataSubjectRequest" ADD COLUMN "reviewedAt" DATETIME;

CREATE UNIQUE INDEX "DataRetentionRule_organisationId_resourceType_key" ON "DataRetentionRule"("organisationId", "resourceType");
CREATE INDEX "DataRetentionRule_organisationId_active_idx" ON "DataRetentionRule"("organisationId", "active");
CREATE INDEX "DataSubjectRequest_organisationId_status_dueAt_idx" ON "DataSubjectRequest"("organisationId", "status", "dueAt");

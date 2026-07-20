-- Persist safe, auditable retention review summaries without storing record contents.
CREATE TABLE "DataRetentionReviewRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "summaryJson" TEXT NOT NULL,
    CONSTRAINT "DataRetentionReviewRun_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DataRetentionReviewRun_organisationId_startedAt_idx" ON "DataRetentionReviewRun"("organisationId", "startedAt");

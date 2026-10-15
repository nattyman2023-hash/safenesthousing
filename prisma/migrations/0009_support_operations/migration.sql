-- Support & Housing Management System: additive columns on existing records plus
-- the new Support & Risk, operations, appointments, concerns, complaints, compliance,
-- and policy/resource stores. Purely additive — no table is redefined or dropped.

-- Service user profile: support worker, lifecycle dates, and contact/safe & well frequency.
ALTER TABLE "Client" ADD COLUMN "supportWorkerId" TEXT;
ALTER TABLE "Client" ADD COLUMN "dischargeDate" DATETIME;
ALTER TABLE "Client" ADD COLUMN "moveInTargetDate" DATETIME;
ALTER TABLE "Client" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "Client" ADD COLUMN "contactFrequencyDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Client" ADD COLUMN "safeWellFrequencyDays" INTEGER NOT NULL DEFAULT 30;

CREATE INDEX "Client_organisationId_supportWorkerId_idx" ON "Client"("organisationId", "supportWorkerId");

-- Contact records: when, how, whether it counted, and when the next one is due.
-- SQLite cannot add a NOT NULL column with a non-constant default, so the table is
-- redefined; existing rows are copied across and defaulted to a completed contact.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CaseNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "outcome" TEXT,
    "followUpAction" TEXT,
    "followUpDate" DATETIME,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'OTHER',
    "direction" TEXT DEFAULT 'OUTBOUND',
    "durationMinutes" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "attempted" BOOLEAN NOT NULL DEFAULT false,
    "meaningful" BOOLEAN NOT NULL DEFAULT true,
    "nextContactDueAt" DATETIME,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "finalised" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CaseNote" ("authorId", "category", "clientId", "contactType", "createdAt", "finalised", "followUpAction", "followUpDate", "id", "note", "outcome", "restricted") SELECT "authorId", "category", "clientId", "contactType", "createdAt", "finalised", "followUpAction", "followUpDate", "id", "note", "outcome", "restricted" FROM "CaseNote";
DROP TABLE "CaseNote";
ALTER TABLE "new_CaseNote" RENAME TO "CaseNote";
CREATE INDEX "CaseNote_clientId_createdAt_idx" ON "CaseNote"("clientId", "createdAt");
CREATE INDEX "CaseNote_clientId_occurredAt_idx" ON "CaseNote"("clientId", "occurredAt");
CREATE INDEX "CaseNote_clientId_meaningful_completed_idx" ON "CaseNote"("clientId", "meaningful", "completed");

-- Tasks become workflow-driven: department, category, automation key, recurrence, links.
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "clientId" TEXT,
    "propertyId" TEXT,
    "referralId" TEXT,
    "incidentId" TEXT,
    "department" TEXT NOT NULL DEFAULT 'SUPPORT',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "automationKey" TEXT,
    "recurrenceRule" TEXT,
    "recurrenceIntervalDays" INTEGER,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assignedToId", "clientId", "createdAt", "description", "dueAt", "id", "incidentId", "organisationId", "priority", "propertyId", "referralId", "status", "title") SELECT "assignedToId", "clientId", "createdAt", "description", "dueAt", "id", "incidentId", "organisationId", "priority", "propertyId", "referralId", "status", "title" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_organisationId_status_dueAt_idx" ON "Task"("organisationId", "status", "dueAt");
CREATE INDEX "Task_organisationId_department_status_idx" ON "Task"("organisationId", "department", "status");
CREATE INDEX "Task_organisationId_assignedToId_status_idx" ON "Task"("organisationId", "assignedToId", "status");
CREATE INDEX "Task_clientId_status_idx" ON "Task"("clientId", "status");
CREATE UNIQUE INDEX "Task_organisationId_automationKey_key" ON "Task"("organisationId", "automationKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Invoices can be attributed to the service user and to a billing period.
ALTER TABLE "Invoice" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "periodEnd" DATETIME;

CREATE INDEX "Invoice_clientId_status_idx" ON "Invoice"("clientId", "status");

-- CreateTable
CREATE TABLE "PenPortrait" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "aboutMe" TEXT,
    "myNeeds" TEXT,
    "howIShow" TEXT,
    "whatMatters" TEXT,
    "myStrengths" TEXT,
    "communication" TEXT,
    "likes" TEXT,
    "dislikes" TEXT,
    "healthNeeds" TEXT,
    "risksToMe" TEXT,
    "whoSupportsMe" TEXT,
    "completedAt" DATETIME,
    "reviewDueAt" DATETIME,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PenPortrait_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PenPortrait_clientId_key" ON "PenPortrait"("clientId");
CREATE INDEX "PenPortrait_status_reviewDueAt_idx" ON "PenPortrait"("status", "reviewDueAt");

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL DEFAULT 'SUPPORT',
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewDueAt" DATETIME,
    "assessedBy" TEXT,
    "summary" TEXT,
    "controlMeasures" TEXT,
    "triggerReason" TEXT,
    "supersedesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiskAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RiskAssessment_clientId_status_idx" ON "RiskAssessment"("clientId", "status");
CREATE INDEX "RiskAssessment_status_reviewDueAt_idx" ON "RiskAssessment"("status", "reviewDueAt");
CREATE INDEX "RiskAssessment_level_status_idx" ON "RiskAssessment"("level", "status");

-- CreateTable
CREATE TABLE "RiskFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "riskAssessmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "score" INTEGER NOT NULL DEFAULT 9,
    "controlMeasures" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskFactor_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RiskFactor_riskAssessmentId_score_idx" ON "RiskFactor"("riskAssessmentId", "score");

-- CreateTable
CREATE TABLE "SafeWellCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" DATETIME,
    "completedAt" DATETIME,
    "checkedById" TEXT,
    "method" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "concernRaised" BOOLEAN NOT NULL DEFAULT false,
    "concernSummary" TEXT,
    "actionsTaken" TEXT,
    "nextDueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SafeWellCheck_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SafeWellCheck_clientId_status_idx" ON "SafeWellCheck"("clientId", "status");
CREATE INDEX "SafeWellCheck_status_nextDueAt_idx" ON "SafeWellCheck"("status", "nextDueAt");

-- CreateTable
CREATE TABLE "MoveChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "checklistType" TEXT NOT NULL DEFAULT 'MOVE_IN',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "targetDate" DATETIME,
    "completedAt" DATETIME,
    "propertyId" TEXT,
    "placementId" TEXT,
    "createdBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MoveChecklist_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MoveChecklist_clientId_checklistType_status_idx" ON "MoveChecklist"("clientId", "checklistType", "status");
CREATE INDEX "MoveChecklist_status_targetDate_idx" ON "MoveChecklist"("status", "targetDate");

-- CreateTable
CREATE TABLE "MoveChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoveChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "MoveChecklist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MoveChecklistItem_checklistId_sortOrder_idx" ON "MoveChecklistItem"("checklistId", "sortOrder");
CREATE INDEX "MoveChecklistItem_status_dueAt_idx" ON "MoveChecklistItem"("status", "dueAt");


-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "propertyId" TEXT,
    "roomId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "trade" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "safetyRisk" BOOLEAN NOT NULL DEFAULT false,
    "reportedById" TEXT,
    "assignedToId" TEXT,
    "contractor" TEXT,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetFixAt" DATETIME,
    "completedAt" DATETIME,
    "costMinor" INTEGER,
    CONSTRAINT "MaintenanceTicket_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceTicket_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MaintenanceTicket_reference_key" ON "MaintenanceTicket"("reference");
CREATE INDEX "MaintenanceTicket_organisationId_status_priority_idx" ON "MaintenanceTicket"("organisationId", "status", "priority");
CREATE INDEX "MaintenanceTicket_organisationId_propertyId_status_idx" ON "MaintenanceTicket"("organisationId", "propertyId", "status");
CREATE INDEX "MaintenanceTicket_clientId_status_idx" ON "MaintenanceTicket"("clientId", "status");
CREATE INDEX "MaintenanceTicket_status_targetFixAt_idx" ON "MaintenanceTicket"("status", "targetFixAt");

-- CreateTable
CREATE TABLE "MaintenanceUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "status" TEXT,
    "note" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceUpdate_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MaintenanceUpdate_ticketId_createdAt_idx" ON "MaintenanceUpdate"("ticketId", "createdAt");

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT,
    "propertyId" TEXT,
    "ticketId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SUPPORT',
    "location" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "ownerId" TEXT,
    "attendees" TEXT,
    "notes" TEXT,
    "completedAt" DATETIME,
    "outcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Appointment_organisationId_startsAt_idx" ON "Appointment"("organisationId", "startsAt");
CREATE INDEX "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt");
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");


-- CreateTable
CREATE TABLE "Concern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "propertyId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'WELFARE',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raisedById" TEXT,
    "ownerId" TEXT,
    "raisedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "referralNeeded" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Concern_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Concern_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Concern_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Concern_reference_key" ON "Concern"("reference");
CREATE INDEX "Concern_organisationId_status_severity_idx" ON "Concern"("organisationId", "status", "severity");
CREATE INDEX "Concern_clientId_status_idx" ON "Concern"("clientId", "status");
CREATE INDEX "Concern_status_dueAt_idx" ON "Concern"("status", "dueAt");

-- CreateTable
CREATE TABLE "ConcernAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concernId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConcernAction_concernId_fkey" FOREIGN KEY ("concernId") REFERENCES "Concern" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ConcernAction_concernId_createdAt_idx" ON "ConcernAction"("concernId", "createdAt");

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "raisedBy" TEXT NOT NULL DEFAULT 'SERVICE_USER',
    "complainantName" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SERVICE',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "stage" TEXT NOT NULL DEFAULT 'STAGE_1',
    "ownerId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "dueAt" DATETIME,
    "closedAt" DATETIME,
    "outcome" TEXT,
    "learning" TEXT,
    CONSTRAINT "Complaint_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Complaint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Complaint_reference_key" ON "Complaint"("reference");
CREATE INDEX "Complaint_organisationId_status_dueAt_idx" ON "Complaint"("organisationId", "status", "dueAt");
CREATE INDEX "Complaint_clientId_status_idx" ON "Complaint"("clientId", "status");


-- CreateTable
CREATE TABLE "PropertyComplianceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "complianceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "lastCheckedAt" DATETIME,
    "nextDueAt" DATETIME,
    "certificateRef" TEXT,
    "contractor" TEXT,
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PropertyComplianceRecord_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PropertyComplianceRecord_propertyId_complianceType_idx" ON "PropertyComplianceRecord"("propertyId", "complianceType");
CREATE INDEX "PropertyComplianceRecord_status_nextDueAt_idx" ON "PropertyComplianceRecord"("status", "nextDueAt");

-- CreateTable
CREATE TABLE "PolicyResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'POLICY',
    "summary" TEXT,
    "version" TEXT,
    "documentId" TEXT,
    "externalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "effectiveFrom" DATETIME,
    "reviewDueAt" DATETIME,
    "requiresRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PolicyResource_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PolicyResource_organisationId_category_status_idx" ON "PolicyResource"("organisationId", "category", "status");
CREATE INDEX "PolicyResource_status_reviewDueAt_idx" ON "PolicyResource"("status", "reviewDueAt");


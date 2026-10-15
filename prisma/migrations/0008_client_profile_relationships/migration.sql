-- Additive client profile fields and structured relationship records.
ALTER TABLE "Client" ADD COLUMN "phone" TEXT;
ALTER TABLE "Client" ADD COLUMN "email" TEXT;
ALTER TABLE "Client" ADD COLUMN "address" TEXT;
ALTER TABLE "Client" ADD COLUMN "gender" TEXT;
ALTER TABLE "Client" ADD COLUMN "pronouns" TEXT;
ALTER TABLE "Client" ADD COLUMN "admissionDate" DATETIME;
ALTER TABLE "Client" ADD COLUMN "importantAlerts" TEXT;
ALTER TABLE "Client" ADD COLUMN "safeguardingFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Placement" ADD COLUMN "endedReason" TEXT;
ALTER TABLE "Document" ADD COLUMN "clientId" TEXT;

CREATE TABLE "RelatedPerson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "preferredContactMethod" TEXT,
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RelatedPerson_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ClientRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "relatedClientId" TEXT,
    "relatedPersonId" TEXT,
    "relationshipType" TEXT NOT NULL,
    "inverseRelationshipType" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "notes" TEXT,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "isNextOfKin" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientRelationship_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientRelationship_relatedClientId_fkey" FOREIGN KEY ("relatedClientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientRelationship_relatedPersonId_fkey" FOREIGN KEY ("relatedPersonId") REFERENCES "RelatedPerson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientRelationship_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientRelationship_one_target_check" CHECK (("relatedClientId" IS NOT NULL AND "relatedPersonId" IS NULL) OR ("relatedClientId" IS NULL AND "relatedPersonId" IS NOT NULL))
);

CREATE INDEX "Client_organisationId_keyWorkerId_idx" ON "Client"("organisationId", "keyWorkerId");
CREATE INDEX "Document_organisationId_clientId_createdAt_idx" ON "Document"("organisationId", "clientId", "createdAt");
CREATE INDEX "RelatedPerson_organisationId_fullName_idx" ON "RelatedPerson"("organisationId", "fullName");
CREATE INDEX "ClientRelationship_clientId_endDate_idx" ON "ClientRelationship"("clientId", "endDate");
CREATE INDEX "ClientRelationship_relatedClientId_endDate_idx" ON "ClientRelationship"("relatedClientId", "endDate");
CREATE INDEX "ClientRelationship_relatedPersonId_endDate_idx" ON "ClientRelationship"("relatedPersonId", "endDate");
CREATE UNIQUE INDEX "ClientRelationship_clientId_relatedClientId_relationshipType_key" ON "ClientRelationship"("clientId", "relatedClientId", "relationshipType");

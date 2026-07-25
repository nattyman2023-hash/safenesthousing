-- Store organisation-level provider credentials encrypted by the application.
CREATE TABLE "OrganisationSecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "secretCipher" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganisationSecret_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrganisationSecret_organisationId_key_key" ON "OrganisationSecret"("organisationId", "key");

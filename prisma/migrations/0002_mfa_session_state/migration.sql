-- Add the server-side marker set only after a required MFA challenge succeeds.
ALTER TABLE "UserSession" ADD COLUMN "mfaVerifiedAt" DATETIME;

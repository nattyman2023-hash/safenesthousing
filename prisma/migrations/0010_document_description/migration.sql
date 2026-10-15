-- Service user profile documents: an optional plain-language description of the file.
-- Purely additive: one nullable column, no table is redefined or dropped, so existing
-- documents keep their bytes, metadata and audit history untouched.
ALTER TABLE "Document" ADD COLUMN "description" TEXT;

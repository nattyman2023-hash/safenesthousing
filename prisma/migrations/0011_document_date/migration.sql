-- Service user profile documents: an optional date carried on the document itself, which can differ
-- from when the file was uploaded. Purely additive: one nullable column, no table is redefined or
-- dropped, so existing documents keep their bytes, metadata and audit history untouched.
ALTER TABLE "Document" ADD COLUMN "documentDate" DATETIME;
# Data retention

The schema includes `retentionUntil`, `DataRetentionRule`, and data-subject request records so approved policies can be applied consistently. No retention period is invented in this repository: the organisation must decide periods by record category, legal obligation, safeguarding need, contractual duty, and operational policy.

Authorised governance reviewers use `/crm/governance` to create or update rules. Every active rule requires a legal-basis or policy reference, is unique per organisation and record type, and is written to the audit log.

Data-subject requests are logged against an approved subject reference rather than requiring a full name. Request notes and references are excluded from audit metadata. A request created with a legal hold is placed on hold, and the API requires the hold to be released and saved as a separate review step before completion or decline. Closing also requires a resolution note and records the reviewing user and time.

The current review engine is deliberately dry-run only. A governance reviewer can run it from `/crm/governance`, or an external scheduler can `POST /api/internal/retention-review` with `Authorization: Bearer $RETENTION_REVIEW_SECRET`. Each run stores a summary and audit event covering evaluated rules, candidates, policy-reference gaps, legal-hold exclusions, open-request exclusions, and reviewable candidates. No record is deleted or anonymised.

The scheduler secret must be a strong production secret and is checked by `npm run check:production-config`. Records required for audit, safeguarding, legal hold, or an open subject request must not be deleted by ordinary users. Any future deletion or anonymisation job must re-check legal holds and open requests at execution time and require a separately approved implementation.

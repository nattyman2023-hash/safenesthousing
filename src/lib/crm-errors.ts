/**
 * CRM data-access failure.
 *
 * Authenticated CRM pages must never replace a failed query with fixture records. Loaders log the
 * real cause on the server and throw this error; the nearest error boundary (`src/app/crm/error.tsx`)
 * renders an honest "data unavailable" state. The message deliberately contains no query text,
 * record identifiers or database internals, so it is safe to surface to the signed-in user.
 */
export class CrmDataUnavailableError extends Error {
  readonly scope: string;

  constructor(scope: string) {
    super('CRM data is temporarily unavailable.');
    this.name = 'CrmDataUnavailableError';
    this.scope = scope;
  }
}

/** Log a CRM data-access failure on the server only, without exposing the cause to the browser. */
export function reportCrmDataError(scope: string, error: unknown) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  console.error(`[crm:${scope}] data access failed - ${detail}`);
}

/** Log and convert a query failure into the error the CRM boundary understands. */
export function crmDataUnavailable(scope: string, error: unknown) {
  reportCrmDataError(scope, error);
  return new CrmDataUnavailableError(scope);
}

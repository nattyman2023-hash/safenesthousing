'use client';

import { useEffect } from 'react';
import { CrmPageHeader, EmptyState } from '@/components/CrmUI';

/**
 * Honest error state for every authenticated CRM segment.
 *
 * A database failure, a refused query, or an unexpected server error must never look like a
 * successfully loaded page. Nothing is rendered from fixtures or stale assumptions: the page says
 * the live data could not be read and offers a retry. The underlying cause has already been logged
 * server-side by the loader; only the opaque digest is repeated here so query text, record
 * identifiers and database internals never reach the browser console.
 */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[crm] page failed to load', error.digest ?? 'no digest');
  }, [error]);

  return (
    <div className="crm-page">
      <CrmPageHeader
        eyebrow="Data unavailable"
        title="This page could not be loaded"
        intro="The live records behind this page could not be read, so nothing is being displayed. No records have been changed."
      />
      <EmptyState
        title="Live data unavailable"
        message="This is a data-access problem, not an empty register. Try again; if it keeps happening, ask your administrator to check the database and server logs."
      />
      <p style={{ marginTop: 14 }}>
        <button type="button" className="crm-button crm-button-secondary" onClick={reset}>Try again</button>
      </p>
    </div>
  );
}

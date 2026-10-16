'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Archive / restore a service-user record.
 *
 * Service-user records are never deleted. They carry placements, case notes, incidents, documents and
 * safeguarding history, and the audit trail has to remain complete, so the correct way to remove a
 * person from day-to-day use is the status the schema already defines: ARCHIVED. `PATCH
 * /api/crm/clients/[id]` accepts `status` and audits the change; this control is the staff-facing half
 * of that endpoint, which until now existed only as an API call.
 *
 * Restoring returns the record to CURRENT, the status the client schema treats as active.
 */
export function ClientStatusControl({ clientId, displayName, status }: { clientId: string; displayName: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const archived = status === 'ARCHIVED';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archived && !armed) { setArmed(true); setState(null); return; }
    setBusy(true); setState(null);
    const response = await fetch(`/api/crm/clients/${clientId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: archived ? 'CURRENT' : 'ARCHIVED' }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) { setState({ text: archived ? 'Record restored to current.' : 'Record archived.', ok: true }); setArmed(false); router.refresh(); }
    else { setState({ text: result.error ?? 'Unable to change the record status.', ok: false }); setArmed(false); }
    setBusy(false);
  }

  return <form onSubmit={submit} method="post">
    {state && <div className={state.ok ? 'form-success' : 'form-error'} role="status" style={{ fontSize: 12, marginBottom: 8 }}>{state.text}</div>}
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy} aria-label={archived ? `Restore ${displayName} to current` : armed ? `Confirm archive of ${displayName}` : `Archive ${displayName}`}>{busy ? 'Saving…' : archived ? 'Restore to current' : armed ? 'Confirm archive' : 'Archive record'}</button>
    {armed && <button type="button" className="crm-button crm-button-secondary" style={{ marginLeft: 6 }} onClick={() => setArmed(false)} disabled={busy}>Cancel</button>}
  </form>;
}

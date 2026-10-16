'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

type ServiceReferences = { referrals: number; clients: number; properties: number; rotaShifts: number };

/**
 * Delete a service, with the refusal enforced where it matters.
 *
 * The control stays enabled even when other records point at the service, and the endpoint refuses
 * the delete with an explanation. Hiding or disabling the button would look safer but would put the
 * safety rule in the browser, where a stale page (counts loaded before a referral was recorded) could
 * still send the request. The server owns the rule; this component reports its answer.
 *
 * Deletion is confirmed in two steps because it is the only irreversible action on this page.
 */
export function ServiceDeleteControl({ serviceId, title, references }: { serviceId: string; title: string; references: ServiceReferences }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const linked = [
    references.referrals ? `${references.referrals} referral${references.referrals === 1 ? '' : 's'}` : '',
    references.clients ? `${references.clients} client record${references.clients === 1 ? '' : 's'}` : '',
    references.properties ? `${references.properties} propert${references.properties === 1 ? 'y' : 'ies'}` : '',
    references.rotaShifts ? `${references.rotaShifts} rota shift${references.rotaShifts === 1 ? '' : 's'}` : ''
  ].filter(Boolean);

  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!armed) { setArmed(true); setState(null); return; }
    setBusy(true); setState(null);
    const response = await fetch(`/api/crm/content/services/${serviceId}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (response.ok) { setState({ text: 'Service deleted.', ok: true }); setArmed(false); router.refresh(); }
    else { setState({ text: result.error ?? 'Unable to delete the service.', ok: false }); setArmed(false); }
    setBusy(false);
  }

  return <form onSubmit={remove} method="post">
    {state && <div className={state.ok ? 'form-success' : 'form-error'} role="status" style={{ fontSize: 11, marginBottom: 6, maxWidth: 320 }}>{state.text}</div>}
    {linked.length > 0 && !state && <p className="muted" style={{ fontSize: 11, marginBottom: 6, maxWidth: 320 }}>In use by {linked.join(', ')}. Deleting will be refused — unpublish instead.</p>}
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy} aria-label={armed ? `Confirm delete of ${title}` : `Delete ${title}`}>{busy ? 'Deleting…' : armed ? 'Confirm delete' : 'Delete'}</button>
    {armed && <button type="button" className="crm-button crm-button-secondary" style={{ marginLeft: 6 }} onClick={() => setArmed(false)} disabled={busy}>Cancel</button>}
  </form>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MAINTENANCE_STATUSES } from '@/lib/operations-domain';
import { useHydrated } from '@/lib/use-hydrated';

export function MaintenanceUpdateControl({ ticketId, status }: { ticketId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const targetFixAt = String(form.get('targetFixAt') ?? '').trim();
    const response = await fetch(`/api/crm/maintenance/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: form.get('status'),
        note: form.get('note'),
        contractor: form.get('contractor') || undefined,
        targetFixAt: targetFixAt ? new Date(targetFixAt).toISOString() : undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the repair.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select name="status" aria-label="Repair status" defaultValue={status}>{MAINTENANCE_STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select>
    <input name="note" placeholder="Progress note" aria-label="Progress note" required />
    <input name="contractor" placeholder="Contractor (optional)" aria-label="Contractor" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}

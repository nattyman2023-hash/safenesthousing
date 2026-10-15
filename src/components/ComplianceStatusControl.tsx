'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPLIANCE_STATUSES } from '@/lib/compliance-domain';
import { useHydrated } from '@/lib/use-hydrated';

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export function ComplianceStatusControl({ recordId, propertyId, status }: { recordId: string; propertyId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const checked = String(form.get('lastCheckedAt') ?? '').trim();
    const due = String(form.get('nextDueAt') ?? '').trim();
    const response = await fetch(`/api/crm/compliance/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        status: form.get('status'),
        lastCheckedAt: checked ? new Date(checked).toISOString() : undefined,
        nextDueAt: due ? new Date(due).toISOString() : undefined,
        certificateRef: form.get('certificateRef') || undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the compliance record.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select name="status" aria-label="Compliance status" defaultValue={status}>{COMPLIANCE_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <input name="lastCheckedAt" type="date" aria-label="Last checked" />
    <input name="nextDueAt" type="date" aria-label="Next due" />
    <input name="certificateRef" placeholder="Certificate ref" aria-label="Certificate reference" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}

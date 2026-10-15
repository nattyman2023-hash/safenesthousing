'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { POLICY_STATUSES } from '@/lib/compliance-domain';
import { useHydrated } from '@/lib/use-hydrated';

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export function PolicyStatusControl({ policyId, status }: { policyId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const reviewDueAt = String(form.get('reviewDueAt') ?? '').trim();
    const response = await fetch(`/api/crm/policies/${policyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: form.get('status'),
        version: form.get('version') || undefined,
        reviewDueAt: reviewDueAt ? new Date(reviewDueAt).toISOString() : undefined,
        summary: form.get('summary') || undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the policy.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select name="status" aria-label="Policy status" defaultValue={status}>{POLICY_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <input name="version" placeholder="Version" aria-label="Version" />
    <input name="reviewDueAt" type="date" aria-label="Review due" />
    <input name="summary" placeholder="Summary update (optional)" aria-label="Summary update" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}

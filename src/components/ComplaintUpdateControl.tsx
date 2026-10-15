'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMPLAINT_OUTCOMES, COMPLAINT_STAGES, COMPLAINT_STATUSES } from '@/lib/complaints-domain';
import { CONCERN_SEVERITIES } from '@/lib/concerns-domain';
import { useHydrated } from '@/lib/use-hydrated';

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();

export function ComplaintUpdateControl({ complaintId, status, stage, severity }: { complaintId: string; status: string; stage: string; severity: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/complaints/${complaintId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: form.get('status'),
        stage: form.get('stage'),
        severity: form.get('severity'),
        outcome: form.get('outcome') || undefined,
        learning: form.get('learning') || undefined,
        resolution: form.get('resolution') || undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the complaint.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select name="status" aria-label="Complaint status" defaultValue={status}>{COMPLAINT_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <select name="stage" aria-label="Complaint stage" defaultValue={stage}>{COMPLAINT_STAGES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <select name="severity" aria-label="Complaint severity" defaultValue={severity}>{CONCERN_SEVERITIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <select name="outcome" aria-label="Complaint outcome" defaultValue=""><option value="">Outcome pending</option>{COMPLAINT_OUTCOMES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
    <input name="learning" placeholder="Learning (required to close)" aria-label="Learning" />
    <input name="resolution" placeholder="Response given" aria-label="Response given" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}

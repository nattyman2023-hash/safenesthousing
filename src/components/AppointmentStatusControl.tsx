'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APPOINTMENT_STATUSES } from '@/lib/appointments';
import { useHydrated } from '@/lib/use-hydrated';

export function AppointmentStatusControl({ appointmentId, status }: { appointmentId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsDetail = ['COMPLETED', 'MISSED', 'CANCELLED', 'NO_ACCESS'].includes(next);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, outcome: form.get('outcome') || undefined, notes: form.get('notes') || undefined })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? 'We could not update the appointment.'); return; }
    router.refresh();
  }
  return <form className="inline-control" onSubmit={submit} method="post">
    <select aria-label="Appointment status" value={next} onChange={(event) => setNext(event.target.value)}>{APPOINTMENT_STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ').toLowerCase()}</option>)}</select>
    {needsDetail && <input name="outcome" placeholder="Outcome" aria-label="Outcome" />}
    <input name="notes" placeholder="Note (optional)" aria-label="Appointment note" />
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy}>{busy ? 'Saving…' : 'Save'}</button>
    {error && <span className="form-error" role="status">{error}</span>}
  </form>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ReferralStatusForm({ referralId, currentStatus, nextStatuses, followUpDate }: { referralId: string; currentStatus: string; nextStatuses: string[]; followUpDate?: Date | string | null }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('saving'); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/crm/referrals/${referralId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage('Status change saved and audited.'); router.refresh(); } else { setState('error'); setMessage(result.error ?? 'We could not save this status change.'); }
  }
  return <form className="form-grid" onSubmit={submit}>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor="status">Next status</label><select id="status" name="status" defaultValue={nextStatuses[0] ?? currentStatus} disabled={!nextStatuses.length}>{nextStatuses.length ? nextStatuses.map((status) => <option key={status}>{status}</option>) : <option>{currentStatus}</option>}</select></div><div className="form-field"><label htmlFor="followUpDate">Follow-up date</label><input id="followUpDate" name="followUpDate" type="date" defaultValue={followUpDate ? new Date(followUpDate).toISOString().slice(0, 10) : ''} /></div><div className="form-field full"><label htmlFor="reason">Reason for change</label><textarea id="reason" name="reason" placeholder="Required for every status change" required /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'saving' || !nextStatuses.length}>{state === 'saving' ? 'Saving…' : 'Save status change'}</button></div></form>;
}

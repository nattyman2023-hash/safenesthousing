'use client';

import { useState } from 'react';

export function IncidentReviewForm({ incidentId, severity, status, reviewDate, closureDecision }: { incidentId: string; severity: string; status: string; reviewDate?: Date | string | null; closureDecision?: string | null }) {
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const dateValue = reviewDate ? new Date(reviewDate).toISOString().slice(0, 10) : '';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('saving'); setMessage('');
    const response = await fetch(`/api/crm/incidents/${incidentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Incident ${result.status.toLowerCase().replaceAll('_', ' ')} saved.`); } else { setState('error'); setMessage(result.error ?? 'We could not save the incident review.'); }
  }
  return <form className="form-grid" onSubmit={submit}>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor="severity">Severity</label><select id="severity" name="severity" defaultValue={severity}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div><div className="form-field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={status}><option>OPEN</option><option>UNDER_REVIEW</option><option>ACTION_PLAN_ACTIVE</option><option>CLOSED</option></select></div><div className="form-field"><label htmlFor="reviewDate">Next review date</label><input id="reviewDate" name="reviewDate" type="date" defaultValue={dateValue} /></div><div className="form-field full"><label htmlFor="closureDecision">Closure decision / review summary</label><textarea id="closureDecision" name="closureDecision" defaultValue={closureDecision ?? ''} placeholder="Only an authorised safeguarding role may close this incident." /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save review'}</button></div></form>;
}

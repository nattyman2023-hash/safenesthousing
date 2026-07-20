'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Update = { id: string; update: string; createdAt: Date | string };
type Action = { id: string; action: string; owner?: string | null; dueDate?: Date | string | null; completedAt?: Date | string | null };

export function IncidentFollowUpForm({ incidentId, updates, actions }: { incidentId: string; updates: Update[]; actions: Action[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function post(path: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch(`/api/crm/incidents/${incidentId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage(path === 'updates' ? 'Incident update saved.' : 'Follow-up action added.'); formElement.reset(); router.refresh(); } else setMessage(result.error ?? 'We could not save that incident follow-up.');
    setBusy(false);
  }
  async function complete(action: Action) {
    setBusy(true); setMessage('');
    const response = await fetch(`/api/crm/incidents/${incidentId}/actions/${action.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !action.completedAt }) });
    const result = await response.json();
    if (response.ok) router.refresh(); else setMessage(result.error ?? 'We could not update that action.');
    setBusy(false);
  }
  return <><div id="update" className="crm-panels" style={{ marginTop: 18 }}><section className="crm-panel"><div className="panel-header"><h2>Add incident update</h2></div><div className="panel-body"><form className="form-grid" onSubmit={(event) => post('updates', event)}>{message && <div className="form-error" role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field full"><label htmlFor="incident-update">Update</label><textarea id="incident-update" name="update" required /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save update'}</button></div></form></div></section><section className="crm-panel"><div className="panel-header"><h2>Add follow-up action</h2></div><div className="panel-body"><form className="form-grid" onSubmit={(event) => post('actions', event)}><div className="form-field full"><label htmlFor="incident-action">Action</label><input id="incident-action" name="action" required /></div><div className="form-field"><label htmlFor="incident-owner">Owner</label><input id="incident-owner" name="owner" /></div><div className="form-field"><label htmlFor="incident-due">Due date</label><input id="incident-due" name="dueDate" type="date" /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Add action'}</button></div></form></div></section></div>{(updates.length > 0 || actions.length > 0) && <div className="crm-panels" style={{ marginTop: 18 }}><section className="crm-panel"><div className="panel-header"><h2>Recent updates</h2></div><div className="panel-body">{updates.length ? updates.map((item) => <div className="task-item" key={item.id}><span className="task-check">↳</span><div><strong>{item.update}</strong><span>{new Date(item.createdAt).toLocaleDateString('en-GB')}</span></div></div>) : <p className="muted">No updates recorded.</p>}</div></section><section className="crm-panel"><div className="panel-header"><h2>Follow-up actions</h2></div><div className="panel-body">{actions.length ? actions.map((item) => <div className="task-item" key={item.id}><button type="button" className="task-check" aria-label={item.completedAt ? 'Reopen action' : 'Complete action'} onClick={() => complete(item)} disabled={busy}>{item.completedAt ? '✓' : ''}</button><div><strong style={{ textDecoration: item.completedAt ? 'line-through' : undefined }}>{item.action}</strong><span>{item.owner ?? 'Unassigned'} · {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-GB') : 'No due date'}</span></div></div>) : <p className="muted">No follow-up actions recorded.</p>}</div></section></div>}</>;
}

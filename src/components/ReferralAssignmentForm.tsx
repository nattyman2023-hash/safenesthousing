'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Assignee = { id: string; name: string; email: string };

export function ReferralAssignmentForm({ referralId, currentAssignee, assignees }: { referralId: string; currentAssignee?: Assignee | null; assignees: Assignee[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const assignedToId = String(new FormData(event.currentTarget).get('assignedToId') ?? '');
    const response = await fetch(`/api/crm/referrals/${referralId}/assignment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedToId }) });
    const result = await response.json();
    if (response.ok) { setMessage('Assignment saved and audited.'); router.refresh(); } else setMessage(result.error ?? 'Unable to assign this referral.');
    setBusy(false);
  }

  return <form id="assign" className="form-grid" onSubmit={submit}>{currentAssignee && <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>Currently assigned to <strong>{currentAssignee.name}</strong> ({currentAssignee.email}).</p>}{message && <div className={message.startsWith('Assignment saved') ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor="assignedToId">Assign to</label><select id="assignedToId" name="assignedToId" defaultValue={currentAssignee?.id ?? ''} required><option value="">Choose a staff member</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.email}</option>)}</select></div><div className="form-field"><button className="crm-button crm-button-primary" disabled={busy || !assignees.length}>{busy ? 'Saving...' : currentAssignee ? 'Reassign referral' : 'Assign referral'}</button></div>{!assignees.length && <p className="muted" style={{ gridColumn: '1 / -1' }}>No active referral staff are available in this service scope.</p>}</form>;
}

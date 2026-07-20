'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function TaskForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/crm/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Task created.'); formElement.reset(); router.refresh(); } else setMessage(result.error ?? 'We could not create the task.');
    setBusy(false);
  }
  return <form id="new" className="form-card" onSubmit={submit}><h2>New task</h2>{message && <div className="form-success" role="status">{message}</div>}<div className="form-grid"><div className="form-field full"><label htmlFor="task-title">Task</label><input id="task-title" name="title" required /></div><div className="form-field full"><label htmlFor="task-description">Description</label><textarea id="task-description" name="description" /></div><div className="form-field"><label htmlFor="task-priority">Priority</label><select id="task-priority" name="priority" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></div><div className="form-field"><label htmlFor="task-due">Due date</label><input id="task-due" name="dueAt" type="date" /></div><div className="form-field"><label htmlFor="task-assignee">Assign to</label><select id="task-assignee" name="assignedToId" defaultValue=""><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</button></div></div></form>;
}

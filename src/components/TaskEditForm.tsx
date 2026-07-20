'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Task = { id: string; title: string; description: string | null; priority: string; status: string; dueAt: Date | string | null; assignedToId: string | null };

export function TaskEditForm({ task, users }: { task: Task; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch(`/api/crm/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Task saved.'); router.refresh(); } else setMessage(result.error ?? 'We could not save this task.');
    setBusy(false);
  }

  return <form className="form-grid" onSubmit={submit}>
    {message && <div className={message === 'Task saved.' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}
    <div className="form-field full"><label htmlFor="task-title">Task</label><input id="task-title" name="title" defaultValue={task.title} required minLength={3} maxLength={200} /></div>
    <div className="form-field full"><label htmlFor="task-description">Description</label><textarea id="task-description" name="description" defaultValue={task.description ?? ''} maxLength={2000} /></div>
    <div className="form-field"><label htmlFor="task-priority">Priority</label><select id="task-priority" name="priority" defaultValue={task.priority}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></div>
    <div className="form-field"><label htmlFor="task-status">Status</label><select id="task-status" name="status" defaultValue={task.status}><option>OPEN</option><option>IN_PROGRESS</option><option>DONE</option><option>CANCELLED</option></select></div>
    <div className="form-field"><label htmlFor="task-due">Due date</label><input id="task-due" name="dueAt" type="date" defaultValue={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ''} /></div>
    <div className="form-field"><label htmlFor="task-assignee">Assign to</label><select id="task-assignee" name="assignedToId" defaultValue={task.assignedToId ?? ''}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save task'}</button></div>
  </form>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(event: React.ChangeEvent<HTMLSelectElement>) { setBusy(true); await fetch(`/api/crm/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: event.target.value }) }); setBusy(false); router.refresh(); }
  return <select aria-label="Task status" defaultValue={status} disabled={busy} onChange={change}><option>OPEN</option><option>IN_PROGRESS</option><option>DONE</option><option>CANCELLED</option></select>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(event: React.ChangeEvent<HTMLSelectElement>) { setBusy(true); await fetch(`/api/crm/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: event.target.value }) }); setBusy(false); router.refresh(); }
  // Until React owns this select a change is handled by nobody: the browser moves the visible value
  // while onChange is not attached yet, so the queue would show a status that was never saved. The
  // control stays disabled for that window, exactly like every other status control in the CRM.
  return <select aria-label="Task status" defaultValue={status} disabled={!hydrated || busy} onChange={change}><option>OPEN</option><option>IN_PROGRESS</option><option>DONE</option><option>CANCELLED</option></select>;
}

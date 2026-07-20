'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PlacementStatusControl({ placementId, status, endDate }: { placementId: string; status: string; endDate?: Date | string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [date, setDate] = useState(endDate ? new Date(endDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  async function save(nextStatus: string) {
    setValue(nextStatus); setMessage('');
    const response = await fetch(`/api/crm/placements/${placementId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, endDate: nextStatus === 'ACTIVE' ? '' : date }) });
    const result = await response.json();
    if (response.ok) router.refresh(); else { setValue(status); setMessage(result.error ?? 'Unable to update'); }
  }
  return <span style={{ display: 'inline-grid', gap: 4 }}><select className="crm-button crm-button-secondary" aria-label="Placement status" value={value} onChange={(event) => save(event.target.value)}><option value="ACTIVE">ACTIVE</option><option value="MOVED_OUT">MOVED_OUT</option><option value="CANCELLED">CANCELLED</option></select>{value !== 'ACTIVE' && <input aria-label="Placement end date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />}{message && <small className="text-danger">{message}</small>}</span>;
}

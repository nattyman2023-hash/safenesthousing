'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function InvoiceStatusControl({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [message, setMessage] = useState('');
  async function update(nextStatus: string) {
    setValue(nextStatus); setMessage('');
    const response = await fetch(`/api/crm/invoices/${invoiceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) });
    const result = await response.json();
    if (response.ok) router.refresh(); else { setValue(status); setMessage(result.error ?? 'Unable to update'); }
  }
  return <span style={{ display: 'inline-grid', gap: 4 }}><select className="crm-button crm-button-secondary" aria-label="Invoice status" value={value} onChange={(event) => update(event.target.value)}><option>DRAFT</option><option>ISSUED</option><option>PART_PAID</option><option>PAID</option><option>OVERDUE</option><option>VOID</option></select>{message && <small className="text-danger">{message}</small>}</span>;
}

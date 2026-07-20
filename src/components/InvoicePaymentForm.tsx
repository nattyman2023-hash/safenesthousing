'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

function minorFromPounds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function InvoicePaymentForm({ invoiceId, remainingMinor }: { invoiceId: string; remainingMinor: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const amountMinor = minorFromPounds(amount);
    if (!amountMinor) { setMessage('Enter a payment amount in pounds.'); setBusy(false); return; }
    const response = await fetch(`/api/crm/invoices/${invoiceId}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMinor, paidAt, method }) });
    const result = await response.json();
    if (response.ok) { setMessage('Payment recorded.'); setAmount(''); router.refresh(); } else setMessage(result.error ?? 'Unable to record payment.');
    setBusy(false);
  }
  if (remainingMinor <= 0) return <span className="muted">Paid in full</span>;
  return <form onSubmit={submit} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><input aria-label="Payment amount in pounds" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount (£)" inputMode="decimal" style={{ width: 100 }} required /><input aria-label="Payment date" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required /><select aria-label="Payment method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="DIRECT_DEBIT">Direct debit</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select><button className="crm-button crm-button-secondary" disabled={busy}>{busy ? 'Saving…' : 'Record'}</button>{message && <small className={message === 'Payment recorded.' ? 'form-success' : 'text-danger'}>{message}</small>}</form>;
}

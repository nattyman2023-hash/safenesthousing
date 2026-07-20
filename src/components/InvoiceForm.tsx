'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type LineItem = { description: string; quantity: string; unitAmount: string };

function minorFromPounds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function InvoiceForm() {
  const router = useRouter();
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: '1', unitAmount: '' }]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function updateItem(index: number, field: keyof LineItem, value: string) { setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)); }
  function addItem() { setItems((current) => [...current, { description: '', quantity: '1', unitAmount: '' }]); }
  function removeItem(index: number) { setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsedItems = items.map((item) => ({ description: item.description, quantity: item.quantity, unitMinor: minorFromPounds(item.unitAmount) }));
    if (parsedItems.some((item) => item.unitMinor === null)) { setError('Enter each line amount as pounds, for example 125.00.'); setBusy(false); return; }
    const response = await fetch('/api/crm/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: form.get('reference'), dueAt: form.get('dueAt'), items: parsedItems.map((item) => ({ ...item, unitMinor: item.unitMinor })) }) });
    const result = await response.json();
    if (response.ok) { setMessage(`Invoice ${result.reference} created.`); formElement.reset(); setItems([{ description: '', quantity: '1', unitAmount: '' }]); router.refresh(); } else setError(result.error ?? 'We could not create the invoice.');
    setBusy(false);
  }

  return <form id="new" className="form-card" onSubmit={submit}><h2>New invoice</h2><p>Create a draft invoice with one or more line items. Amounts are entered in pounds and stored as integer pence.</p>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="invoice-reference">Invoice reference</label><input id="invoice-reference" name="reference" placeholder="SN-INV-001" required /></div><div className="form-field"><label htmlFor="invoice-due">Due date</label><input id="invoice-due" name="dueAt" type="date" /></div><div className="form-field full"><label>Line items</label>{items.map((item, index) => <div key={index} className="form-grid" style={{ marginBottom: 12 }}><div className="form-field"><label htmlFor={`invoice-description-${index}`}>Description</label><input id={`invoice-description-${index}`} value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} required /></div><div className="form-field"><label htmlFor={`invoice-quantity-${index}`}>Quantity</label><input id={`invoice-quantity-${index}`} type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required /></div><div className="form-field"><label htmlFor={`invoice-amount-${index}`}>Unit amount (£)</label><input id={`invoice-amount-${index}`} value={item.unitAmount} onChange={(event) => updateItem(index, 'unitAmount', event.target.value)} inputMode="decimal" placeholder="125.00" required /></div><div className="form-field" style={{ alignSelf: 'end' }}><button type="button" className="crm-button crm-button-secondary" onClick={() => removeItem(index)} disabled={items.length === 1}>Remove</button></div></div>)}</div><div className="form-field full"><button type="button" className="crm-button crm-button-secondary" onClick={addItem}>Add line item</button></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create draft invoice'}</button></div></div></form>;
}

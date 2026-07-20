'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Service = { id: string; title: string; summary: string; content: string; audience: string; referralRoutes: string; eligibility: string; supportModel: string; published: boolean };

export function ServiceContentForm({ service }: { service: Service }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const response = await fetch(`/api/crm/content/services/${service.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
    const result = await response.json();
    if (response.ok) { setMessage('Saved'); router.refresh(); } else setMessage(result.error ?? 'Unable to save');
    setBusy(false);
  }
  return <form className="form-grid" onSubmit={submit}>{message && <div className={message === 'Saved' ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor={`service-title-${service.id}`}>Title</label><input id={`service-title-${service.id}`} name="title" defaultValue={service.title} required /></div><div className="form-field"><label htmlFor={`service-summary-${service.id}`}>Summary</label><input id={`service-summary-${service.id}`} name="summary" defaultValue={service.summary} required /></div><div className="form-field full"><label htmlFor={`service-content-${service.id}`}>Content</label><textarea id={`service-content-${service.id}`} name="content" defaultValue={service.content} required /></div><div className="form-field"><label htmlFor={`service-audience-${service.id}`}>Audience</label><textarea id={`service-audience-${service.id}`} name="audience" defaultValue={service.audience} required /></div><div className="form-field"><label htmlFor={`service-routes-${service.id}`}>Referral routes</label><textarea id={`service-routes-${service.id}`} name="referralRoutes" defaultValue={service.referralRoutes} required /></div><div className="form-field"><label htmlFor={`service-eligibility-${service.id}`}>Eligibility</label><textarea id={`service-eligibility-${service.id}`} name="eligibility" defaultValue={service.eligibility} required /></div><div className="form-field"><label htmlFor={`service-support-${service.id}`}>Support model</label><textarea id={`service-support-${service.id}`} name="supportModel" defaultValue={service.supportModel} required /></div><div className="form-field"><label className="checkbox-row"><input type="checkbox" name="published" defaultChecked={service.published} /> Published on the public site</label></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save service'}</button></div></form>;
}

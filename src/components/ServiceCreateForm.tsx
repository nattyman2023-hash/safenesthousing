'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Add Service.
 *
 * Posts to POST /api/crm/content/services and creates a real Service row in the signed-in user's
 * organisation. Every field maps to a NOT NULL column on the Prisma Service model — nothing is
 * invented, and optional columns (`imageUrl`, `seoTitle`, `seoDescription`) are left to the defaults
 * rather than exposed as fields nobody has content for.
 *
 * The slug is optional on purpose: the endpoint derives it from the service name, so staff do not
 * have to understand URL rules to make referral intake work, and can still correct it deliberately.
 *
 * `published` decides both the public listing and referral eligibility, so it is an explicit checkbox
 * (ticked by default, matching the schema default) rather than an assumption. An unpublished service
 * is a draft: it is deliberately not offered to referral intake until someone publishes it.
 */
export function ServiceCreateForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setState(null);
    const form = event.currentTarget;
    const response = await fetch('/api/crm/content/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setState({ text: `Service created${result.published ? ' and published' : ' as a draft'}. It is now available to referral intake${result.published ? '' : ' once you publish it'}.`, ok: true });
      form.reset();
      router.refresh();
    } else setState({ text: result.error ?? 'Unable to create the service.', ok: false });
    setBusy(false);
  }

  return <form className="form-grid" onSubmit={submit} method="post">
    {state && <div className={state.ok ? 'form-success' : 'form-error'} role="status" style={{ gridColumn: '1 / -1' }}>{state.text}</div>}
    <div className="form-field"><label htmlFor="service-new-title">Service name <span>*</span></label><input id="service-new-title" name="title" required minLength={2} maxLength={160} placeholder="e.g. Domestic abuse refuge" /></div>
    <div className="form-field"><label htmlFor="service-new-slug">Slug (leave blank to generate)</label><input id="service-new-slug" name="slug" maxLength={120} autoComplete="off" placeholder="domestic-abuse-refuge" /><p className="muted" style={{ fontSize: 11 }}>Used in the public address /services/&lt;slug&gt; and unique within your organisation.</p></div>
    <div className="form-field full"><label htmlFor="service-new-summary">Public summary <span>*</span></label><input id="service-new-summary" name="summary" required minLength={10} maxLength={500} placeholder="One or two sentences shown on the public site." /></div>
    <div className="form-field full"><label htmlFor="service-new-content">Service description <span>*</span></label><textarea id="service-new-content" name="content" required minLength={10} maxLength={8000} placeholder="What this service provides and how it works day to day." /></div>
    <div className="form-field"><label htmlFor="service-new-audience">Who this service is for <span>*</span></label><textarea id="service-new-audience" name="audience" required minLength={5} maxLength={1000} /></div>
    <div className="form-field"><label htmlFor="service-new-routes">How referrals reach this service <span>*</span></label><textarea id="service-new-routes" name="referralRoutes" required minLength={5} maxLength={2000} /></div>
    <div className="form-field"><label htmlFor="service-new-eligibility">Eligibility considerations <span>*</span></label><textarea id="service-new-eligibility" name="eligibility" required minLength={5} maxLength={2000} /></div>
    <div className="form-field"><label htmlFor="service-new-support">Support model summary <span>*</span></label><textarea id="service-new-support" name="supportModel" required minLength={5} maxLength={2000} /></div>
    <div className="form-field"><label htmlFor="service-new-order">Display order</label><input id="service-new-order" name="displayOrder" type="number" min={0} max={10000} step={1} placeholder="0" /><p className="muted" style={{ fontSize: 11 }}>Lower numbers appear first in menus and on the public site.</p></div>
    <div className="form-field"><label className="checkbox-row"><input type="checkbox" name="published" defaultChecked /> Publish on the public site and make it available to referral intake</label></div>
    <div className="form-field full"><button className="crm-button crm-button-primary" disabled={!hydrated || busy}>{busy ? 'Creating…' : 'Add Service'}</button></div>
  </form>;
}

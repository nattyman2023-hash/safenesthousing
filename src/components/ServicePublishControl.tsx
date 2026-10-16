'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Publish / unpublish a service.
 *
 * Unpublishing is the reversible equivalent of archiving: the row and every referral, client and
 * property linked to it stay intact, but the service stops appearing on the public site and stops
 * being offered to referral intake, because `referralServiceWhere` requires `published: true`.
 *
 * Only `{ published }` is sent. The endpoint's schema is partial, so an absent field means
 * "unchanged" and a publication toggle can never overwrite the service's content.
 */
export function ServicePublishControl({ serviceId, title, published }: { serviceId: string; title: string; published: boolean }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setState(null);
    const response = await fetch(`/api/crm/content/services/${serviceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published: !published }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) { setState({ text: published ? 'Unpublished.' : 'Published.', ok: true }); router.refresh(); }
    else setState({ text: result.error ?? 'Unable to change publication.', ok: false });
    setBusy(false);
  }

  return <form onSubmit={toggle} method="post">
    {state && <div className={state.ok ? 'form-success' : 'form-error'} role="status" style={{ fontSize: 11, marginBottom: 6 }}>{state.text}</div>}
    <button className="crm-button crm-button-secondary" disabled={!hydrated || busy} aria-label={`${published ? 'Unpublish' : 'Publish'} ${title}`}>{busy ? 'Saving…' : published ? 'Unpublish' : 'Publish'}</button>
  </form>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function UserAccessControl({ userId, active, roleSlug, roles }: { userId: string; active: boolean; roleSlug: string; roles: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(active);
  const [role, setRole] = useState(roleSlug || roles[0]?.slug || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const response = await fetch(`/api/crm/users/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: enabled, roleSlug: role }) });
    const result = await response.json();
    if (response.ok) { setMessage('Saved'); router.refresh(); } else setMessage(result.error ?? 'Unable to update');
    setBusy(false);
  }
  return <form onSubmit={save} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><select aria-label="User role" value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Active</label><button className="crm-button crm-button-secondary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>{message && <small className={message === 'Saved' ? 'text-success' : 'text-danger'}>{message}</small>}</form>;
}

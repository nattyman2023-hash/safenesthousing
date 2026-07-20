'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const settingKeys = ['homepage.headline', 'homepage.stats.moveOn', 'homepage.stats.newRooms', 'homepage.stats.responseTarget', 'contact.generalEmail', 'contact.referralEmail', 'contact.emergencyMessage'] as const;

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(settingKeys.map((key) => [key, settings[key] ?? ''])));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function setValue(key: string, value: string) { setValues((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const response = await fetch('/api/crm/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: settingKeys.map((key) => ({ key, value: values[key] })) }) });
    const result = await response.json();
    if (response.ok) { setMessage('Organisation settings saved.'); router.refresh(); } else setError(result.error ?? 'We could not save the settings.');
    setBusy(false);
  }
  return <form id="content-settings" className="form-grid" onSubmit={submit}>{message && <div className="form-success" role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-field full"><label htmlFor="setting-headline">Homepage headline</label><input id="setting-headline" value={values['homepage.headline']} onChange={(event) => setValue('homepage.headline', event.target.value)} /></div><div className="form-field"><label htmlFor="setting-general-email">General email</label><input id="setting-general-email" type="email" value={values['contact.generalEmail']} onChange={(event) => setValue('contact.generalEmail', event.target.value)} /></div><div className="form-field"><label htmlFor="setting-referral-email">Referral email</label><input id="setting-referral-email" type="email" value={values['contact.referralEmail']} onChange={(event) => setValue('contact.referralEmail', event.target.value)} /></div><div className="form-field"><label htmlFor="setting-move-on">Move-on outcome</label><input id="setting-move-on" value={values['homepage.stats.moveOn']} onChange={(event) => setValue('homepage.stats.moveOn', event.target.value)} /></div><div className="form-field"><label htmlFor="setting-new-rooms">New rooms</label><input id="setting-new-rooms" value={values['homepage.stats.newRooms']} onChange={(event) => setValue('homepage.stats.newRooms', event.target.value)} /></div><div className="form-field"><label htmlFor="setting-response-target">Referral response target</label><input id="setting-response-target" value={values['homepage.stats.responseTarget']} onChange={(event) => setValue('homepage.stats.responseTarget', event.target.value)} /></div><div className="form-field full"><label htmlFor="setting-emergency">Emergency and out-of-hours message</label><textarea id="setting-emergency" value={values['contact.emergencyMessage']} onChange={(event) => setValue('contact.emergencyMessage', event.target.value)} /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save content settings'}</button></div></form>;
}

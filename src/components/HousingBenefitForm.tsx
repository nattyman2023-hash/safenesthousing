'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption = { id: string; reference: string; displayName: string };
type ClaimOption = { id: string; clientId: string; status: string; paymentStatus: string; submittedAt: string | null; evidenceRequired: string | null; weeklyRentMinor: number; serviceChargeMinor: number };

function minorFromPounds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function poundsFromMinor(value: number): string { return (value / 100).toFixed(2); }

export function HousingBenefitForm({ clients, claims }: { clients: ClientOption[]; claims: ClaimOption[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(claims[0]?.clientId ?? clients[0]?.id ?? '');
  const claim = claims.find((item) => item.clientId === clientId);
  const [status, setStatus] = useState(claim?.status ?? 'NOT_STARTED');
  const [paymentStatus, setPaymentStatus] = useState(claim?.paymentStatus ?? 'PENDING');
  const [submittedAt, setSubmittedAt] = useState(claim?.submittedAt?.slice(0, 10) ?? '');
  const [evidenceRequired, setEvidenceRequired] = useState(claim?.evidenceRequired ?? '');
  const [weeklyRent, setWeeklyRent] = useState(poundsFromMinor(claim?.weeklyRentMinor ?? 0));
  const [serviceCharge, setServiceCharge] = useState(poundsFromMinor(claim?.serviceChargeMinor ?? 0));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function selectClient(nextClientId: string) {
    const nextClaim = claims.find((item) => item.clientId === nextClientId);
    setClientId(nextClientId); setStatus(nextClaim?.status ?? 'NOT_STARTED'); setPaymentStatus(nextClaim?.paymentStatus ?? 'PENDING'); setSubmittedAt(nextClaim?.submittedAt?.slice(0, 10) ?? ''); setEvidenceRequired(nextClaim?.evidenceRequired ?? ''); setWeeklyRent(poundsFromMinor(nextClaim?.weeklyRentMinor ?? 0)); setServiceCharge(poundsFromMinor(nextClaim?.serviceChargeMinor ?? 0));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const weeklyRentMinor = minorFromPounds(weeklyRent); const serviceChargeMinor = minorFromPounds(serviceCharge);
    if (weeklyRentMinor === null || serviceChargeMinor === null) { setError('Enter rent and service charge as pounds, for example 185.00.'); setBusy(false); return; }
    const response = await fetch(`/api/crm/clients/${clientId}/housing-benefit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, paymentStatus, submittedAt, evidenceRequired, weeklyRentMinor, serviceChargeMinor }) });
    const result = await response.json();
    if (response.ok) { setMessage('Housing Benefit claim saved.'); router.refresh(); } else setError(result.error ?? 'We could not save the claim.');
    setBusy(false);
  }

  return <form id="housing-benefit" className="form-card" onSubmit={submit}><h2>Housing Benefit claim</h2><p>Update claim status, eligible rent, service charges, and evidence actions. Changes are audited.</p>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-grid"><div className="form-field full"><label htmlFor="hb-client">Client</label><select id="hb-client" value={clientId} onChange={(event) => selectClient(event.target.value)} required>{clients.map((client) => <option key={client.id} value={client.id}>{client.reference} · {client.displayName}</option>)}</select></div><div className="form-field"><label htmlFor="hb-status">Claim status</label><select id="hb-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="NOT_STARTED">Not started</option><option value="PENDING">Pending</option><option value="EVIDENCE_REQUIRED">Evidence required</option><option value="SUBMITTED">Submitted</option><option value="IN_PAYMENT">In payment</option><option value="SUSPENDED">Suspended</option><option value="REJECTED">Rejected</option><option value="CLOSED">Closed</option></select></div><div className="form-field"><label htmlFor="hb-payment-status">Payment status</label><select id="hb-payment-status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="PENDING">Pending</option><option value="IN_PAYMENT">In payment</option><option value="PAUSED">Paused</option><option value="FAILED">Failed</option><option value="CLOSED">Closed</option></select></div><div className="form-field"><label htmlFor="hb-rent">Weekly eligible rent (£)</label><input id="hb-rent" value={weeklyRent} onChange={(event) => setWeeklyRent(event.target.value)} inputMode="decimal" required /></div><div className="form-field"><label htmlFor="hb-service-charge">Weekly service charge (£)</label><input id="hb-service-charge" value={serviceCharge} onChange={(event) => setServiceCharge(event.target.value)} inputMode="decimal" required /></div><div className="form-field"><label htmlFor="hb-submitted">Submitted date</label><input id="hb-submitted" type="date" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} /></div><div className="form-field full"><label htmlFor="hb-evidence">Evidence required</label><textarea id="hb-evidence" value={evidenceRequired} onChange={(event) => setEvidenceRequired(event.target.value)} placeholder="Leave blank when no evidence action is outstanding." /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy || !clientId}>{busy ? 'Saving…' : claim ? 'Save claim update' : 'Create claim'}</button></div></div></form>;
}

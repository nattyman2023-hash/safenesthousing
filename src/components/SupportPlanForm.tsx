'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Plan = { id: string; reviewDate?: Date | string | null } | null;

export function SupportPlanForm({ clientId, plan }: { clientId: string; plan: Plan }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'goal' | 'review' | null>(null);
  async function submit(type: 'goal' | 'review', event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(type); setMessage('');
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement).entries());
    const response = await fetch(`/api/crm/clients/${clientId}/support-plans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, supportPlanId: plan?.id, ...values }) });
    const result = await response.json();
    if (response.ok) { setMessage(type === 'goal' ? 'Goal added to the support plan.' : 'Support-plan review saved.'); formElement.reset(); router.refresh(); } else setMessage(result.error ?? 'We could not save this support-plan change.');
    setBusy(null);
  }
  return <div id="support-plan" className="crm-panels" style={{ marginTop: 18 }}><section className="crm-panel"><div className="panel-header"><h2>Add support-plan goal</h2></div><div className="panel-body"><form className="form-grid" onSubmit={(event) => submit('goal', event)}>{message && <div className="form-success" role="status" style={{ gridColumn: '1 / -1' }}>{message}</div>}<div className="form-field"><label htmlFor="goal-category">Category</label><input id="goal-category" name="category" required /></div><div className="form-field"><label htmlFor="goal-owner">Owner</label><input id="goal-owner" name="owner" /></div><div className="form-field full"><label htmlFor="goal-outcome">Desired outcome</label><input id="goal-outcome" name="desiredOutcome" required /></div><div className="form-field full"><label htmlFor="goal-actions">Action steps</label><textarea id="goal-actions" name="actionSteps" required /></div><div className="form-field"><label htmlFor="goal-target">Target date</label><input id="goal-target" name="targetDate" type="date" /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy !== null}>{busy === 'goal' ? 'Saving…' : 'Add goal'}</button></div></form></div></section><section className="crm-panel"><div className="panel-header"><h2>Record a review</h2></div><div className="panel-body">{plan ? <form className="form-grid" onSubmit={(event) => submit('review', event)}><div className="form-field"><label htmlFor="plan-review-date">Review date</label><input id="plan-review-date" name="reviewDate" type="date" defaultValue={plan.reviewDate ? new Date(plan.reviewDate).toISOString().slice(0, 10) : ''} required /></div><div className="form-field full"><label htmlFor="plan-review-notes">Review notes</label><textarea id="plan-review-notes" name="notes" required /></div><div className="form-field full"><button className="crm-button crm-button-primary" disabled={busy !== null}>{busy === 'review' ? 'Saving…' : 'Save review'}</button></div></form> : <p className="muted">Add a goal first to create the support plan.</p>}</div></section></div>;
}

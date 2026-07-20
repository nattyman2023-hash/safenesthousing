'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type RetentionRule = { id: string; resourceType: string; retentionDays: number; legalBasisNote: string | null; active: boolean };
type SubjectRequest = { id: string; requestType: string; subjectRef: string; status: string; dueAt: string | null; notes: string | null; legalHold: boolean; createdAt: string; updatedAt: string };
type ReviewSummary = { asOf: string; rulesEvaluated: number; invalidRules: string[]; totalCandidates: number; totalReviewableCandidates: number; totalExcludedByLegalHold: number; totalExcludedByOpenRequest: number; openSubjectRequests: number };

const resourceTypes = ['ContactSubmission', 'Referral', 'Client', 'CaseNote', 'Incident', 'Document', 'AuditLog'];
const requestTypes = ['ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'OBJECTION', 'PORTABILITY', 'OTHER'];
const requestStatuses = ['OPEN', 'IN_REVIEW', 'ACTION_REQUIRED', 'ON_HOLD', 'COMPLETED', 'DECLINED'];

function dateValue(value: string | null) { return value ? value.slice(0, 10) : ''; }

export function RetentionReviewControl({ latestRun }: { latestRun?: { id: string; status: string; completedAt: string | null; summary: ReviewSummary | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function runReview() {
    setBusy(true); setMessage(''); setError('');
    const response = await fetch('/api/crm/governance/review', { method: 'POST' });
    const result = await response.json();
    if (response.ok) { setMessage('Dry-run completed and audited. No records were deleted.'); router.refresh(); } else setError(result.error ?? 'Unable to run the retention review.');
    setBusy(false);
  }
  const summary = latestRun?.summary;
  return <div className="form-grid"><div className="form-field full"><p className="muted" style={{ margin: 0 }}>This review identifies records past their approved period and excludes matching legal holds or open data-subject requests. It never deletes or anonymises records.</p></div><div className="form-field"><button type="button" className="crm-button crm-button-primary" onClick={runReview} disabled={busy}>{busy ? 'Reviewing...' : 'Run dry-run review'}</button></div>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}{summary && <div className="form-field full"><p style={{ margin: 0 }}><strong>Latest review:</strong> {summary.totalCandidates} candidates, {summary.totalReviewableCandidates} reviewable, {summary.totalExcludedByLegalHold} legal-hold exclusions, and {summary.totalExcludedByOpenRequest} open-request exclusions across {summary.rulesEvaluated} rules.</p>{summary.invalidRules.length > 0 && <p className="muted" style={{ marginBottom: 0 }}>Rules missing policy references were skipped: {summary.invalidRules.join(', ')}.</p>}</div>}</div>;
}

export function RetentionRulePanel({ rules }: { rules: RetentionRule[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const form = new FormData(event.currentTarget);
    const payload = { retentionDays: form.get('retentionDays'), legalBasisNote: form.get('legalBasisNote'), active: form.get('active') === 'on' };
    const response = await fetch(id ? `/api/crm/governance/retention-rules/${id}` : '/api/crm/governance/retention-rules', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? payload : { ...payload, resourceType: form.get('resourceType') }) });
    const result = await response.json();
    if (response.ok) { setMessage(id ? 'Retention rule saved and audited.' : 'Retention rule created and audited.'); router.refresh(); } else setError(result.error ?? 'Unable to save the retention rule.');
    setBusy(false);
  }
  return <div>
    {message && <div className="form-success" role="status" style={{ marginBottom: 16 }}>{message}</div>}
    {error && <div className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    <form id="new-rule" className="form-grid" onSubmit={(event) => submit(event)} style={{ marginBottom: 20 }}>
      <div className="form-field"><label htmlFor="retention-resource">Resource</label><select id="retention-resource" name="resourceType" defaultValue="" required><option value="">Choose a record type</option>{resourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
      <div className="form-field"><label htmlFor="retention-days">Retention days</label><input id="retention-days" name="retentionDays" type="number" min="1" max="36500" required /></div>
      <div className="form-field full"><label htmlFor="retention-basis">Approved legal basis or policy reference</label><textarea id="retention-basis" name="legalBasisNote" minLength={5} maxLength={2000} required placeholder="Reference the approved policy, contract, or legal basis." /></div>
      <div className="form-field"><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked /> Active rule</label></div>
      <div className="form-field"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving...' : 'Add retention rule'}</button></div>
    </form>
    <div className="table-scroll"><table className="crm-table"><thead><tr><th>Resource</th><th>Days</th><th>Policy reference</th><th>Status</th><th>Save</th></tr></thead><tbody>{rules.length ? rules.map((rule) => <tr key={rule.id}><td><strong>{rule.resourceType}</strong></td><td colSpan={4}><form className="form-grid" onSubmit={(event) => submit(event, rule.id)}><div className="form-field"><label className="sr-only" htmlFor={`days-${rule.id}`}>Retention days for {rule.resourceType}</label><input id={`days-${rule.id}`} name="retentionDays" type="number" min="1" max="36500" defaultValue={rule.retentionDays} required /></div><div className="form-field"><label className="sr-only" htmlFor={`basis-${rule.id}`}>Policy reference for {rule.resourceType}</label><input id={`basis-${rule.id}`} name="legalBasisNote" defaultValue={rule.legalBasisNote ?? ''} minLength={5} maxLength={2000} required /></div><div className="form-field"><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={rule.active} /> Active</label></div><div className="form-field"><button className="crm-button crm-button-secondary" disabled={busy}>Save</button></div></form></td></tr>) : <tr><td colSpan={5}>No retention rules have been approved for this organisation.</td></tr>}</tbody></table></div>
  </div>;
}

export function SubjectRequestPanel({ requests }: { requests: SubjectRequest[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch('/api/crm/governance/subject-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: form.get('requestType'), subjectRef: form.get('subjectRef'), dueAt: form.get('dueAt'), notes: form.get('notes'), legalHold: form.get('legalHold') === 'on' }) });
    const result = await response.json();
    if (response.ok) { setMessage('Data-subject request created and audited.'); formElement.reset(); router.refresh(); } else setError(result.error ?? 'Unable to create the request.');
    setBusy(false);
  }
  async function update(event: React.FormEvent<HTMLFormElement>, request: SubjectRequest) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/governance/subject-requests/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: form.get('status'), dueAt: form.get('dueAt'), notes: form.get('notes'), legalHold: form.get('legalHold') === 'on' }) });
    const result = await response.json();
    if (response.ok) { setMessage('Request review saved and audited.'); router.refresh(); } else setError(result.error ?? 'Unable to update the request.');
    setBusy(false);
  }
  return <div>
    {message && <div className="form-success" role="status" style={{ marginBottom: 16 }}>{message}</div>}
    {error && <div className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    <form className="form-grid" onSubmit={create} style={{ marginBottom: 20 }}>
      <div className="form-field"><label htmlFor="request-type">Request type</label><select id="request-type" name="requestType" defaultValue="ACCESS" required>{requestTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
      <div className="form-field"><label htmlFor="subject-ref">Approved subject reference</label><input id="subject-ref" name="subjectRef" maxLength={160} placeholder="Client or approved reference" required /></div>
      <div className="form-field"><label htmlFor="request-due">Due date</label><input id="request-due" name="dueAt" type="date" /></div>
      <div className="form-field full"><label htmlFor="request-notes">Review notes</label><textarea id="request-notes" name="notes" maxLength={4000} placeholder="Keep notes factual and proportionate." /></div>
      <div className="form-field"><label className="checkbox-label"><input name="legalHold" type="checkbox" /> Legal hold applies</label></div>
      <div className="form-field"><button className="crm-button crm-button-primary" disabled={busy}>{busy ? 'Saving...' : 'Log request'}</button></div>
    </form>
    <div className="table-scroll"><table className="crm-table"><thead><tr><th>Request</th><th>Status</th><th>Due</th><th>Review controls</th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id}><td><strong>{request.requestType}</strong><br /><span className="muted">{request.subjectRef}</span>{request.legalHold && <><br /><span className="muted">Legal hold active</span></>}</td><td colSpan={3}><form className="form-grid" onSubmit={(event) => update(event, request)}><div className="form-field"><label className="sr-only" htmlFor={`status-${request.id}`}>Status</label><select id={`status-${request.id}`} name="status" defaultValue={request.status}>{requestStatuses.map((status) => <option key={status}>{status}</option>)}</select></div><div className="form-field"><label className="sr-only" htmlFor={`due-${request.id}`}>Due date</label><input id={`due-${request.id}`} name="dueAt" type="date" defaultValue={dateValue(request.dueAt)} /></div><div className="form-field full"><label className="sr-only" htmlFor={`notes-${request.id}`}>Review notes</label><textarea id={`notes-${request.id}`} name="notes" defaultValue={request.notes ?? ''} maxLength={4000} placeholder="Resolution or review notes" /></div><div className="form-field"><label className="checkbox-label"><input name="legalHold" type="checkbox" defaultChecked={request.legalHold} /> Legal hold</label></div><div className="form-field"><button className="crm-button crm-button-secondary" disabled={busy}>Save review</button></div>{request.legalHold && <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>Release and save the legal hold before changing this request to completed or declined.</p>}</form></td></tr>) : <tr><td colSpan={4}>No data-subject requests have been logged.</td></tr>}</tbody></table></div>
  </div>;
}

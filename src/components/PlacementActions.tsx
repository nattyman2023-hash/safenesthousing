'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import type { PlacementRemovalPlan } from '@/lib/placement-lifecycle';

type RoomOption = { id: string; label: string; status: string };
type PropertyOption = { id: string; publicName: string; rooms: RoomOption[] };

export type PlacementActionRecord = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  tenancyRef: string;
  endedReason: string;
  propertyId: string;
  roomId: string;
};

type ApiResult = { error?: string; mode?: string; removed?: boolean; alreadyMarked?: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const SENTENCE = 'This should only be used when the placement was created by mistake. If the resident actually lived here, use End placement instead — that is what keeps the placement history.';

/**
 * The placement lifecycle controls: correct the ordinary details, end a placement that concluded,
 * or correct one that was created by mistake.
 *
 * Ending and removing are deliberately different acts. Ending keeps the historical record and is the
 * right answer when someone really lived somewhere. Removing is offered behind a confirmation dialog
 * that requires a reason, and the outcome still depends on what the server finds attached to the
 * placement: when history exists the record is marked entered in error instead of being deleted.
 */
export function PlacementActions({ placement, properties, plan }: { placement: PlacementActionRecord; properties: PropertyOption[]; plan: PlacementRemovalPlan }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [propertyId, setPropertyId] = useState(placement.propertyId);
  const [roomId, setRoomId] = useState(placement.roomId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [markStep, setMarkStep] = useState(false);
  const endpoint = `/api/crm/placements/${placement.id}`;
  const property = properties.find((item) => item.id === propertyId);
  const disabled = !hydrated || !!busy;

  async function send(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result: ApiResult = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, result };
  }

  async function saveEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('edit'); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const { ok, result } = await send(endpoint, 'PATCH', {
      startDate: String(form.get('startDate') ?? ''),
      tenancyRef: String(form.get('tenancyRef') ?? ''),
      propertyId,
      roomId
    });
    setBusy('');
    if (!ok) { setError(result.error ?? 'We could not save the placement.'); return; }
    setMessage('Placement updated. The room occupancy and the register were kept in step.');
    router.refresh();
  }

  async function endPlacement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('end'); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const { ok, result } = await send(endpoint, 'PATCH', {
      status: String(form.get('status') ?? 'MOVED_OUT'),
      endDate: String(form.get('endDate') ?? ''),
      endedReason: String(form.get('endedReason') ?? '')
    });
    setBusy('');
    if (!ok) { setError(result.error ?? 'We could not end the placement.'); return; }
    setMessage('Placement ended. It stays in the placement history and the room is released.');
    router.refresh();
  }

  async function reopenPlacement() {
    setBusy('reopen'); setError(''); setMessage('');
    const { ok, result } = await send(endpoint, 'PATCH', { status: 'ACTIVE', endDate: '' });
    setBusy('');
    if (!ok) { setError(result.error ?? 'We could not reopen the placement.'); return; }
    setMessage('Placement reopened and the room marked occupied.');
    router.refresh();
  }

  async function removePlacement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('remove'); setError('');
    const { ok, status, result } = await send(endpoint, 'DELETE', { reason, confirmed: true });
    setBusy('');
    if (ok) {
      setDialogOpen(false);
      setMessage('Incorrect placement removed. Nothing else was deleted and the room has been released.');
      router.refresh();
      return;
    }
    if (status === 409 && result.mode === 'MARK_IN_ERROR') { setMarkStep(true); setError(result.error ?? ''); return; }
    setError(result.error ?? 'We could not remove the placement.');
  }

  async function markInError(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('mark'); setError('');
    const { ok, result } = await send(`${endpoint}/entered-in-error`, 'POST', { reason, confirmed: true });
    setBusy('');
    if (!ok) { setError(result.error ?? 'We could not mark the placement as entered in error.'); return; }
    setDialogOpen(false);
    setMessage('Marked as entered in error. The record and its audit trail are kept, and it no longer counts as a current placement.');
    router.refresh();
  }

  return <div className="placement-actions">
    {message && <div className="form-success" role="status">{message}</div>}
    {error && !dialogOpen && <div className="form-error" role="alert">{error}</div>}

    <details className="relationship-editor" id="edit" open>
      <summary>Edit placement details</summary>
      <form className="form-grid" onSubmit={saveEdits} method="post">
        <div className="form-field"><label htmlFor="placement-start">Start date</label><input id="placement-start" name="startDate" type="date" defaultValue={placement.startDate} required /></div>
        <div className="form-field"><label htmlFor="placement-tenancy">Tenancy reference</label><input id="placement-tenancy" name="tenancyRef" defaultValue={placement.tenancyRef} /></div>
        <div className="form-field"><label htmlFor="placement-property">Property</label><select id="placement-property" value={propertyId} onChange={(event) => { const next = properties.find((item) => item.id === event.target.value); setPropertyId(event.target.value); setRoomId(next?.rooms[0]?.id ?? ''); }}>{properties.map((item) => <option key={item.id} value={item.id}>{item.publicName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="placement-room">Room</label><select id="placement-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>{property?.rooms.map((room) => <option key={room.id} value={room.id}>{room.label} · {room.status.toLowerCase()}</option>)}</select></div>
        <div className="form-field full"><button className="crm-button crm-button-primary" disabled={disabled}>{busy === 'edit' ? 'Saving…' : 'Save placement details'}</button></div>
      </form>
    </details>

    <details className="relationship-editor" id="end">
      <summary>{placement.status === 'ACTIVE' ? 'End placement' : 'Placement has ended'}</summary>
      {placement.status === 'ACTIVE' ? <form className="form-grid" onSubmit={endPlacement} method="post">
        <div className="form-field"><label htmlFor="placement-outcome">Outcome</label><select id="placement-outcome" name="status" defaultValue="MOVED_OUT"><option value="MOVED_OUT">Moved out — the resident left</option><option value="CANCELLED">Cancelled — the placement did not go ahead</option></select></div>
        <div className="form-field"><label htmlFor="placement-end">End date</label><input id="placement-end" name="endDate" type="date" defaultValue={placement.endDate || today()} required /></div>
        <div className="form-field full"><label htmlFor="placement-end-reason">Move-out reason</label><input id="placement-end-reason" name="endedReason" defaultValue={placement.endedReason} placeholder="Where the resident moved on to" /></div>
        <div className="form-field full"><button className="crm-button crm-button-primary" disabled={disabled}>{busy === 'end' ? 'Ending…' : 'End placement'}</button></div>
      </form> : <div className="inline-control">
        <span className="timeline-meta">Ending keeps the record in the placement history. Reopening is only possible while the room is still free.</span>
        <button type="button" className="crm-button crm-button-secondary" disabled={disabled} onClick={reopenPlacement}>{busy === 'reopen' ? 'Reopening…' : 'Reopen placement'}</button>
      </div>}
    </details>

    <details className="relationship-editor" id="remove">
      <summary>Remove incorrect placement</summary>
      <div className="inline-control">
        <span className="timeline-meta">{SENTENCE}</span>
        <button type="button" className="crm-button crm-button-secondary" disabled={disabled} onClick={() => { setDialogOpen(true); setError(''); }}>Remove incorrect placement</button>
      </div>
    </details>

    {dialogOpen && <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-placement-title">
      <div className="confirm-dialog-panel">
        <h2 id="confirm-placement-title">{markStep ? 'Mark placement as entered in error?' : 'Remove incorrect placement?'}</h2>
        <p>{markStep
          ? plan.explanation
          : `${SENTENCE.split('.')[0]}. ${plan.explanation}`}</p>
        {plan.retained.length > 0 && <p className="timeline-meta">Kept either way: {plan.retained.join(', ')}.</p>}
        {markStep && plan.blockedBy.length > 0 && <ul className="confirm-dialog-reasons">{plan.blockedBy.map((item) => <li key={item}>{item}</li>)}</ul>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={markStep ? markInError : removePlacement} method="post">
          <div className="form-field full"><label htmlFor="placement-removal-reason">Reason</label><input id="placement-removal-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Duplicate placement created in error" required minLength={5} /></div>
          <div className="confirm-dialog-actions">
            <button type="button" className="crm-button crm-button-secondary" onClick={() => { setDialogOpen(false); setError(''); }}>Cancel</button>
            {markStep
              ? <button className="crm-button crm-button-primary" disabled={disabled || reason.trim().length < 5}>{busy === 'mark' ? 'Marking…' : 'Mark as entered in error'}</button>
              : <button className="crm-button crm-button-danger" disabled={disabled || reason.trim().length < 5}>{busy === 'remove' ? 'Removing…' : 'Remove incorrect placement'}</button>}
          </div>
        </form>
      </div>
    </div>}
  </div>;
}

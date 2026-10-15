import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getCrmPlacement } from '@/lib/data';
import { CrmPageHeader, EmptyState, MetricCard, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { PlacementActions } from '@/components/PlacementActions';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { isCurrentPlacement, placementLifecycleKind, placementLifecycleLabel, placementRemovalPlan } from '@/lib/placement-lifecycle';

const NOT_RECORDED = 'Not recorded';
const isoDay = (value: Date | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/**
 * One placement as an operational record.
 *
 * The page answers the questions staff actually ask about a stay: where the person is, since when,
 * what has been recorded against the move, and what else the organisation holds about them — and then
 * offers the three safe ways to correct or close it. Nothing here is a public projection: the address
 * level detail only appears for signed-in staff whose organisation holds the record.
 */
export default async function PlacementDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const placement = await getCrmPlacement(params.id);
  if (!placement) notFound();

  // The correction form may move a placement to another room or property, so the organisations's
  // properties are offered as options and the server re-validates whatever is chosen.
  const properties = await db.property.findMany({
    where: { organisationId: user.organisationId },
    select: { id: true, publicName: true, rooms: { select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } } },
    orderBy: { publicName: 'asc' }
  }).catch(() => []);

  const kind = placementLifecycleKind(placement);
  const current = isCurrentPlacement(placement.status);
  const plan = placementRemovalPlan({
    status: placement.status,
    occupancyRecords: placement.dependencies.occupancyRecords,
    moveChecklists: placement.dependencies.moveChecklists,
    retained: placement.dependencies.retained
  });
  const occupancy = placement.occupancyRecords[0];
  const roomLabel = placement.room?.label ?? NOT_RECORDED;
  const worker = placement.client.supportWorker?.name ?? placement.client.keyWorker?.name;
  const benefit = placement.client.housingBenefit[0];
  const lastSafeWell = placement.safeWellChecks[0];
  const placementTasks = placement.tasks.filter((task) => task.relatedType === 'PLACEMENT' && task.relatedId === placement.id);
  const otherTasks = placement.tasks.filter((task) => !placementTasks.includes(task));

  return <div className="crm-page">
    <CrmPageHeader
      eyebrow={`Placement / ${placement.client.reference}`}
      title={`${placement.client.displayName} · ${roomLabel}, ${placement.property.publicName}`}
      intro={`${placementLifecycleLabel(kind)} · started ${formatDate(placement.startDate)}${placement.endDate ? ` · ended ${formatDate(placement.endDate)}` : ''}`}
      action="Service user record"
      actionHref={`/crm/clients/${placement.clientId}`}
    />
    {placement.client.restricted && <RestrictedNote />}
    <div className="metric-grid">
      <MetricCard label="Placement status" value={placementLifecycleLabel(kind)} detail={current ? 'Counts as a current placement' : 'Held in the placement history'} tone={current ? 'teal' : 'blue'} icon="clipboard" />
      <MetricCard label="Room occupancy" value={roomLabel} detail={`${placement.property.publicName} · room is ${(placement.room?.status ?? 'unknown').toLowerCase()}`} tone="blue" icon="building" />
      <MetricCard label="Start date" value={formatDate(placement.startDate)} detail={placement.client.admissionDate ? `Service user admitted ${formatDate(placement.client.admissionDate)}` : 'No admission date recorded'} tone="gold" icon="calendar" />
      <MetricCard label="End date" value={placement.endDate ? formatDate(placement.endDate) : 'Open'} detail={current ? 'Not ended' : placement.endedReason || 'No move-out reason recorded'} tone={current ? 'teal' : 'red'} icon="calendar" />
    </div>

    <div className="crm-split">
      <section className="crm-panel">
        <div className="panel-header"><h2>Placement summary</h2><StatusBadge status={placement.status} tone={current ? 'success' : placement.status === 'ENTERED_IN_ERROR' ? 'danger' : 'neutral'} /></div>
        <div className="panel-body">
          <dl className="detail-list">
            <div><dt>Service user</dt><dd><Link href={`/crm/clients/${placement.clientId}`}>{placement.client.displayName} · {placement.client.reference}</Link></dd></div>
            <div><dt>Placement type</dt><dd>{placement.property.serviceType}{placement.tenancyRef ? ` · tenancy ${placement.tenancyRef}` : ' · no tenancy reference recorded'}</dd></div>
            <div><dt>Property</dt><dd><Link href={`/crm/properties/${placement.property.id}`}>{placement.property.publicName}</Link>{placement.property.confidential ? ' · confidential accommodation' : ''}</dd></div>
            <div><dt>Room</dt><dd>{roomLabel} · {placement.room?.status ?? 'status not recorded'}</dd></div>
            <div><dt>Start date</dt><dd>{formatDate(placement.startDate)}</dd></div>
            <div><dt>End date</dt><dd>{placement.endDate ? formatDate(placement.endDate) : 'Open — no end date recorded'}</dd></div>
            <div><dt>Current or historical</dt><dd>{placementLifecycleLabel(kind)}{current ? '' : ' · not counted as a current placement'}</dd></div>
            <div><dt>Assigned worker</dt><dd>{worker ?? 'Unassigned'}{placement.client.keyWorker && placement.client.supportWorker ? ` · key worker ${placement.client.keyWorker.name}` : ''}</dd></div>
            <div><dt>Move-out reason</dt><dd>{placement.endedReason ?? NOT_RECORDED}</dd></div>
            <div><dt>Occupancy record</dt><dd>{occupancy ? `${formatDate(occupancy.startDate)} → ${occupancy.endDate ? formatDate(occupancy.endDate) : 'open'}` : 'No room-occupancy row recorded for this placement'}</dd></div>
            <div><dt>Placement reference</dt><dd>{placement.id}</dd></div>
          </dl>
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Placement actions</h2><span className="timeline-meta">Every change is audited</span></div>
        <div className="panel-body">
          <PlacementActions
            placement={{
              id: placement.id,
              status: placement.status,
              startDate: isoDay(placement.startDate),
              endDate: isoDay(placement.endDate),
              tenancyRef: placement.tenancyRef ?? '',
              endedReason: placement.endedReason ?? '',
              propertyId: placement.propertyId,
              roomId: placement.roomId
            }}
            properties={properties}
            plan={plan}
          />
        </div>
      </section>
    </div>

    {placement.checklists.length > 0 && <TableCard title="Move-in and move-out checklists" count={`${placement.checklists.length} linked`}>
      <table className="crm-table"><thead><tr><th>Checklist</th><th>Status</th><th>Target date</th><th>Completed</th><th>Steps</th></tr></thead><tbody>
        {placement.checklists.map((checklist) => <tr key={checklist.id}>
          <td><strong>{checklist.checklistType.replace(/_/g, ' ').toLowerCase()}</strong><span className="timeline-meta">{checklist.notes ?? 'No notes recorded'}</span></td>
          <td><StatusBadge status={checklist.status} /></td>
          <td>{formatDate(checklist.targetDate)}</td>
          <td>{checklist.completedAt ? formatDateTime(checklist.completedAt) : 'Not completed'}</td>
          <td>{checklist.items.length ? <>{checklist.items.filter((item) => item.status === 'DONE' || item.status === 'COMPLETED').length} of {checklist.items.length} done<span className="timeline-meta">{checklist.items.filter((item) => item.status !== 'DONE' && item.status !== 'COMPLETED').slice(0, 2).map((item) => item.label).join(' · ') || 'Nothing outstanding'}</span></> : 'No steps recorded'}</td>
        </tr>)}
      </tbody></table>
    </TableCard>}

    <div className="crm-panels">
      <section className="crm-panel">
        <div className="panel-header"><h2>Safe &amp; Well</h2><Link href={`/crm/clients/${placement.clientId}`}>Service user record →</Link></div>
        <div className="panel-list">
          {lastSafeWell ? <div className="panel-list-item">
            <strong>{lastSafeWell.completedAt ? `Completed ${formatDate(lastSafeWell.completedAt)}` : `Scheduled ${formatDate(lastSafeWell.scheduledFor)}`}</strong>
            <span className="timeline-meta">{lastSafeWell.method.replace(/_/g, ' ').toLowerCase()}{lastSafeWell.nextDueAt ? ` · next due ${formatDate(lastSafeWell.nextDueAt)}` : ''}{lastSafeWell.concernRaised ? ' · concern raised' : ''}</span>
          </div> : <p className="calendar-empty">No Safe &amp; Well check recorded for this service user.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Maintenance</h2><Link href="/crm/maintenance">Repairs →</Link></div>
        <div className="panel-list">
          {placement.maintenanceTickets.length ? placement.maintenanceTickets.map((ticket) => <div className="panel-list-item" key={ticket.id}>
            <strong>{ticket.reference} · {ticket.title}</strong>
            <span className="timeline-meta">{formatDate(ticket.reportedAt)} · {ticket.priority.toLowerCase()} · <StatusBadge status={ticket.status} /></span>
          </div>) : <p className="calendar-empty">No repairs recorded for this room or service user.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Housing Benefit</h2><Link href="/crm/billing">Billing →</Link></div>
        <div className="panel-body">
          {benefit ? <dl className="detail-list">
            <div><dt>Claim status</dt><dd><StatusBadge status={benefit.status} /></dd></div>
            <div><dt>Payment status</dt><dd>{benefit.paymentStatus.replace(/_/g, ' ').toLowerCase()}</dd></div>
            <div><dt>Submitted</dt><dd>{benefit.submittedAt ? formatDate(benefit.submittedAt) : NOT_RECORDED}</dd></div>
          </dl> : <p className="calendar-empty">No Housing Benefit claim is linked to this service user.</p>}
        </div>
      </section>
    </div>

    <div className="crm-panels">
      <section className="crm-panel">
        <div className="panel-header"><h2>Appointments</h2><Link href="/crm/appointments">Diary →</Link></div>
        <div className="panel-list">
          {placement.appointments.length ? placement.appointments.map((appointment) => <div className="panel-list-item" key={appointment.id}>
            <strong>{appointment.title}</strong>
            <span className="timeline-meta">{formatDateTime(appointment.startsAt)} · {appointment.category.replace(/_/g, ' ').toLowerCase()} · <StatusBadge status={appointment.status} /></span>
          </div>) : <p className="calendar-empty">No upcoming appointments.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Tasks</h2><Link href="/crm/tasks">Task queue →</Link></div>
        <div className="panel-list">
          {placementTasks.length === 0 && otherTasks.length === 0 && <p className="calendar-empty">No open tasks for this service user.</p>}
          {placementTasks.map((task) => <div className="panel-list-item" key={task.id}>
            <strong>{task.title}</strong>
            <span className="timeline-meta">Linked to this placement · {task.dueAt ? `due ${formatDate(task.dueAt)}` : 'no due date'} · {task.priority.replace(/_/g, ' ').toLowerCase()} · <StatusBadge status={task.status} /></span>
          </div>)}
          {otherTasks.length > 0 && <div className="panel-list-item">
            <strong>Open work for {placement.client.reference}</strong>
            <span className="timeline-meta">{otherTasks.map((task) => task.title).join(' · ')}</span>
          </div>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Incidents</h2><Link href="/crm/incidents">Incident log →</Link></div>
        <div className="panel-list">
          {placement.incidents.length ? placement.incidents.map((incident) => <div className="panel-list-item" key={incident.id}>
            <strong><Link href={`/crm/incidents/${incident.id}`}>{incident.reference}</Link> · {incident.category}</strong>
            <span className="timeline-meta">{formatDateTime(incident.incidentAt)} · {incident.severity.toLowerCase()} · <StatusBadge status={incident.status} />{incident.restricted ? ' · restricted record' : ''}</span>
          </div>) : <p className="calendar-empty">No incidents recorded for this service user.</p>}
        </div>
      </section>
    </div>

    <TableCard title="Documents" count={`${placement.documentCount} filed`}>
      {placement.documents.length ? <table className="crm-table"><thead><tr><th>Document</th><th>Category</th><th>Filed</th><th>Access</th></tr></thead><tbody>
        {placement.documents.map((document) => <tr key={document.id}><td><strong>{document.displayName}</strong></td><td>{document.category}</td><td>{formatDate(document.createdAt)}</td><td>{document.restricted ? 'Restricted' : 'Standard'}</td></tr>)}
      </tbody></table> : <EmptyState title="No documents" message="Documents filed against this service user will appear here." />}
      {placement.documentCount > placement.documents.length && <p className="panel-body timeline-meta">Showing the {placement.documents.length} most recent of {placement.documentCount} documents. <Link href="/crm/documents">View all documents</Link>.</p>}
    </TableCard>
  </div>;
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCrmClientOptions, getCrmClientProfile } from '@/lib/data';
import { CrmPageHeader, EmptyState, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { CaseNoteForm } from '@/components/CaseNoteForm';
import { SupportPlanForm } from '@/components/SupportPlanForm';
import { IncidentCreateForm } from '@/components/IncidentCreateForm';
import { ClientDocumentUploadForm } from '@/components/ClientDocumentUploadForm';
import { ClientRelationshipForm } from '@/components/ClientRelationshipForm';
import { ClientRelationshipEditor } from '@/components/ClientRelationshipEditor';
import { ClientStatusControl } from '@/components/ClientStatusControl';
import { buildClientProfileTimeline, caseNoteTimelineKind } from '@/lib/client-profile';
import { isCurrentPlacement, placementLifecycleKind, placementLifecycleLabel } from '@/lib/placement-lifecycle';
import { isSupportPlanReviewOverdue } from '@/lib/domain';
import { buildClientRelationshipViews, relationshipOptions } from '@/lib/client-relationships';
import { groupTimelineByDay, summariseTimeline, timelineDayLabel } from '@/lib/su-timeline';
import { requiresContactEscalation, summariseContacts } from '@/lib/contact-tracking';
import { formatDate, formatDateTime } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

const NOT_RECORDED = 'Not recorded';
const TIMELINE_LIMIT = 50;

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireUser();
  const client = await getCrmClientProfile(params.id);
  if (!client) notFound();
  // Relationship links can only be made to records this account can already see, so a restricted
  // service user never appears as a linkable target.
  const linkableClients = (await getCrmClientOptions()).filter((option) => !option.restricted).map((option) => ({ id: option.id, displayName: option.displayName, reference: option.reference }));
  const relationshipTypes = relationshipOptions().map((definition) => ({ key: definition.key, label: definition.label }));
  const relationships = buildClientRelationshipViews({ outgoing: client.relationshipsFrom, incoming: client.relationshipsTo }, client.id);
  const openIncidents = client.incidents.filter((incident) => incident.status !== 'CLOSED');
  // Contact compliance is measured over logged contacts only. A case note with no way of keeping in
  // touch, no attempted or unsuccessful flag and no next-contact date stays a case note, so it cannot
  // inflate the planned-contact figures.
  const contactNotes = client.caseNotes.filter((note) => caseNoteTimelineKind(note) === 'CONTACT');
  const contactSummary = summariseContacts(
    contactNotes.map((note) => ({ occurredAt: note.occurredAt, completed: note.completed, attempted: note.attempted, meaningful: note.meaningful, method: note.method, direction: note.direction, durationMinutes: note.durationMinutes })),
    client.contactFrequencyDays
  );
  // One aggregated history for the person: referral, placement, plans, risks, contacts, case notes,
  // Safe & Well checks, incidents, appointments, tasks, concerns, complaints, repairs and documents.
  const timeline = buildClientProfileTimeline({ ...client, client: { id: client.id, reference: client.reference, displayName: client.displayName, restricted: client.restricted, status: client.status, createdAt: client.createdAt, admissionDate: client.admissionDate } }, { limit: TIMELINE_LIMIT });
  const timelineSummary = summariseTimeline(timeline);
  const timelineDays = groupTimelineByDay(timeline);
  // The placement the person is in now is an ACTIVE record. Everything else — ended, cancelled, or
  // marked entered in error — is history, so it can never be mistaken for where they live.
  const currentPlacement = client.placements.find((item) => isCurrentPlacement(item.status));
  const placementHistory = client.placements.filter((item) => item.id !== currentPlacement?.id);
  const placementRoomLabel = (entry: (typeof client.placements)[number]) => entry.property.rooms.find((room) => room.id === entry.roomId)?.label ?? 'Room not recorded';
  const plan = client.supportPlans[0];
  const latestRisk = client.riskAssessments[0];
  const penPortrait = client.penPortrait;
  const lastSafeWell = client.safeWellChecks.find((check) => check.completedAt);
  const nextSafeWell = client.safeWellChecks.find((check) => check.status === 'SCHEDULED' || check.nextDueAt);
  const benefit = client.housingBenefit[0];
  const checklist = client.moveChecklists[0];
  const checklistItems = checklist?.items ?? [];
  const openTasks = client.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
  return <div className="crm-page">
    <CrmPageHeader
      eyebrow={`Client / ${client.reference}`}
      title={client.restricted ? 'Restricted record' : client.displayName}
      intro={`${client.service?.title ?? 'No service assigned'} · ${client.status.replace(/_/g, ' ').toLowerCase()} · Key worker ${client.keyWorker?.name ?? 'unassigned'}`}
      action="Add case note"
      actionHref="#case-note"
    />
    {client.restricted && <RestrictedNote />}
    <div className="metric-grid">
      <div className="metric-card metric-teal"><div className="metric-top"><span>Placement</span></div><strong style={{ fontSize: 20 }}>{currentPlacement?.property?.publicName ?? 'No current placement'}</strong><p>{currentPlacement ? `Started ${formatDate(currentPlacement.startDate)}` : 'No placement started'}</p></div>
      <div className="metric-card metric-red"><div className="metric-top"><span>Risk level</span></div><strong style={{ fontSize: 20 }}>{client.riskLevel}</strong><p>{latestRisk ? `Last assessment ${formatDate(latestRisk.assessedAt)}` : 'No risk assessment on file'}</p></div>
      <div className="metric-card metric-gold"><div className="metric-top"><span>Support plan</span></div><strong style={{ fontSize: 20 }}>{plan ? plan.status.replace(/_/g, ' ').toLowerCase() : 'Needs setup'}</strong><p>{plan?.reviewDate ? `Review ${formatDate(plan.reviewDate)}` : 'No review date set'}</p>{isSupportPlanReviewOverdue(plan?.reviewDate) && <p><span className="crm-badge badge-danger">Review overdue</span></p>}</div>
      <div className="metric-card metric-blue"><div className="metric-top"><span>Safe &amp; Well</span></div><strong style={{ fontSize: 20 }}>{lastSafeWell?.completedAt ? formatDate(lastSafeWell.completedAt) : 'Never completed'}</strong><p>{nextSafeWell?.nextDueAt ? `Next due ${formatDate(nextSafeWell.nextDueAt)}` : `Every ${client.safeWellFrequencyDays} days`}</p></div>
    </div>
    <div className="metric-grid">
      <div className="metric-card"><div className="metric-top"><span>Contact compliance</span></div><strong style={{ fontSize: 20 }}>{contactSummary.state.replace(/_/g, ' ').toLowerCase()}</strong><p>{contactSummary.lastSupportContactAt ? `Last contact ${formatDate(contactSummary.lastSupportContactAt)} · ${contactSummary.daysSinceSupport} days ago` : 'No contact counted as support yet'}{contactSummary.dueAt ? ` · due ${formatDate(contactSummary.dueAt)}` : ''}</p></div>
      <div className="metric-card metric-gold"><div className="metric-top"><span>Documents</span></div><strong style={{ fontSize: 20 }}>{client._count.documents}</strong><p>{client.documents[0] ? `Latest ${formatDate(client.documents[0].createdAt)} · ${client.documents[0].category}` : 'Nothing filed against this person'}{client._count.documents > client.documents.length ? ` · ${client.documents.length} most recent shown` : ''}</p></div>
      <div className="metric-card metric-red"><div className="metric-top"><span>Incidents</span></div><strong style={{ fontSize: 20 }}>{openIncidents.length}</strong><p>{client.incidents[0] ? `Latest ${client.incidents[0].reference} · ${formatDate(client.incidents[0].incidentAt)} · ${client.incidents[0].severity.toLowerCase()}` : 'No incidents recorded'}</p></div>
      <div className="metric-card metric-blue"><div className="metric-top"><span>Relationships</span></div><strong style={{ fontSize: 20 }}>{relationships.length}</strong><p>{relationships.filter((relationship) => relationship.isNextOfKin).length} next of kin · {relationships.filter((relationship) => relationship.isEmergencyContact).length} emergency contacts</p></div>
    </div>
    <div className="crm-split">
      <section className="crm-panel">
        <div className="panel-header"><h2>Current placement</h2>{currentPlacement ? <Link href={`/crm/placements/${currentPlacement.id}`}>Open placement →</Link> : <Link href="/crm/placements#new">Add placement →</Link>}</div>
        <div className="panel-body">
          {currentPlacement ? <dl className="detail-list">
            <div><dt>Where</dt><dd><Link href={`/crm/placements/${currentPlacement.id}`}>{placementRoomLabel(currentPlacement)}, {currentPlacement.property.publicName}</Link></dd></div>
            <div><dt>Started</dt><dd>{formatDate(currentPlacement.startDate)}</dd></div>
            <div><dt>End date</dt><dd>{currentPlacement.endDate ? formatDate(currentPlacement.endDate) : 'Open-ended'}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={currentPlacement.status} tone="success" />{placementLifecycleKind(currentPlacement) === 'TEMPORARY' ? ' · temporary placement' : ''}</dd></div>
            <div><dt>Tenancy</dt><dd>{currentPlacement.tenancyRef ?? NOT_RECORDED}</dd></div>
          </dl> : <>
            <p className="calendar-empty"><strong>No current placement.</strong> This person is not occupying a room. If a placement was created by mistake, correct it from the placement register so the history stays accurate.</p>
            <Link className="crm-button crm-button-primary" href="/crm/placements#new">Add placement</Link>
          </>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Placement history</h2><span className="timeline-meta">{placementHistory.length} previous</span></div>
        <div className="panel-list">
          {placementHistory.length ? placementHistory.map((entry) => <div className="panel-list-item" key={entry.id}>
            <strong><Link href={`/crm/placements/${entry.id}`}>{entry.property.publicName} · {placementRoomLabel(entry)}</Link></strong>
            <span className="timeline-meta">{formatDate(entry.startDate)} → {entry.endDate ? formatDate(entry.endDate) : 'no end date recorded'} · {placementLifecycleLabel(placementLifecycleKind(entry))}</span>
          </div>) : <p className="calendar-empty">No previous placements recorded.</p>}
        </div>
      </section>
    </div>
    <div className="crm-split">
      <section className="crm-panel">
        <div className="panel-header"><h2>Overview</h2><span className="timeline-meta">Updated {formatDate(client.updatedAt)}</span></div>
        <div className="panel-body">
          <dl className="detail-list">
            <div><dt>Reference</dt><dd>{client.reference}</dd></div>
            <div><dt>Service</dt><dd>{client.service?.title ?? NOT_RECORDED}</dd></div>
            <div><dt>Key worker</dt><dd>{client.keyWorker?.name ?? NOT_RECORDED}</dd></div>
            <div><dt>Support worker</dt><dd>{client.supportWorker?.name ?? NOT_RECORDED}</dd></div>
            <div><dt>Referral</dt><dd>{client.referral ? `${client.referral.reference} · ${formatDate(client.referral.createdAt)} · ${client.referral.status.replace(/_/g, ' ').toLowerCase()}${client.referral.referrerOrganisation ? ` · ${client.referral.referrerOrganisation}` : ''}` : NOT_RECORDED}</dd></div>
            <div><dt>Contact frequency</dt><dd>Every {client.contactFrequencyDays} days</dd></div>
            <div><dt>Missed contact streak</dt><dd>{contactSummary.missedStreak} of {contactSummary.total} recorded contacts{contactSummary.state === 'OVERDUE' ? ' · contact overdue' : ''}</dd></div>
            <div><dt>Admitted</dt><dd>{client.admissionDate ? formatDate(client.admissionDate) : NOT_RECORDED}</dd></div>
            <div><dt>Communication needs</dt><dd>{client.communicationNeeds ?? NOT_RECORDED}</dd></div>
            <div><dt>Important alerts</dt><dd>{client.importantAlerts ?? NOT_RECORDED}</dd></div>
            <div><dt>Safeguarding flag</dt><dd>{client.safeguardingFlag ? 'Active — review in supervision' : 'Not flagged'}</dd></div>
            <div><dt>Housing Benefit</dt><dd>{benefit ? `${benefit.status.replace(/_/g, ' ').toLowerCase()}${benefit.submittedAt ? ` · submitted ${formatDate(benefit.submittedAt)}` : ''}` : NOT_RECORDED}</dd></div>
            <div><dt>Record created</dt><dd>{formatDate(client.createdAt)}</dd></div>
          </dl>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(15, 23, 42, 0.12)' }}>
            <p className="timeline-meta" style={{ marginBottom: 8 }}>Service-user records are never deleted. This record carries placements, case notes, incidents, documents and safeguarding history, and the audit trail has to stay complete, so archiving is how a person is taken out of day-to-day use while everything they are part of stays intact.</p>
            <ClientStatusControl clientId={client.id} displayName={client.restricted ? 'this record' : client.displayName} status={client.status} />
          </div>
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Pen portrait</h2><StatusBadge status={penPortrait?.status ?? 'NOT_STARTED'} /></div>
        <div className="panel-body">
          {penPortrait ? <dl className="detail-list">
            <div><dt>About me</dt><dd>{penPortrait.aboutMe ?? NOT_RECORDED}</dd></div>
            <div><dt>My needs</dt><dd>{penPortrait.myNeeds ?? NOT_RECORDED}</dd></div>
            <div><dt>What matters</dt><dd>{penPortrait.whatMatters ?? NOT_RECORDED}</dd></div>
            <div><dt>How I show it</dt><dd>{penPortrait.howIShow ?? NOT_RECORDED}</dd></div>
            <div><dt>Strengths</dt><dd>{penPortrait.myStrengths ?? NOT_RECORDED}</dd></div>
            <div><dt>Who supports me</dt><dd>{penPortrait.whoSupportsMe ?? NOT_RECORDED}</dd></div>
            <div><dt>Review due</dt><dd>{penPortrait.reviewDueAt ? formatDate(penPortrait.reviewDueAt) : NOT_RECORDED}</dd></div>
          </dl> : <p className="calendar-empty">No pen portrait has been started for this person.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Support plan goals</h2><span className="badge-row">{isSupportPlanReviewOverdue(plan?.reviewDate) && <span className="crm-badge badge-danger">Review overdue</span>}<a href="#support-plan">Record a review →</a></span></div>
        <div className="panel-list">
          {plan?.goals.length ? plan.goals.map((goal) => <div className="panel-list-item" key={goal.id}>
            <strong>{goal.desiredOutcome}</strong>
            <span className="timeline-meta">{goal.category.replace(/_/g, ' ').toLowerCase()} · {goal.status.replace(/_/g, ' ').toLowerCase()}</span>
          </div>) : <p className="calendar-empty">No goals recorded yet.</p>}
        </div>
      </section>
    </div>
    <div className="crm-panels">
      <section className="crm-panel">
        <div className="panel-header"><h2>Risk assessments</h2><span className="timeline-meta">{client.riskAssessments.length} on file</span></div>
        <div className="panel-list">
          {client.riskAssessments.length ? client.riskAssessments.map((assessment) => <div className="panel-list-item" key={assessment.id}>
            <strong>{assessment.assessmentType.replace(/_/g, ' ').toLowerCase()} risk · <StatusBadge status={assessment.level} /></strong>
            <span className="timeline-meta">Assessed {formatDate(assessment.assessedAt)} · {assessment.status.replace(/_/g, ' ').toLowerCase()}{assessment.reviewDueAt ? ` · review ${formatDate(assessment.reviewDueAt)}` : ''}</span>
            {assessment.summary && <span className="timeline-meta">{assessment.summary}</span>}
          </div>) : <p className="calendar-empty">No risk assessment has been recorded.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Safe &amp; Well checks</h2><span className="timeline-meta">Every {client.safeWellFrequencyDays} days</span></div>
        <div className="panel-list">
          {client.safeWellChecks.length ? client.safeWellChecks.map((check) => <div className="panel-list-item" key={check.id}>
            <strong><StatusBadge status={check.status} /> {check.method.replace(/_/g, ' ').toLowerCase()}</strong>
            <span className="timeline-meta">{check.completedAt ? `Completed ${formatDate(check.completedAt)}` : check.scheduledFor ? `Scheduled ${formatDate(check.scheduledFor)}` : 'Not scheduled'}{check.nextDueAt ? ` · next due ${formatDate(check.nextDueAt)}` : ''}</span>
            {check.concernRaised && <span className="timeline-meta">Concern raised: {check.concernSummary ?? 'see record'}</span>}
          </div>) : <p className="calendar-empty">No Safe &amp; Well checks have been recorded.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Move checklist</h2><span className="timeline-meta">{checklist ? `${checklistItems.filter((item) => item.status === 'COMPLETED').length}/${checklistItems.length} done` : 'Not started'}</span></div>
        <div className="panel-list">
          {checklist ? <>
            <div className="panel-list-item"><strong>{checklist.checklistType.replace(/_/g, ' ').toLowerCase()} · <StatusBadge status={checklist.status} /></strong><span className="timeline-meta">{checklist.targetDate ? `Target ${formatDate(checklist.targetDate)}` : 'No target date'}</span></div>
            {checklistItems.map((item) => <div className="panel-list-item" key={item.id}><strong>{item.label}</strong><span className="timeline-meta">{item.category.replace(/_/g, ' ').toLowerCase()} · {item.status.replace(/_/g, ' ').toLowerCase()}{item.dueAt ? ` · due ${formatDate(item.dueAt)}` : ''}</span></div>)}
          </> : <p className="calendar-empty">No move-in checklist has been created.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Relationships</h2><a href="#relationships">Manage →</a></div>
        <div className="panel-list">
          {relationships.length ? relationships.slice(0, 4).map((relationship) => <div className="panel-list-item" key={relationship.id}>
            <strong>{relationship.counterpart.name} · {relationship.label}</strong>
            <span className="timeline-meta">{relationship.counterpart.kind === 'CLIENT' ? 'Service user' : 'External contact'}{relationship.isNextOfKin ? ' · next of kin' : ''}{relationship.isEmergencyContact ? ' · emergency contact' : ''}{relationship.startDate ? ` · from ${formatDate(relationship.startDate)}` : ''}{relationship.endDate ? ` · ended ${formatDate(relationship.endDate)}` : ''}{relationship.direction === 'INCOMING' ? ` · recorded on ${relationship.ownerName}’s profile` : ''}</span>
          </div>) : <p className="calendar-empty">No relationships have been recorded.</p>}
          {relationships.length > 4 && <p className="calendar-empty">{relationships.length - 4} more in the relationships section below.</p>}
        </div>
      </section>
    </div>
    <div className="dashboard-grid">
      <TableCard title="Appointments and visits" count={`${client.appointments.length} recent`}>
        {client.appointments.length ? <table className="crm-table"><thead><tr><th>When</th><th>Appointment</th><th>Category</th><th>Status</th></tr></thead><tbody>
          {client.appointments.map((appointment) => <tr key={appointment.id}>
            <td><strong>{formatDateTime(appointment.startsAt)}</strong></td>
            <td>{appointment.title}{appointment.outcome && <span className="timeline-meta">Outcome: {appointment.outcome}</span>}</td>
            <td>{appointment.category.replace(/_/g, ' ').toLowerCase()}</td>
            <td><StatusBadge status={appointment.status} /></td>
          </tr>)}
        </tbody></table> : <EmptyState title="No appointments" message="Appointments booked for this person will appear here." />}
      </TableCard>
      <TableCard title="Repairs and concerns" count={`${client.maintenanceTickets.length + client.concerns.length} records`}>
        {client.maintenanceTickets.length || client.concerns.length ? <table className="crm-table"><thead><tr><th>Type</th><th>Record</th><th>Raised</th><th>Status</th></tr></thead><tbody>
          {client.maintenanceTickets.map((ticket) => <tr key={ticket.id}>
            <td>Repair</td>
            <td><strong>{ticket.title}</strong>{ticket.safetyRisk && <span className="timeline-meta">Safety risk</span>}</td>
            <td>{formatDate(ticket.reportedAt)}</td>
            <td><StatusBadge status={ticket.status} /></td>
          </tr>)}
          {client.concerns.map((concern) => <tr key={concern.id}>
            <td>Concern</td>
            <td><strong>{concern.title}</strong><span className="timeline-meta">Severity {concern.severity.toLowerCase()}</span></td>
            <td>{formatDate(concern.raisedAt)}</td>
            <td><StatusBadge status={concern.status} /></td>
          </tr>)}
        </tbody></table> : <EmptyState title="Nothing reported" message="Repairs and concerns linked to this person will appear here." />}
      </TableCard>
    </div>
    <div className="crm-panels">
      <section className="crm-panel">
        <div className="panel-header"><h2>Complaints</h2><span className="timeline-meta">{client.complaints.length} linked</span></div>
        <div className="panel-list">
          {client.complaints.length ? client.complaints.map((complaint) => <div className="panel-list-item" key={complaint.id}>
            <strong>{complaint.reference} · {complaint.title}</strong>
            <span className="timeline-meta">Received {formatDate(complaint.receivedAt)} · {complaint.stage.replace(/_/g, ' ').toLowerCase()} · <StatusBadge status={complaint.status} /></span>
          </div>) : <p className="calendar-empty">No complaints are linked to this person.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Open tasks</h2><Link href="/crm/tasks">Task queue →</Link></div>
        <div className="panel-list">
          {openTasks.length ? openTasks.map((task) => <div className="panel-list-item" key={task.id}>
            <strong>{task.title}</strong>
            <span className="timeline-meta">{task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date'} · {task.priority.replace(/_/g, ' ').toLowerCase()} · <StatusBadge status={task.status} /></span>
          </div>) : <p className="calendar-empty">No open tasks for this person.</p>}
        </div>
      </section>
    </div>
    <TableCard title="Incidents" count={`${client.incidents.length} recorded · ${openIncidents.length} open`}>
      {client.incidents.length ? <table className="crm-table"><thead><tr><th>Reference</th><th>When</th><th>Type &amp; severity</th><th>Location</th><th>Detail</th><th>Assigned</th><th>Actions</th><th>Status</th></tr></thead><tbody>
        {client.incidents.map((incident) => {
          const outstanding = incident.actions.filter((action) => !action.completedAt);
          return <tr key={incident.id}>
            <td><Link href={`/crm/incidents/${incident.id}`}><strong>{incident.reference}</strong></Link><span className="timeline-meta">{incident.restricted ? 'Restricted record' : 'Standard record'}</span></td>
            <td>{formatDateTime(incident.incidentAt)}</td>
            <td>{incident.category}<span className="timeline-meta"><StatusBadge status={incident.severity} /></span></td>
            <td>{incident.location ?? NOT_RECORDED}</td>
            <td>{incident.restricted ? 'Withheld — restricted record' : incident.description}<span className="timeline-meta">{incident.immediateAction ? `Immediate action: ${incident.immediateAction}` : 'No immediate action recorded'}{incident.closureDecision ? ` · closed: ${incident.closureDecision}` : ''}</span></td>
            <td>{incident.assignedLead?.name ?? NOT_RECORDED}</td>
            <td>{incident.actions.length ? <>{`${incident.actions.length} logged`}{outstanding.length ? <span className="timeline-meta">{`${outstanding.length} outstanding`}{outstanding[0]?.dueDate ? ` · next due ${formatDate(outstanding[0].dueDate)}` : ''}{outstanding[0]?.owner ? ` · ${outstanding[0].owner}` : ''}</span> : <span className="timeline-meta">All completed</span>}</> : 'None logged'}</td>
            <td><StatusBadge status={incident.status} /><span className="timeline-meta">{incident.reviewDate ? `Review ${formatDate(incident.reviewDate)}` : 'No review date set'}</span></td>
          </tr>;
        })}
      </tbody></table> : <EmptyState title="No incidents" message="Incidents involving this person will appear here." />}
    </TableCard>
    <IncidentCreateForm clients={linkableClients} lockedClient={{ id: client.id, displayName: client.displayName, reference: client.reference }} />
    <TableCard title="Documents" count={`${client._count.documents} filed`}>
      {client.documents.length ? <table className="crm-table"><thead><tr><th>Document</th><th>Description</th><th>Document date</th><th>Filed</th><th>Type &amp; size</th><th>Access</th><th>File</th></tr></thead><tbody>
        {client.documents.map((document) => <tr key={document.id}>
          <td><strong>{document.displayName}</strong><span className="timeline-meta">{document.category}</span></td>
          <td>{document.description ?? NOT_RECORDED}</td>
          <td>{document.documentDate ? formatDate(document.documentDate) : NOT_RECORDED}</td>
          <td>{formatDate(document.createdAt)}<span className="timeline-meta">{client.documentUploaders[document.uploadedBy] ?? 'Uploader not recorded'}</span></td>
          <td>{document.mimeType}<span className="timeline-meta">{formatBytes(document.sizeBytes)}</span></td>
          <td>{document.restricted ? <StatusBadge status="RESTRICTED" tone="warning" /> : <StatusBadge status="FILED" tone="success" />}<span className="timeline-meta">{document.malwareScanStatus === 'CLEAN' ? 'Scan clean' : `Scan ${document.malwareScanStatus.toLowerCase()}`}</span></td>
          <td><a href={`/api/crm/documents/${document.id}/download`}>Download</a></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No documents" message="Files filed against this person will appear here." />}
      {client._count.documents > client.documents.length && <p className="panel-body timeline-meta">Showing the {client.documents.length} most recent of {client._count.documents} documents. <Link href="/crm/documents">View all documents</Link>.</p>}
    </TableCard>
    <ClientDocumentUploadForm clientId={client.id} />
    <section className="crm-panel" id="contacts">
      <div className="panel-header"><h2>Contact assessment</h2><span className="timeline-meta">Planned contact every {client.contactFrequencyDays} days</span></div>
      <div className="panel-list">
        <div className="panel-list-item">
          <strong>{contactSummary.state === 'OVERDUE' ? 'Contact is overdue' : contactSummary.state === 'DUE_SOON' ? 'Contact is due soon' : contactSummary.state === 'ON_TRACK' ? 'Contacts on track' : 'No contact has counted as support yet'}</strong>
          <span className="timeline-meta">{contactSummary.lastSupportContactAt ? `Last counted contact ${formatDate(contactSummary.lastSupportContactAt)} · ${contactSummary.daysSinceSupport} days ago` : 'Nothing recorded as support-bearing contact'}{contactSummary.dueAt ? ` · next due ${formatDate(contactSummary.dueAt)}` : ''}</span>
          <span className="timeline-meta">{contactSummary.total} recent contacts · {contactSummary.meaningful} counted as support · {contactSummary.attempted} attempted or unsuccessful · {contactSummary.totalMinutes} minutes of meaningful contact</span>
          <span className="timeline-meta">Missed-contact streak {contactSummary.missedStreak}{requiresContactEscalation(contactSummary) ? ' · welfare-check escalation triggered' : ''}</span>
          <span className="timeline-meta">{Object.keys(contactSummary.methodBreakdown).length ? `Ways of keeping in touch: ${Object.entries(contactSummary.methodBreakdown).map(([method, count]) => `${method.replace(/_/g, ' ').toLowerCase()} ${count}`).join(' · ')}` : 'No meaningful contact method recorded yet'}</span>
          <span className="timeline-meta">Contacts and case notes are the same stored record, told apart by how they were logged: {contactNotes.length} of {client.caseNotes.length} notes were logged with a way of keeping in touch, an attempted or unsuccessful flag, or a next-contact date, so they count as contacts; the rest are case notes only and are excluded from the figures above.</span>
          <span className="timeline-meta">Log a contact from Add case note or contact below — choosing a way of keeping in touch is what makes the note count towards planned contact.</span>
        </div>
      </div>
    </section>
    <section className="crm-panel" id="timeline">
      <div className="panel-header"><h2>Timeline</h2><span className="timeline-meta">{timelineSummary.total} most recent events · {timelineSummary.upcoming} upcoming · {timelineSummary.last30Days} in the last 30 days{timelineSummary.lastActivityAt ? ` · last activity ${formatDate(timelineSummary.lastActivityAt)}` : ''}</span></div>
      <div className="timeline">
        {timelineDays.length ? timelineDays.map((day) => <div key={day.key}>
          <p className="timeline-meta">{timelineDayLabel(day.date)}</p>
          {day.entries.map((entry) => <div className="timeline-item" key={entry.id}>
            <strong>{entry.href ? <Link href={entry.href}>{entry.title}</Link> : entry.title}</strong>
            <span className="timeline-meta">{entry.kindLabel} · {formatDateTime(entry.occurredAt)}{entry.category ? ` · ${entry.category.replace(/_/g, ' ').toLowerCase()}` : ''}{entry.status ? ` · ${entry.status.replace(/_/g, ' ').toLowerCase()}` : ''}</span>
            {entry.redacted ? <span className="timeline-meta">Restricted record — narrative withheld, chronology kept. Access is logged.</span> : entry.detail ? <span className="timeline-meta">{entry.detail}</span> : null}
          </div>)}
        </div>) : <p className="calendar-empty">Nothing has been recorded on this profile yet.</p>}
      </div>
      {timelineSummary.byKind.length > 0 && <div className="panel-list"><p className="timeline-meta">In this view: {timelineSummary.byKind.map((kind) => `${kind.label} ${kind.count}`).join(' · ')}</p></div>}
    </section>
    <section className="crm-panel" id="relationships">
      <div className="panel-header"><h2>Relationships</h2><span className="timeline-meta">{relationships.length} linked · one record, read from both profiles</span></div>
      <div className="panel-list">
        {relationships.length ? relationships.map((relationship) => <div className="panel-list-item" key={relationship.id}>
          <strong>{relationship.counterpart.href ? <Link href={relationship.counterpart.href}>{relationship.counterpart.name}</Link> : relationship.counterpart.name}{` · ${relationship.label}`}</strong>
          <span className="timeline-meta">{relationship.counterpart.kind === 'CLIENT' ? `Service user${relationship.counterpart.reference ? ` ${relationship.counterpart.reference}` : ''}${relationship.counterpart.restricted ? ' · restricted record' : ''}` : 'External contact'}{relationship.isNextOfKin ? ' · next of kin' : ''}{relationship.isEmergencyContact ? ' · emergency contact' : ''}{relationship.startDate ? ` · known since ${formatDate(relationship.startDate)}` : ''}{relationship.endDate ? ` · ended ${formatDate(relationship.endDate)}` : ''}</span>
          {relationship.direction === 'INCOMING' && <span className="timeline-meta">Recorded on {relationship.ownerProfileHref ? <Link href={relationship.ownerProfileHref}>{relationship.ownerName}</Link> : relationship.ownerName}’s profile. The label here is its inverse, so the link has only been entered once.</span>}
          {relationship.contact && <span className="timeline-meta">{relationship.contact.phone ?? 'No phone recorded'}{relationship.contact.email ? ` · ${relationship.contact.email}` : ''}{relationship.contact.address ? ` · ${relationship.contact.address}` : ''}{relationship.contact.preferredContactMethod ? ` · prefers ${relationship.contact.preferredContactMethod}` : ''} · {relationship.contact.consentToContact ? 'consent to contact recorded' : 'no consent recorded'}</span>}
          {relationship.notes && <span className="timeline-meta">{relationship.notes}</span>}
          {relationship.editableFromThisProfile
            ? <ClientRelationshipEditor clientId={client.id} types={relationshipTypes} relationship={{ id: relationship.id, relationshipType: relationship.type, startDate: relationship.startDate ? relationship.startDate.toISOString().slice(0, 10) : '', endDate: relationship.endDate ? relationship.endDate.toISOString().slice(0, 10) : '', notes: relationship.notes ?? '', isNextOfKin: relationship.isNextOfKin, isEmergencyContact: relationship.isEmergencyContact, counterpartName: relationship.counterpart.name }} />
            : <span className="timeline-meta">Held on the other profile, so this link is read-only here.</span>}
        </div>) : <p className="calendar-empty">No relationships have been recorded.</p>}
      </div>
    </section>
    <ClientRelationshipForm clientId={client.id} clients={linkableClients} types={relationshipTypes} />
    <SupportPlanForm clientId={client.id} plan={plan ? { id: plan.id, reviewDate: plan.reviewDate } : null} />
    <TableCard title="Case note history" count={`${client.caseNotes.length} shown`}>
      {client.caseNotes.length ? <table className="crm-table"><thead><tr><th>When</th><th>Contact</th><th>Outcome</th><th>Follow-up</th><th>Access</th></tr></thead><tbody>
        {client.caseNotes.map((note) => <tr key={note.id}>
          <td><strong>{formatDate(note.occurredAt)}</strong><span className="timeline-meta">{note.method.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td>{note.contactType}<span className="timeline-meta">{note.category}{note.attempted ? ' · attempted contact' : ''}{note.finalised ? ' · finalised' : ' · draft'}</span></td>
          <td>{note.outcome ?? 'No outcome recorded'}</td>
          <td>{note.followUpDate ? formatDate(note.followUpDate) : 'Not required'}</td>
          <td>{note.restricted ? <StatusBadge status="RESTRICTED" /> : <StatusBadge status="RECORDED" />}</td>
        </tr>)}
      </tbody></table> : <EmptyState title="No case notes" message="Case notes recorded for this person will appear here." />}
    </TableCard>
    <CaseNoteForm clientId={client.id} />
  </div>;
}

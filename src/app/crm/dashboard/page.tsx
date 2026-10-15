import Link from 'next/link';
import { getCrmOperationsBoard, getDashboardData } from '@/lib/data';
import { CrmPageHeader, EmptyState, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { buildDashboardMetrics, CALENDAR_ENTRY_KIND_LABELS } from '@/lib/dashboard-domain';
import { formatDate, formatDateTime } from '@/lib/format';

export default async function CrmDashboardPage() {
  const [board, data] = await Promise.all([getCrmOperationsBoard(), getDashboardData()]);
  const metrics = board ? buildDashboardMetrics({
    tasks: board.tasks,
    appointments: board.appointments,
    maintenance: board.maintenance,
    concerns: board.concerns,
    complaints: board.complaints,
    compliance: board.compliance,
    attention: board.attention
  }) : [];
  const today = new Date();
  return <div className="crm-page">
    <CrmPageHeader
      eyebrow={today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      title="Operations dashboard"
      intro="Open work, the week's diary, and the safeguarding escalations that need a decision today."
      action="New referral"
      actionHref="/crm/referrals/new"
    />
    {board ? <div className="metric-grid">
      {metrics.map((metric) => <Link className="metric-link" href={metric.href} key={metric.key}>
        <MetricCard label={metric.label} value={metric.value} detail={metric.detail} tone={metric.tone} icon={metric.icon} />
      </Link>)}
    </div> : <EmptyState title="Live figures unavailable" message="The operational data could not be loaded. Public pages and record lookups are unaffected." />}
    <div className="dashboard-grid">
      <TableCard title="Needs attention" count={board ? `${board.attention.total} people` : undefined}>
        {board?.attentionRows.length ? <table className="crm-table"><thead><tr><th>Person</th><th>Severity</th><th>Why</th><th>Contact due</th><th>Open work</th><th>Open</th></tr></thead><tbody>
          {board.attentionRows.slice(0, 6).map((row) => <tr key={row.clientId}>
            <td><strong>{row.restricted ? 'Restricted record' : row.label}</strong></td>
            <td><StatusBadge status={row.severity} /></td>
            <td>{row.reasons.join(' · ')}</td>
            <td>{row.contactDueAt ? formatDate(row.contactDueAt) : row.safeWellDueAt ? formatDate(row.safeWellDueAt) : 'Not scheduled'}</td>
            <td>{row.openTasks}{row.overdueTasks ? ` (${row.overdueTasks} overdue)` : ''}</td>
            <td><Link href={`/crm/clients/${row.clientId}`}>Open client</Link></td>
          </tr>)}
        </tbody></table> : <EmptyState title="Everyone is in step" message="No service user is behind on planned contact or Safe and Well checks." />}
      </TableCard>
      <section className="table-card">
        <div className="table-card-header"><h2>This week <span>{board?.calendarSummary.total ?? 0}</span></h2><Link href="/crm/calendar">Open calendar <span>→</span></Link></div>
        <div className="panel-list">
          {board?.calendarEntries.length ? board.calendarEntries.slice(0, 6).map((entry) => <div className="panel-list-item" key={entry.id}>
            <strong>{entry.title}</strong>
            <span className="timeline-meta">{CALENDAR_ENTRY_KIND_LABELS[entry.kind]} · {entry.allDay ? 'All day' : formatDateTime(entry.startsAt)} · {entry.status.replace(/_/g, ' ').toLowerCase()}</span>
          </div>) : <p className="calendar-empty">Nothing is scheduled for this week.</p>}
        </div>
      </section>
    </div>
    <div className="crm-panels">
      <section className="crm-panel">
        <div className="panel-header"><h2>Referrals needing action</h2><Link href="/crm/referrals">Open referrals →</Link></div>
        <div className="panel-list">
          {data.referralsNeedingAction?.length ? data.referralsNeedingAction.slice(0, 5).map((referral) => <div className="panel-list-item" key={referral.id}>
            <strong><Link href={`/crm/referrals/${referral.id}`}>{referral.reference}</Link> · {referral.personName}</strong>
            <span className="timeline-meta">{referral.service?.title ?? 'Service not set'} · {referral.status.replace(/_/g, ' ').toLowerCase()} · {referral.followUpDate ? `Follow up ${formatDate(referral.followUpDate)}` : 'No follow-up date'}</span>
          </div>) : <p className="calendar-empty">No referrals are waiting for a first action.</p>}
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Escalations</h2><Link href="/crm/reports">Reports →</Link></div>
        <div className="panel-list">
          <div className="panel-list-item"><strong>{board?.maintenance.breached ?? 0} repairs past target</strong><span className="timeline-meta">{board?.maintenance.safetyRisks ?? 0} with a safety risk · {board?.maintenance.open ?? 0} open</span></div>
          <div className="panel-list-item"><strong>{board?.concerns.open ?? 0} open concerns</strong><span className="timeline-meta">{board?.concerns.overdue ?? 0} past the response window</span></div>
          <div className="panel-list-item"><strong>{board?.complaints.acknowledgementOverdue ?? 0} complaints awaiting acknowledgement</strong><span className="timeline-meta">{board?.complaints.responseOverdue ?? 0} past the response deadline</span></div>
          <div className="panel-list-item"><strong>{board?.compliance.overdue ?? 0} compliance obligations overdue</strong><span className="timeline-meta">{board?.compliance.complianceRate ?? 0}% of obligations are in date</span></div>
        </div>
      </section>
      <section className="crm-panel">
        <div className="panel-header"><h2>Next open tasks</h2><Link href="/crm/tasks">View all →</Link></div>
        <div className="panel-list">
          {data.tasks?.length ? data.tasks.map((task) => <div className="panel-list-item" key={task.id}>
            <strong>{task.title}</strong>
            <span className="timeline-meta">{task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date'} · {(task.priority ?? 'not set').replace(/_/g, ' ').toLowerCase()} · {(task.status ?? 'unknown').replace(/_/g, ' ').toLowerCase()}</span>
          </div>) : <p className="calendar-empty">No open tasks are waiting.</p>}
        </div>
      </section>
    </div>
  </div>;
}

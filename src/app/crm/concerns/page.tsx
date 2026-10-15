import { getCrmClientOptions, getCrmConcerns, getCrmOperationsBoard, getCrmPropertyOptions, getCrmStaffOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { ConcernForm, ConcernUpdateControl } from '@/components/ConcernForm';
import { CONCERN_STATUSES } from '@/lib/concerns-domain';
import { formatDate, formatDateTime } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function ConcernsPage() {
  await requireUser();
  const [concerns, clients, properties, staff, board] = await Promise.all([
    getCrmConcerns(),
    getCrmClientOptions(),
    getCrmPropertyOptions(),
    getCrmStaffOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.concerns;
  const staffName = (id: string | null) => staff.find((member) => member.id === id)?.name ?? 'Unassigned';
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Safety & wellbeing" title="Concerns" intro="Raise, action, and resolve concerns, and record when a referral is needed." action="Raise concern" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Open concerns" value={summary?.open ?? 0} detail={`${summary?.critical ?? 0} critical`} tone={summary?.critical ? 'red' : 'teal'} icon="alert" />
      <MetricCard label="Past action date" value={summary?.overdue ?? 0} detail={`${summary?.escalated ?? 0} escalated`} tone="red" icon="clipboard" />
      <MetricCard label="Referrals needed" value={summary?.referralsRequired ?? 0} detail="External referral to be arranged" tone="gold" icon="users" />
      <MetricCard label="Average resolution" value={summary?.averageResolutionDays === null || summary?.averageResolutionDays === undefined ? '—' : `${summary.averageResolutionDays} days`} detail={`${summary?.resolved ?? 0} resolved`} tone="blue" icon="chart" />
    </div>
    <ConcernForm
      clients={clients.map((client) => ({ id: client.id, label: `${client.restricted ? 'Restricted record' : client.displayName} (${client.reference})` }))}
      properties={properties.map((property) => ({ id: property.id, label: property.publicName }))}
      staff={staff.map((member) => ({ id: member.id, label: member.name }))}
    />
    <FilterBar placeholder="Search concerns">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Concern status">
        <option value="ALL">All concerns</option>
        {CONCERN_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Concern register" count={`${concerns.length} records`}>
      {concerns.length ? <table className="crm-table"><thead><tr><th>Reference</th><th>Concern</th><th>Person</th><th>Severity</th><th>Raised</th><th>Action due</th><th>Owner</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {concerns.map((concern) => <tr key={concern.id}>
          <td><strong>{concern.reference}</strong>{concern.referralNeeded && <span className="timeline-meta">Referral needed</span>}</td>
          <td>{concern.title}<span className="timeline-meta">{concern.category.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td>{concern.client ? (concern.client.restricted ? 'Restricted record' : concern.client.displayName) : 'Not linked'}</td>
          <td><StatusBadge status={concern.severity} /></td>
          <td>{formatDateTime(concern.raisedAt)}</td>
          <td>{concern.dueAt ? formatDate(concern.dueAt) : 'Not set'}</td>
          <td>{staffName(concern.ownerId)}</td>
          <td><StatusBadge status={concern.status} /></td>
          <td><ConcernUpdateControl concernId={concern.id} status={concern.status} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No concerns raised" message="Raise a concern with the action it needs, so nothing is left without an owner." />}
    </TableCard>
  </div>;
}

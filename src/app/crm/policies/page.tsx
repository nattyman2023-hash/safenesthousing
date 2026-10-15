import { getCrmOperationsBoard, getCrmPolicies, getCrmStaffOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { PolicyResourceForm } from '@/components/PolicyResourceForm';
import { PolicyStatusControl } from '@/components/PolicyStatusControl';
import { POLICY_STATUSES } from '@/lib/compliance-domain';
import { formatDate } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function PoliciesPage() {
  await requireUser();
  const [policies, staff, board] = await Promise.all([
    getCrmPolicies(),
    getCrmStaffOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.policies;
  const staffName = (id: string | null) => staff.find((member) => member.id === id)?.name ?? 'Unassigned';
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Governance" title="Policies & resources" intro="Approved policies, review dates, and the documents staff must confirm they have read." action="Add policy" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Active" value={summary?.active ?? 0} detail={`${summary?.total ?? 0} documents on file`} icon="clipboard" />
      <MetricCard label="Review due soon" value={summary?.dueSoon ?? 0} detail="Within the review window" tone="gold" icon="calendar" />
      <MetricCard label="Review overdue" value={summary?.overdue ?? 0} detail="Past the review date" tone="red" icon="alert" />
      <MetricCard label="Read confirmation" value={summary?.requiresRead ?? 0} detail={`${summary?.drafts ?? 0} in draft`} tone="blue" icon="users" />
    </div>
    <PolicyResourceForm staff={staff.map((member) => ({ id: member.id, label: member.name }))} />
    <FilterBar placeholder="Search policies and resources">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Policy status">
        <option value="ALL">All statuses</option>
        {POLICY_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Policy library" count={`${policies.length} documents`}>
      {policies.length ? <table className="crm-table"><thead><tr><th>Document</th><th>Category</th><th>Version</th><th>Effective</th><th>Review due</th><th>Owner</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {policies.map((policy) => <tr key={policy.id}>
          <td><strong>{policy.title}</strong>{policy.requiresRead && <span className="timeline-meta">Read confirmation required</span>}</td>
          <td>{policy.category.replace(/_/g, ' ').toLowerCase()}</td>
          <td>{policy.version ?? '—'}</td>
          <td>{policy.effectiveFrom ? formatDate(policy.effectiveFrom) : 'Not set'}</td>
          <td>{policy.reviewDueAt ? formatDate(policy.reviewDueAt) : 'Not set'}</td>
          <td>{staffName(policy.ownerId)}</td>
          <td><StatusBadge status={policy.status} /></td>
          <td><PolicyStatusControl policyId={policy.id} status={policy.status} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No policies yet" message="Add policies and resources so review dates and read confirmations are tracked." />}
    </TableCard>
  </div>;
}

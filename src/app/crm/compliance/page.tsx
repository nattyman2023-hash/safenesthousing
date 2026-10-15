import { getCrmComplianceRecords, getCrmOperationsBoard, getCrmPropertyOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { ComplianceRecordForm } from '@/components/ComplianceRecordForm';
import { ComplianceStatusControl } from '@/components/ComplianceStatusControl';
import { COMPLIANCE_STATUSES } from '@/lib/compliance-domain';
import { formatDate } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function CompliancePage() {
  await requireUser();
  const [records, properties, board] = await Promise.all([
    getCrmComplianceRecords(),
    getCrmPropertyOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.compliance;
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Regulatory" title="Compliance" intro="Certificates, safety checks, and renewal dates for every property." action="Record obligation" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Compliance rate" value={`${summary?.complianceRate ?? 0}%`} detail={`${summary?.total ?? 0} obligations tracked`} tone={summary?.overdue ? 'gold' : 'teal'} icon="clipboard" />
      <MetricCard label="Overdue" value={summary?.overdue ?? 0} detail={summary?.overdueTypes?.length ? summary.overdueTypes.join(', ').replace(/_/g, ' ').toLowerCase() : 'Nothing overdue'} tone="red" icon="alert" />
      <MetricCard label="Due soon" value={summary?.dueSoon ?? 0} detail="Within the next 30 days" tone="gold" icon="calendar" />
      <MetricCard label="Not recorded" value={summary?.missing ?? 0} detail={`${summary?.exempt ?? 0} exempt or not applicable`} tone="blue" icon="clipboard" />
    </div>
    <ComplianceRecordForm properties={properties.map((property) => ({ id: property.id, label: property.publicName }))} />
    <FilterBar placeholder="Search obligations by property or reference">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Compliance status">
        <option value="ALL">All statuses</option>
        {COMPLIANCE_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Compliance register" count={`${records.length} records`}>
      {records.length ? <table className="crm-table"><thead><tr><th>Property</th><th>Obligation</th><th>Certificate</th><th>Last checked</th><th>Next due</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.id}>
          <td><strong>{record.property?.publicName ?? 'Unknown property'}</strong><span className="timeline-meta">{record.property?.serviceType?.replace(/_/g, ' ').toLowerCase() ?? ''}</span></td>
          <td>{record.complianceType.replace(/_/g, ' ').toLowerCase()}</td>
          <td>{record.certificateRef ?? '—'}{record.contractor && <span className="timeline-meta">{record.contractor}</span>}</td>
          <td>{record.lastCheckedAt ? formatDate(record.lastCheckedAt) : 'Not recorded'}</td>
          <td>{record.nextDueAt ? formatDate(record.nextDueAt) : 'Not set'}</td>
          <td><StatusBadge status={record.status} /></td>
          <td><ComplianceStatusControl recordId={record.id} propertyId={record.propertyId} status={record.status} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="Nothing tracked yet" message="Record each property's obligations so renewal dates stay visible." />}
    </TableCard>
  </div>;
}

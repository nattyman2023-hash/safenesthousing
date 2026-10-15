import { getCrmClientOptions, getCrmComplaints, getCrmOperationsBoard, getCrmStaffOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { ComplaintForm } from '@/components/ComplaintForm';
import { ComplaintUpdateControl } from '@/components/ComplaintUpdateControl';
import { COMPLAINT_STATUSES } from '@/lib/complaints-domain';
import { formatDate } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function ComplaintsPage() {
  await requireUser();
  const [complaints, clients, staff, board] = await Promise.all([
    getCrmComplaints(),
    getCrmClientOptions(),
    getCrmStaffOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.complaints;
  const staffName = (id: string | null) => staff.find((member) => member.id === id)?.name ?? 'Unassigned';
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Quality & learning" title="Complaints" intro="Log complaints, meet the acknowledgement deadline, and record what the organisation learned." action="Log complaint" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Open complaints" value={summary?.open ?? 0} detail={`${summary?.dueSoon ?? 0} response due soon`} icon="clipboard" />
      <MetricCard label="Acknowledgement overdue" value={summary?.acknowledgementOverdue ?? 0} detail="Five working days from receipt" tone="red" icon="alert" />
      <MetricCard label="Response overdue" value={summary?.responseOverdue ?? 0} detail={`${summary?.upheld ?? 0} upheld`} tone="gold" icon="alert" />
      <MetricCard label="Learning outstanding" value={summary?.learningOutstanding ?? 0} detail={summary?.averageResponseDays ? `Average response ${summary.averageResponseDays} days` : 'Response time not yet measurable'} tone="blue" icon="chart" />
    </div>
    <ComplaintForm
      clients={clients.map((client) => ({ id: client.id, label: `${client.restricted ? 'Restricted record' : client.displayName} (${client.reference})` }))}
      staff={staff.map((member) => ({ id: member.id, label: member.name }))}
    />
    <FilterBar placeholder="Search complaints">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Complaint status">
        <option value="ALL">All complaints</option>
        {COMPLAINT_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Complaint register" count={`${complaints.length} records`}>
      {complaints.length ? <table className="crm-table"><thead><tr><th>Reference</th><th>Complaint</th><th>Person</th><th>Stage</th><th>Received</th><th>Response due</th><th>Owner</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {complaints.map((complaint) => <tr key={complaint.id}>
          <td><strong>{complaint.reference}</strong>{complaint.learning ? <span className="timeline-meta">Learning recorded</span> : <span className="timeline-meta">Learning outstanding</span>}</td>
          <td>{complaint.title}<span className="timeline-meta">{complaint.category.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td>{complaint.client ? (complaint.client.restricted ? 'Restricted record' : complaint.client.displayName) : complaint.complainantName ?? 'Not linked'}</td>
          <td>{complaint.stage.replace(/_/g, ' ').toLowerCase()}</td>
          <td>{formatDate(complaint.receivedAt)}</td>
          <td>{complaint.dueAt ? formatDate(complaint.dueAt) : 'Not set'}</td>
          <td>{staffName(complaint.ownerId)}</td>
          <td><StatusBadge status={complaint.status} /></td>
          <td><ComplaintUpdateControl complaintId={complaint.id} status={complaint.status} stage={complaint.stage} severity={complaint.severity} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No complaints logged" message="Log complaints as they arrive so acknowledgement and response deadlines are tracked." />}
    </TableCard>
  </div>;
}

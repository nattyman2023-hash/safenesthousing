import { getCrmClientOptions, getCrmMaintenanceTickets, getCrmOperationsBoard, getCrmPropertyOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { MaintenanceTicketForm } from '@/components/MaintenanceTicketForm';
import { MaintenanceUpdateControl } from '@/components/MaintenanceUpdateControl';
import { MAINTENANCE_STATUSES } from '@/lib/operations-domain';
import { formatDate, formatDateTime } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function MaintenancePage() {
  await requireUser();
  const [tickets, properties, clients, board] = await Promise.all([
    getCrmMaintenanceTickets(),
    getCrmPropertyOptions(),
    getCrmClientOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.maintenance;
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Operations" title="Repairs" intro="Repair tickets, target dates, and the safety risks that cannot wait." action="Log repair" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Open repairs" value={summary?.open ?? 0} detail={`${summary?.total ?? 0} logged in total`} icon="clipboard" />
      <MetricCard label="Past target" value={summary?.breached ?? 0} detail={`${summary?.dueSoon ?? 0} due soon`} tone="red" icon="alert" />
      <MetricCard label="Safety risks" value={summary?.safetyRisks ?? 0} detail="Flagged as a risk to people" tone="gold" icon="alert" />
      <MetricCard label="Average fix" value={summary?.averageFixDays === null || summary?.averageFixDays === undefined ? '—' : `${summary.averageFixDays} days`} detail={`${summary?.completedThisPeriod ?? 0} completed this period`} tone="blue" icon="chart" />
    </div>
    <MaintenanceTicketForm
      properties={properties.map((property) => ({ id: property.id, label: property.publicName }))}
      clients={clients.map((client) => ({ id: client.id, label: `${client.restricted ? 'Restricted record' : client.displayName} (${client.reference})` }))}
    />
    <FilterBar placeholder="Search repairs">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Repair status">
        <option value="ALL">All repairs</option>
        {MAINTENANCE_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Repair register" count={`${tickets.length} tickets`}>
      {tickets.length ? <table className="crm-table"><thead><tr><th>Reference</th><th>Repair</th><th>Property</th><th>Priority</th><th>Reported</th><th>Target</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {tickets.map((ticket) => <tr key={ticket.id}>
          <td><strong>{ticket.reference}</strong>{ticket.safetyRisk && <span className="timeline-meta">Safety risk</span>}</td>
          <td>{ticket.title}<span className="timeline-meta">{ticket.category.replace(/_/g, ' ').toLowerCase()} · {ticket.trade.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td>{ticket.property?.publicName ?? '—'}</td>
          <td><StatusBadge status={ticket.priority} /></td>
          <td>{formatDateTime(ticket.reportedAt)}</td>
          <td>{ticket.targetFixAt ? formatDate(ticket.targetFixAt) : 'Not set'}</td>
          <td><StatusBadge status={ticket.status} /></td>
          <td><MaintenanceUpdateControl ticketId={ticket.id} status={ticket.status} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No repairs logged" message="Log a repair against a property so the target date and safety risk are tracked." />}
    </TableCard>
  </div>;
}

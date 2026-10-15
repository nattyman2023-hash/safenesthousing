import { getCrmAppointments, getCrmClientOptions, getCrmOperationsBoard, getCrmPropertyOptions, getCrmStaffOptions } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { AppointmentCreateForm } from '@/components/AppointmentCreateForm';
import { AppointmentStatusControl } from '@/components/AppointmentStatusControl';
import { APPOINTMENT_STATUSES } from '@/lib/appointments';
import { formatDateTime } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function AppointmentsPage() {
  await requireUser();
  const [appointments, clients, properties, staff, board] = await Promise.all([
    getCrmAppointments(),
    getCrmClientOptions(),
    getCrmPropertyOptions(),
    getCrmStaffOptions(),
    getCrmOperationsBoard()
  ]);
  const summary = board?.appointments;
  const staffName = (id: string | null) => staff.find((member) => member.id === id)?.name ?? 'Unassigned';
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Operations" title="Appointments" intro="Book visits, record outcomes, and keep the weekly diary honest." action="Book appointment" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="This week" value={summary?.thisWeek ?? 0} detail={`${summary?.today ?? 0} today · ${summary?.startingSoon ?? 0} starting within the hour`} icon="calendar" />
      <MetricCard label="Outcome needed" value={summary?.needsOutcome ?? 0} detail="Past appointments without an outcome" tone="gold" icon="clipboard" />
      <MetricCard label="No access" value={summary?.noAccess ?? 0} detail="Access failures to follow up" tone="red" icon="alert" />
      <MetricCard label="Missed" value={summary?.missed ?? 0} detail={`${summary?.total ?? 0} appointments on record`} tone="blue" icon="chart" />
    </div>
    <AppointmentCreateForm
      clients={clients.map((client) => ({ id: client.id, label: `${client.restricted ? 'Restricted record' : client.displayName} (${client.reference})` }))}
      properties={properties.map((property) => ({ id: property.id, label: property.publicName }))}
      staff={staff.map((member) => ({ id: member.id, label: member.name }))}
    />
    <FilterBar placeholder="Search appointments">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Appointment status">
        <option value="ALL">All appointments</option>
        {APPOINTMENT_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ').toLowerCase()}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Appointment book" count={`${appointments.length} records`}>
      {appointments.length ? <table className="crm-table"><thead><tr><th>When</th><th>Appointment</th><th>Category</th><th>Person</th><th>Property</th><th>Owner</th><th>Status</th><th>Update</th></tr></thead><tbody>
        {appointments.map((appointment) => <tr key={appointment.id}>
          <td><strong>{formatDateTime(appointment.startsAt)}</strong>{appointment.allDay && <span className="timeline-meta">All day</span>}</td>
          <td>{appointment.title}<span className="timeline-meta">{appointment.location ?? 'Location not set'}</span></td>
          <td>{appointment.category.replace(/_/g, ' ').toLowerCase()}</td>
          <td>{appointment.client ? (appointment.client.restricted ? 'Restricted record' : appointment.client.displayName) : 'Not linked'}</td>
          <td>{appointment.property?.publicName ?? '—'}</td>
          <td>{staffName(appointment.ownerId)}</td>
          <td><StatusBadge status={appointment.status} /></td>
          <td><AppointmentStatusControl appointmentId={appointment.id} status={appointment.status} /></td>
        </tr>)}
      </tbody></table> : <EmptyState title="No appointments yet" message="Book the first visit and it will appear here, with outcomes attached to the person." />}
    </TableCard>
  </div>;
}

import Link from 'next/link';
import { getCrmClientOptions, getCrmOperationsBoard } from '@/lib/data';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { CALENDAR_ENTRY_KIND_LABELS } from '@/lib/dashboard-domain';
import { formatDateTime } from '@/lib/format';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

export default async function CalendarPage() {
  await requireUser();
  const [board, clients] = await Promise.all([getCrmOperationsBoard(), getCrmClientOptions()]);
  if (!board) return <div className="crm-page"><CrmPageHeader eyebrow="Operations" title="Calendar" intro="The week's appointments and dated work in one view." /><EmptyState title="Calendar unavailable" message="We could not load the diary. Try again in a moment." /></div>;
  const { calendarDays, calendarSummary, calendarEntries } = board;
  const clientName = (id: string | null) => {
    if (!id) return 'Not linked';
    const client = clients.find((row) => row.id === id);
    if (!client) return 'Person not found';
    return client.restricted ? 'Restricted record' : client.displayName;
  };
  return <div className="crm-page">
    <CrmPageHeader eyebrow="Operations" title="Calendar" intro="Appointments and dated work for the current week, from Monday to Sunday." action="Book appointment" actionHref="/crm/appointments#new" />
    <div className="metric-grid">
      <MetricCard label="Entries this week" value={calendarSummary.total} detail={`${calendarSummary.appointments} appointments · ${calendarSummary.tasks} dated tasks`} icon="calendar" />
      <MetricCard label="Past target or outcome" value={calendarSummary.overdue} detail={`${calendarSummary.needsOutcome} still need an outcome`} tone={calendarSummary.overdue ? 'red' : 'teal'} icon="alert" />
      <MetricCard label="Busiest day" value={calendarSummary.busiestDayCount} detail={calendarSummary.busiestDayKey ?? 'Nothing scheduled'} tone="blue" icon="chart" />
      <MetricCard label="Week covered" value={board.weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} detail={`To ${board.weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`} tone="gold" icon="clipboard" />
    </div>
    <div className="calendar-grid">
      {calendarDays.map((day) => <div className={day.isToday ? 'calendar-day is-today' : 'calendar-day'} key={day.key}>
        <div className="calendar-day-head"><strong>{day.date.toLocaleDateString('en-GB', { weekday: 'short' })}</strong><span>{day.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
        {day.entries.length ? day.entries.map((entry) => <div className={entry.overdue ? 'calendar-entry is-overdue' : 'calendar-entry'} key={entry.id}>
          <span className="calendar-entry-kind">{CALENDAR_ENTRY_KIND_LABELS[entry.kind]}</span>
          <strong>{entry.title}</strong>
          <span className="calendar-entry-time">{entry.allDay ? 'All day' : entry.startsAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>) : <p className="calendar-empty">Nothing scheduled</p>}
      </div>)}
    </div>
    <FilterBar placeholder="Search this week's entries">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Entry status">
        <option value="ALL">All entries</option>
        <option value="OVERDUE">Overdue</option>
        <option value="SCHEDULED">Scheduled</option>
        <option value="OPEN">Open</option>
        <option value="DONE">Done</option>
      </select>
    </FilterBar>
    <TableCard title="This week" count={`${calendarEntries.length} entries`}>
      {calendarEntries.length ? <table className="crm-table"><thead><tr><th>When</th><th>Type</th><th>Entry</th><th>Person</th><th>Status</th><th>Open</th></tr></thead><tbody>
        {calendarEntries.map((entry) => <tr key={entry.id}>
          <td><strong>{formatDateTime(entry.startsAt)}</strong>{entry.endsAt && <span className="timeline-meta">Until {entry.endsAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}</td>
          <td>{CALENDAR_ENTRY_KIND_LABELS[entry.kind]}</td>
          <td>{entry.title}<span className="timeline-meta">{entry.category.replace(/_/g, ' ').toLowerCase()}</span></td>
          <td>{clientName(entry.clientId)}</td>
          <td><StatusBadge status={entry.overdue ? 'OVERDUE' : entry.status} /></td>
          <td><Link href={entry.kind === 'APPOINTMENT' ? '/crm/appointments' : '/crm/tasks'}>{entry.kind === 'APPOINTMENT' ? 'Appointment book' : 'Task list'}</Link></td>
        </tr>)}
      </tbody></table> : <EmptyState title="Nothing scheduled" message="Book an appointment or date a task and it will appear on this week's calendar." />}
    </TableCard>
  </div>;
}

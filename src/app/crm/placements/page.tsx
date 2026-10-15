import Link from 'next/link';
import { db } from '@/lib/db';
import { getCrmPlacements } from '@/lib/data';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { ClickableRow } from '@/components/ClickableRow';
import { CrmPageHeader, EmptyState, FilterBar, MetricCard, TableCard } from '@/components/CrmUI';
import { PlacementForm } from '@/components/PlacementForm';
import { PlacementRowActions } from '@/components/PlacementRowActions';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';
import { placementLifecycleKind, placementLifecycleLabel, placementLifecycleStages, placementLifecycleTone } from '@/lib/placement-lifecycle';

/**
 * The placement register.
 *
 * Every stage is named in words as well as colour, so "current", "temporary", "ended", "cancelled"
 * and "entered in error" can be told apart without relying on a hue; the whole row opens the
 * placement, and the secondary actions sit behind one ⋯ menu rather than filling the row with
 * buttons.
 */
export default async function PlacementsPage() {
  const user = await requireUser();
  const [placements, clients, properties] = await Promise.all([
    getCrmPlacements(),
    db.client.findMany({ where: { organisationId: user.organisationId, status: { not: 'ARCHIVED' } }, select: { id: true, reference: true, displayName: true }, orderBy: { displayName: 'asc' } }).catch(() => []),
    db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true, publicName: true, rooms: { select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } } }, orderBy: { publicName: 'asc' } }).catch(() => [])
  ]);

  const rows = placements.map((placement) => ({ placement, kind: placementLifecycleKind(placement) }));
  const stageCount = (kind: string) => rows.filter((row) => row.kind === kind).length;
  const availableRooms = properties.reduce((total, property) => total + property.rooms.filter((room) => room.status === 'AVAILABLE').length, 0);

  return <div className="crm-page">
    <CrmPageHeader eyebrow="Housing operations" title="Placements" intro="Move-in, move-out, licence, tenancy, and occupancy workflows." action="Create placement" actionHref="#new" />
    <div className="metric-grid">
      <MetricCard label="Current placements" value={stageCount('CURRENT')} detail="Open-ended room assignments" tone="teal" icon="users" />
      <MetricCard label="Temporary placements" value={stageCount('TEMPORARY')} detail="Active with an agreed end date" tone="gold" icon="calendar" />
      <MetricCard label="Ended or cancelled" value={stageCount('ENDED') + stageCount('CANCELLED')} detail="Kept in the placement history" tone="blue" icon="clipboard" />
      <MetricCard label="Available rooms" value={availableRooms} detail="Ready for a placement" tone="teal" icon="building" />
    </div>
    <PlacementForm clients={clients} properties={properties} />
    <FilterBar placeholder="Search resident, reference, property, or room">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Placement stage">
        <option value="ALL">All stages</option>
        {placementLifecycleStages().map((stage) => <option key={stage} value={stage}>{placementLifecycleLabel(stage)}</option>)}
      </select>
    </FilterBar>
    <TableCard title="Placement register" count={`${placements.length} records`}>
      {placements.length ? <table className="crm-table">
        <thead><tr><th>Resident</th><th>Property</th><th>Room</th><th>Start</th><th>End</th><th>Stage</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map(({ placement, kind }) => {
            const room = placement.property.rooms.find((item) => item.id === placement.roomId);
            const label = `${placement.client.displayName} ${placement.client.reference}`;
            return <ClickableRow key={placement.id} href={`/crm/placements/${placement.id}`}>
              <td><Link href={`/crm/placements/${placement.id}`}><strong>{placement.client.reference}</strong></Link><span className="timeline-meta">{placement.client.displayName}{placement.client.restricted ? ' · restricted record' : ''}</span></td>
              <td>{placement.property.publicName}</td>
              <td>{room?.label ?? 'Room not recorded'}<span className="timeline-meta">{room?.status ? `room is ${room.status.toLowerCase()}` : 'room status unknown'}</span></td>
              <td>{formatDate(placement.startDate)}</td>
              <td>{placement.endDate ? formatDate(placement.endDate) : 'Open'}</td>
              <td><StatusBadge status={kind} tone={placementLifecycleTone(kind)} /><span className="timeline-meta">Stored status {placement.status.replace(/_/g, ' ').toLowerCase()}</span></td>
              <td><PlacementRowActions placementId={placement.id} current={kind === 'CURRENT' || kind === 'TEMPORARY'} label={label} /></td>
            </ClickableRow>;
          })}
        </tbody>
      </table> : <EmptyState title="No placements recorded" message="Create a placement when a client moves into a room." />}
    </TableCard>
    {stageCount('ENTERED_IN_ERROR') > 0 && <p className="timeline-meta" style={{ marginTop: 12 }}>
      {stageCount('ENTERED_IN_ERROR')} placement{stageCount('ENTERED_IN_ERROR') === 1 ? ' is' : 's are'} marked as entered in error. They are kept so the correction stays auditable; open a record to review it.
    </p>}
  </div>;
}

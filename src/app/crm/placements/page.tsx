import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { CrmPageHeader, EmptyState, MetricCard, TableCard } from '@/components/CrmUI';
import { PlacementForm } from '@/components/PlacementForm';
import { PlacementStatusControl } from '@/components/PlacementStatusControl';
import { formatDate } from '@/lib/format';

export default async function PlacementsPage() {
  const user = await requireUser();
  const [placements, clients, properties] = await Promise.all([
    db.placement.findMany({ where: { client: { organisationId: user.organisationId } }, include: { client: { select: { id: true, reference: true, displayName: true, restricted: true } }, property: { select: { id: true, publicName: true, rooms: { select: { id: true, label: true } } } } }, orderBy: { startDate: 'desc' } }).catch(() => []),
    db.client.findMany({ where: { organisationId: user.organisationId, status: { not: 'ARCHIVED' } }, select: { id: true, reference: true, displayName: true }, orderBy: { displayName: 'asc' } }).catch(() => []),
    db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true, publicName: true, rooms: { select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } } }, orderBy: { publicName: 'asc' } }).catch(() => [])
  ]);
  const active = placements.filter((placement) => placement.status === 'ACTIVE').length;
  const availableRooms = properties.reduce((total, property) => total + property.rooms.filter((room) => room.status === 'AVAILABLE').length, 0);
  return <div className="crm-page"><CrmPageHeader eyebrow="Housing operations" title="Placements" intro="Move-in, move-out, licence, tenancy, and occupancy workflows." action="Create placement" actionHref="#new" /><div className="metric-grid"><MetricCard label="Active placements" value={active} detail="Current room assignments" tone="teal" icon="users" /><MetricCard label="Available rooms" value={availableRooms} detail="Ready for a placement" tone="blue" icon="building" /><MetricCard label="Placement records" value={placements.length} detail="All organisation records" tone="gold" icon="clipboard" /></div><PlacementForm clients={clients} properties={properties} /><TableCard title="Placement register" count={`${placements.length} records`}>{placements.length ? <table className="crm-table"><thead><tr><th>Client ref</th><th>Resident</th><th>Property</th><th>Room</th><th>Start date</th><th>End date</th><th>Status</th></tr></thead><tbody>{placements.map((placement) => <tr key={placement.id}><td><strong>{placement.client.reference}</strong></td><td>{placement.client.displayName}</td><td>{placement.property.publicName}</td><td>{placement.property.rooms.find((room) => room.id === placement.roomId)?.label ?? placement.roomId}</td><td>{formatDate(placement.startDate)}</td><td>{formatDate(placement.endDate)}</td><td><PlacementStatusControl placementId={placement.id} status={placement.status} endDate={placement.endDate} /></td></tr>)}</tbody></table> : <EmptyState title="No placements recorded" message="Create a placement when a client moves into a room." />}</TableCard></div>;
}

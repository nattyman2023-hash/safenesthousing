import { db } from '@/lib/db';
import { canViewRestricted, getCurrentUser, getScopedIds, hasPermission } from '@/lib/auth';
import { CrmPageHeader, EmptyState, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { PlacementForm } from '@/components/PlacementForm';
import { PlacementStatusControl } from '@/components/PlacementStatusControl';
import { formatDate } from '@/lib/format';

export default async function PlacementsPage() {
  const user = await getCurrentUser();
  const canRead = await hasPermission(user, 'placements.read');
  const canWrite = await hasPermission(user, 'placements.write');
  if (!user || !canRead) return <div className="crm-page"><CrmPageHeader eyebrow="Housing operations" title="Placements" intro="Move-in, move-out, licence, tenancy, and occupancy workflows." /><EmptyState title="Placement access required" message="Ask an administrator to grant placements.read access to this area." /></div>;
  const serviceIds = getScopedIds(user, 'serviceIds');
  const propertyIds = getScopedIds(user, 'propertyIds');
  const restricted = canViewRestricted(user);
  const [placements, clients, properties] = await Promise.all([
    db.placement.findMany({ where: { client: { organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}), ...(!restricted ? { restricted: false } : {}) }, ...(propertyIds.length ? { property: { id: { in: propertyIds } } } : {}) }, include: { client: { select: { id: true, reference: true, displayName: true, restricted: true } }, property: { select: { id: true, publicName: true, rooms: { select: { id: true, label: true } } } } }, orderBy: { startDate: 'desc' } }).catch(() => []),
    db.client.findMany({ where: { organisationId: user.organisationId, status: { not: 'ARCHIVED' }, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}), ...(!restricted ? { restricted: false } : {}) }, select: { id: true, reference: true, displayName: true }, orderBy: { displayName: 'asc' } }).catch(() => []),
    db.property.findMany({ where: { organisationId: user.organisationId, ...(propertyIds.length ? { id: { in: propertyIds } } : {}) }, select: { id: true, publicName: true, rooms: { select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } } }, orderBy: { publicName: 'asc' } }).catch(() => [])
  ]);
  const active = placements.filter((placement) => placement.status === 'ACTIVE').length;
  const availableRooms = properties.reduce((total, property) => total + property.rooms.filter((room) => room.status === 'AVAILABLE').length, 0);
  return <div className="crm-page"><CrmPageHeader eyebrow="Housing operations" title="Placements" intro="Move-in, move-out, licence, tenancy, and occupancy workflows." action={canWrite ? 'Create placement' : undefined} actionHref={canWrite ? '#new' : undefined} /><div className="metric-grid"><MetricCard label="Active placements" value={active} detail="Current room assignments" tone="teal" icon="users" /><MetricCard label="Available rooms" value={availableRooms} detail="Ready for a placement" tone="blue" icon="building" /><MetricCard label="Placement records" value={placements.length} detail="Within your scope" tone="gold" icon="clipboard" /></div>{canWrite && <PlacementForm clients={clients} properties={properties} />}<TableCard title="Placement register" count={`${placements.length} records`}>{placements.length ? <table className="crm-table"><thead><tr><th>Client ref</th><th>Resident</th><th>Property</th><th>Room</th><th>Start date</th><th>End date</th><th>Status</th></tr></thead><tbody>{placements.map((placement) => <tr key={placement.id}><td><strong>{placement.client.reference}</strong></td><td>{placement.client.displayName}</td><td>{placement.property.publicName}</td><td>{placement.property.rooms.find((room) => room.id === placement.roomId)?.label ?? placement.roomId}</td><td>{formatDate(placement.startDate)}</td><td>{formatDate(placement.endDate)}</td><td>{canWrite ? <PlacementStatusControl placementId={placement.id} status={placement.status} endDate={placement.endDate} /> : <StatusBadge status={placement.status} />}</td></tr>)}</tbody></table> : <EmptyState title="No placements recorded" message="Create a placement when a client moves into a room." />}</TableCard></div>;
}

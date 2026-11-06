import { notFound } from 'next/navigation';
import { getCrmProperty } from '@/lib/data';
import { CrmPageHeader, EmptyState, MetricCard, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { RoomCreateForm } from '@/components/RoomCreateForm';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

/**
 * One property, as it actually exists in the database.
 *
 * Rooms come from the Room table. When there are none the page says so; it never invents a room,
 * an occupancy state, a staffing model or a void-days figure. Metrics are counted from the rows
 * returned for this organisation, and a failed query renders the CRM error boundary rather than a
 * 404 or a fabricated profile.
 */
export default async function CrmPropertyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const property = await getCrmProperty(params.id);
  if (!property) notFound();

  const rooms = property.rooms;
  const available = rooms.filter((room) => room.status === 'AVAILABLE').length;
  const occupied = rooms.filter((room) => room.status === 'OCCUPIED').length;
  const roomsDetail = rooms.length ? `of ${rooms.length} recorded ${rooms.length === 1 ? 'room' : 'rooms'}` : 'No rooms recorded';

  return <div className="crm-page">
    <CrmPageHeader eyebrow="Property profile" title={property.publicName} intro={`${property.neighbourhood} · ${property.serviceType}`} action="Add room" actionHref="#room" />
    <RoomCreateForm propertyId={property.id} />
    {property.confidential && <RestrictedNote />}
    <div className="metric-grid">
      <MetricCard label="Capacity" value={property.capacity} detail="Recorded on the property" tone="teal" icon="building" />
      <MetricCard label="Rooms added" value={rooms.length} detail={rooms.length ? 'Real room records' : 'No rooms recorded'} tone="blue" icon="clipboard" />
      <MetricCard label="Available now" value={available} detail={roomsDetail} tone="gold" icon="chart" />
      <MetricCard label="Occupied now" value={occupied} detail={roomsDetail} tone="teal" icon="users" />
    </div>
    <div style={{ marginTop: 18 }}>
      <TableCard title="Rooms">
        {rooms.length ? <table className="crm-table">
          <thead><tr><th>Room</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>{rooms.map((room) => <tr key={room.id}>
            <td><strong>{room.label}</strong></td>
            <td><StatusBadge status={room.status} /></td>
            <td>{room.notes || '—'}</td>
          </tr>)}</tbody>
        </table> : <EmptyState
          title="No rooms yet"
          message="No rooms have been added to this property. Add the first room to record its status; occupancy and availability stay at zero until rooms exist."
          action={{ label: 'Add room', href: '#room' }}
        />}
      </TableCard>
    </div>
  </div>;
}

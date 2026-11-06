import Link from 'next/link';
import { getCrmProperties } from '@/lib/data';
import { getCrmSelectableServices } from '@/lib/service-catalogue';
import { CrmPageHeader, EmptyState, FilterBar, TableCard, StatusBadge } from '@/components/CrmUI';
import { ClickableRow } from '@/components/ClickableRow';
import { PropertyCreateForm } from '@/components/PropertyCreateForm';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';

/**
 * CRM property portfolio.
 *
 * Reads real, organisation-scoped Property rows only. The public marketing property loader is
 * deliberately not used here, because it may fall back to illustrative homes. An empty
 * property table renders a genuine empty state; a failed query renders the CRM error boundary.
 * Every number on this page is counted from the rows that were actually returned.
 */
export default async function CrmPropertiesPage() {
  const user = await requireUser();
  const [properties, services] = await Promise.all([getCrmProperties(), getCrmSelectableServices(user.organisationId)]);
  const rooms = properties.flatMap((property) => property.rooms);
  const countRooms = (status: string) => rooms.filter((room) => room.status === status).length;
  const occupancyBoard = [
    { label: 'Occupied', count: countRooms('OCCUPIED') },
    { label: 'Available', count: countRooms('AVAILABLE') },
    { label: 'Offered', count: countRooms('OFFERED') },
    { label: 'Void', count: countRooms('VOID') },
    { label: 'Maintenance', count: countRooms('MAINTENANCE') }
  ];

  return <div className="crm-page">
    <CrmPageHeader eyebrow="Housing operations" title="Properties & occupancy" intro="Rooms, availability, checks, and maintenance in one view." action="Add property" actionHref="#new" />
    <PropertyCreateForm services={services} />
    <FilterBar placeholder="Search property or neighbourhood">
      <select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Property status">
        <option value="ALL">All properties</option>
        <option value="AVAILABLE">Vacancies</option>
        <option value="FULL">Full</option>
        <option value="NO_ROOMS">No rooms recorded</option>
        <option value="RESTRICTED">Confidential</option>
      </select>
    </FilterBar>
    <TableCard title="Property portfolio" count={`${properties.length} ${properties.length === 1 ? 'home' : 'homes'}`}>
      {properties.length ? <table className="crm-table">
        <thead><tr><th>Property</th><th>Neighbourhood</th><th>Service</th><th>Capacity</th><th>Availability</th><th>Security</th></tr></thead>
        <tbody>{properties.map((property) => {
          const available = property.rooms.filter((room) => room.status === 'AVAILABLE').length;
          return <ClickableRow key={property.id} href={`/crm/properties/${property.id}`}>
            <td><Link href={`/crm/properties/${property.id}`}><strong>{property.publicName}</strong></Link></td>
            <td>{property.neighbourhood}</td>
            <td>{property.service?.title ?? property.serviceType}</td>
            <td>{property.capacity}</td>
            <td><StatusBadge status={available > 0 ? 'AVAILABLE' : property.rooms.length ? 'FULL' : 'NO_ROOMS'} /><span className="timeline-meta">{property.rooms.length ? `${available} of ${property.rooms.length} rooms` : '0 rooms recorded'}</span></td>
            <td>{property.confidential ? <StatusBadge status="RESTRICTED" tone="warning" /> : <StatusBadge status="PUBLIC" tone="success" />}</td>
          </ClickableRow>;
        })}</tbody>
      </table> : <EmptyState
        title="No properties yet"
        message="This organisation has no property records, so no homes are shown. Add the first property to start recording rooms, availability and occupancy."
        action={{ label: 'Add property', href: '#new' }}
      />}
    </TableCard>
    <div className="crm-panels" style={{ marginTop: 18 }}>
      <section className="crm-panel">
        <div className="panel-header"><h2>Occupancy board</h2><span className="muted" style={{ fontSize: 10 }}>{rooms.length} recorded rooms</span></div>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {occupancyBoard.map((column) => <div key={column.label} style={{ minHeight: 76, padding: 12, border: '1px solid #e0e9e9', background: '#f8fbfb' }}>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>{column.label}</span>
            <strong style={{ display: 'block', marginTop: 14, color: 'var(--navy-900)', fontSize: 22 }}>{column.count}</strong>
          </div>)}
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>{rooms.length ? 'Counts are taken from the room records in this portfolio.' : 'No rooms have been recorded, so every occupancy figure is zero.'}</p>
        </div>
      </section>
    </div>
  </div>;
}

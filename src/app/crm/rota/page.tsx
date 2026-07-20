import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getRotaShifts, getServices } from '@/lib/data';
import { CrmPageHeader, StatusBadge, TableCard } from '@/components/CrmUI';
import { ClickableRow } from '@/components/ClickableRow';
import { RotaShiftForm } from '@/components/RotaShiftForm';
import { formatDateTime } from '@/lib/format';

export default async function RotaPage() {
  const user = await getCurrentUser();
  const [shifts, services] = await Promise.all([getRotaShifts(), getServices()]);
  const [users, properties] = user ? await Promise.all([db.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => []), db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true, publicName: true }, orderBy: { publicName: 'asc' } }).catch(() => [])]) : [[], []];
  const canWrite = await hasPermission(user, 'rota.write');
  return <div className="crm-page"><CrmPageHeader eyebrow="Work management" title="Rota" intro="Weekly shifts, assignments, handover notes, and coverage." action={canWrite ? 'Create shift' : undefined} actionHref={canWrite ? '#new' : undefined} />{canWrite && <RotaShiftForm users={users} properties={properties} services={services.map((service) => ({ id: service.id, title: service.title }))} />}<TableCard title="Upcoming shifts" count={`${shifts.length} shifts`}><table className="crm-table"><thead><tr><th>Starts</th><th>Ends</th><th>Property / service</th><th>Shift type</th><th>Assigned to</th><th>Status</th></tr></thead><tbody>{shifts.length ? shifts.map((shift: any) => { const assigned = shift.assignments?.map((item: any) => item.user.name).join(', '); return <ClickableRow key={shift.id} href={`/crm/rota/${shift.id}`}><td><Link href={`/crm/rota/${shift.id}`}><strong>{formatDateTime(shift.startsAt)}</strong></Link></td><td>{formatDateTime(shift.endsAt)}</td><td>{shift.property?.publicName ?? 'Service shift'}</td><td>{shift.shiftType}</td><td>{assigned || 'Unfilled'}</td><td><StatusBadge status={assigned ? 'FILLED' : 'UNFILLED'} tone={assigned ? 'success' : 'warning'} /></td></ClickableRow>; }) : <tr><td colSpan={6}>No rota shifts recorded.</td></tr>}</tbody></table></TableCard><div className="crm-panels" style={{ marginTop: 18 }}><section className="crm-panel"><div className="panel-header"><h2>Coverage controls</h2></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Overlapping assignments are blocked by default. An authorised manager must provide a reason to override a conflict.</p></div></section><section className="crm-panel"><div className="panel-header"><h2>My rota</h2><StatusBadge status="LIVE" tone="success" /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Your assigned shifts appear in the upcoming shifts list.</p></div></section></div></div>;
}

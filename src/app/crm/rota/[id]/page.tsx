import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getServices } from '@/lib/data';
import { CrmPageHeader } from '@/components/CrmUI';
import { RotaShiftEditForm } from '@/components/RotaShiftEditForm';
import { formatDateTime } from '@/lib/format';

export default async function RotaShiftDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const shift = await db.rotaShift.findFirst({ where: { id: params.id, organisationId: user.organisationId }, include: { assignments: true, property: true } });
  if (!shift) notFound();
  const assignedUserId = shift.assignments[0]?.userId ?? null;
  const [users, properties, services] = await Promise.all([
    db.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => []),
    db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true, publicName: true }, orderBy: { publicName: 'asc' } }).catch(() => []),
    getServices()
  ]);
  return <div className="crm-page"><CrmPageHeader eyebrow="Rota" title={shift.shiftType} intro={`${formatDateTime(shift.startsAt)} — ${formatDateTime(shift.endsAt)}`} /><div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Shift details</h2></div><div className="panel-body"><RotaShiftEditForm shift={shift} assignedUserId={assignedUserId} users={users} properties={properties} services={services.map((service) => ({ id: service.id, title: service.title }))} /></div></section></div><div style={{ marginTop: 18 }}><Link href="/crm/rota" className="crm-button crm-button-secondary">← Back to rota</Link></div></div>;
}

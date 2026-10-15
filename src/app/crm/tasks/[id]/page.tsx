import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCrmUser } from '@/lib/crm-auth';
import { CrmPageHeader, StatusBadge } from '@/components/CrmUI';
import { TaskEditForm } from '@/components/TaskEditForm';

export default async function TaskDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireCrmUser();
  const task = await db.task.findFirst({ where: { id: params.id, organisationId: user.organisationId }, include: { assignedTo: { select: { id: true, name: true } } } });
  if (!task) notFound();
  const users = await db.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => []);
  return <div className="crm-page"><CrmPageHeader eyebrow="Tasks" title={task.title} intro={task.description ?? undefined} /><div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Task details</h2><StatusBadge status={task.status} /></div><div className="panel-body"><TaskEditForm task={task} users={users} /></div></section></div><div style={{ marginTop: 18 }}><Link href="/crm/tasks" className="crm-button crm-button-secondary">← Back to tasks</Link></div></div>;
}

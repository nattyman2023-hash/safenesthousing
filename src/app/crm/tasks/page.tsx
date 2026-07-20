import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getCrmTasks } from '@/lib/data';
import { CrmPageHeader, FilterBar, StatusBadge, TableCard } from '@/components/CrmUI';
import { ClickableRow } from '@/components/ClickableRow';
import { TaskForm } from '@/components/TaskForm';
import { TaskStatusControl } from '@/components/TaskStatusControl';
import { formatDate } from '@/lib/format';

export default async function TasksPage() {
  const user = await getCurrentUser();
  const tasks = await getCrmTasks();
  const users = user ? await db.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => []) : [];
  const canWrite = await hasPermission(user, 'tasks.write');
  return <div className="crm-page"><CrmPageHeader eyebrow="Work management" title="Tasks" intro="Personal, team, resident, property, and referral actions." action={canWrite ? 'New task' : undefined} actionHref={canWrite ? '#new' : undefined} />{canWrite && <TaskForm users={users} />}<FilterBar placeholder="Search tasks"><select className="crm-button crm-button-secondary" defaultValue="OPEN" aria-label="Task status"><option>Open</option><option>Overdue</option><option>Completed</option></select></FilterBar><TableCard title="Task list" count={`${tasks.length} tasks`}><table className="crm-table"><thead><tr><th>Task</th><th>Priority</th><th>Due</th><th>Assignee</th><th>Status</th></tr></thead><tbody>{tasks.length ? tasks.map((task: any) => <ClickableRow key={task.id} href={`/crm/tasks/${task.id}`}><td><Link href={`/crm/tasks/${task.id}`}><strong>{task.title}</strong></Link><br /><span className="muted">{task.description}</span></td><td><StatusBadge status={task.priority} tone={task.priority === 'HIGH' || task.priority === 'URGENT' ? 'danger' : 'warning'} /></td><td className={task.overdue ? 'text-danger' : ''}>{formatDate(task.dueAt)}{task.overdue && ' · overdue'}</td><td>{task.assignedTo?.name ?? 'Unassigned'}</td><td>{canWrite ? <TaskStatusControl taskId={task.id} status={task.status} /> : <StatusBadge status={task.status} />}</td></ClickableRow>) : <tr><td colSpan={5}>No tasks recorded.</td></tr>}</tbody></table></TableCard></div>;
}

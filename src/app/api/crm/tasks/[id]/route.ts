import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { taskUpdateSchema } from '@/lib/crm-validation';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('tasks.write');
    const parsed = taskUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the task details.' }, { status: 400 });
    const task = await db.task.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    if (parsed.data.assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: parsed.data.assignedToId, organisationId: user.organisationId, active: true } });
      if (!assignee) return NextResponse.json({ error: 'Choose an active staff assignee.' }, { status: 400 });
    }
    let dueAt: Date | null | undefined;
    if (parsed.data.dueAt !== undefined) {
      dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: 'Enter a valid due date.' }, { status: 400 });
    }
    const data = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(parsed.data.assignedToId !== undefined ? { assignedToId: parsed.data.assignedToId || null } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {})
    };
    const updated = await db.task.update({ where: { id: task.id }, data });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'TASK_UPDATED', resourceType: 'Task', resourceId: task.id, before: { title: task.title, priority: task.priority, dueAt: task.dueAt, assignedToId: task.assignedToId, status: task.status }, after: { title: updated.title, priority: updated.priority, dueAt: updated.dueAt, assignedToId: updated.assignedToId, status: updated.status } });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the task.' : message }, { status });
  }
}

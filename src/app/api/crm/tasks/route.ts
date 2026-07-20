import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { taskCreateSchema } from '@/lib/crm-validation';

export async function POST(request: Request) {
  try {
    const user = await requirePermission('tasks.write');
    const parsed = taskCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the task details.' }, { status: 400 });
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined;
    if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: 'Enter a valid due date.' }, { status: 400 });
    if (parsed.data.assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: parsed.data.assignedToId, organisationId: user.organisationId, active: true } });
      if (!assignee) return NextResponse.json({ error: 'Choose an active staff assignee.' }, { status: 400 });
    }
    const task = await db.task.create({ data: { organisationId: user.organisationId, title: parsed.data.title, description: parsed.data.description, priority: parsed.data.priority, dueAt, assignedToId: parsed.data.assignedToId || undefined } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'TASK_CREATED', resourceType: 'Task', resourceId: task.id, after: { priority: task.priority, dueAt: task.dueAt, assignedToId: task.assignedToId } });
    return NextResponse.json({ id: task.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the task.' : message }, { status });
  }
}

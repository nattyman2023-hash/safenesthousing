import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { serviceContentSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('content.write');
    const parsed = serviceContentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the service content.' }, { status: 400 });
    const service = await db.service.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
    const updated = await db.service.update({ where: { id: service.id }, data: parsed.data });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SERVICE_CONTENT_UPDATED', resourceType: 'Service', resourceId: service.id, before: { published: service.published }, after: { published: updated.published, fields: Object.keys(parsed.data) } });
    return NextResponse.json({ id: updated.id, published: updated.published });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save service content.' : message }, { status });
  }
}

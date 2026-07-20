import { db } from './db';

export async function audit(input: { organisationId: string; actorId?: string; action: string; resourceType: string; resourceId?: string; before?: unknown; after?: unknown; success?: boolean; ipAddress?: string }) {
  return db.auditLog.create({ data: {
    organisationId: input.organisationId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    beforeJson: input.before ? JSON.stringify(input.before) : undefined,
    afterJson: input.after ? JSON.stringify(input.after) : undefined,
    success: input.success ?? true,
    ipAddress: input.ipAddress
  } });
}

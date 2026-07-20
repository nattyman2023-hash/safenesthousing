import type { PrismaClient } from '@prisma/client';

/**
 * Structural RBAC scaffolding — safe to run in production, unlike the rest of prisma/seed.ts
 * which also inserts fictional demo content. Shared by prisma/seed.ts and scripts/bootstrap-admin.ts
 * so the two never drift apart.
 */
export const permissionKeys = ['dashboard.read', 'referrals.read', 'referrals.write', 'clients.read', 'clients.write', 'properties.read', 'properties.write', 'placements.read', 'placements.write', 'incidents.read', 'incidents.write', 'incidents.close', 'documents.read', 'documents.write', 'tasks.read', 'tasks.write', 'rota.read', 'rota.write', 'rota.override', 'finance.read', 'finance.write', 'content.write', 'reports.export', 'users.manage', 'audit.read', 'governance.manage'] as const;

export const roleDefinitions = [
  ['super-administrator', 'Super administrator', permissionKeys],
  ['organisation-administrator', 'Organisation administrator', permissionKeys.filter((key) => key !== 'incidents.close')],
  ['service-manager', 'Service manager', permissionKeys.filter((key) => !key.startsWith('users.') && !key.startsWith('finance.'))],
  ['safeguarding-lead', 'Safeguarding lead', ['dashboard.read', 'incidents.read', 'incidents.write', 'incidents.close', 'clients.read', 'documents.read', 'audit.read', 'reports.export', 'governance.manage']],
  ['support-lead', 'Support lead', ['dashboard.read', 'referrals.read', 'referrals.write', 'clients.read', 'clients.write', 'properties.read', 'placements.read', 'placements.write', 'incidents.read', 'documents.read', 'documents.write', 'tasks.read', 'tasks.write', 'rota.read', 'rota.write', 'reports.export']],
  ['support-worker', 'Support worker', ['dashboard.read', 'referrals.read', 'clients.read', 'clients.write', 'properties.read', 'placements.read', 'documents.read', 'tasks.read', 'rota.read']],
  ['property-officer', 'Property or housing officer', ['dashboard.read', 'properties.read', 'properties.write', 'placements.read', 'placements.write', 'tasks.read', 'tasks.write', 'rota.read', 'reports.export', 'documents.read', 'documents.write']],
  ['finance-officer', 'Finance officer', ['dashboard.read', 'finance.read', 'finance.write', 'reports.export', 'documents.read', 'documents.write']],
  ['content-editor', 'Content editor', ['dashboard.read', 'content.write']],
  ['auditor', 'Auditor or read-only user', ['dashboard.read', 'referrals.read', 'clients.read', 'properties.read', 'placements.read', 'documents.read', 'tasks.read', 'rota.read', 'reports.export', 'audit.read']]
] as const;

export async function ensureRbac(prisma: PrismaClient, organisationId: string) {
  const permissions = new Map<string, string>();
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: `Permission to ${key.replace('.', ' ')}` } });
    permissions.set(key, permission.id);
  }
  const roles = new Map<string, string>();
  for (const [slug, name, keys] of roleDefinitions) {
    const role = await prisma.role.upsert({ where: { organisationId_slug: { organisationId, slug } }, update: { name }, create: { organisationId, name, slug } });
    roles.set(slug, role.id);
    for (const key of keys) {
      const permissionId = permissions.get(key);
      if (permissionId) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId } }, update: {}, create: { roleId: role.id, permissionId } });
    }
  }
  return { permissions, roles };
}

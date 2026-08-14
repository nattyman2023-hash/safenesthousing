import type { PrismaClient } from '@prisma/client';

/**
 * Compatibility role labels for existing databases and seed/bootstrap records.
 * These labels and the legacy permission tables are not used to authorize runtime requests.
 */
export const roleDefinitions = [
  ['super-administrator', 'Super administrator'],
  ['organisation-administrator', 'Organisation administrator'],
  ['service-manager', 'Service manager'],
  ['safeguarding-lead', 'Safeguarding lead'],
  ['support-lead', 'Support lead'],
  ['support-worker', 'Support worker'],
  ['property-officer', 'Property or housing officer'],
  ['finance-officer', 'Finance officer'],
  ['content-editor', 'Content editor'],
  ['auditor', 'Auditor or read-only user']
] as const;

export async function ensureRoleLabels(prisma: PrismaClient, organisationId: string) {
  const roles = new Map<string, string>();
  for (const [slug, name] of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { organisationId_slug: { organisationId, slug } },
      update: { name },
      create: { organisationId, name, slug }
    });
    roles.set(slug, role.id);
  }
  return roles;
}

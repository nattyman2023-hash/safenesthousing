import { db } from './db';
import type { getCurrentUser } from './auth';

export type SearchResult = { id: string; type: string; title: string; subtitle: string; href: string; restricted?: boolean };
type CrmUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function searchCrmRecords(user: CrmUser, query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const groups = await Promise.all([
    db.client.findMany({ where: { organisationId: user.organisationId, OR: [{ reference: { contains: q } }, { displayName: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Client', title: row.displayName, subtitle: `${row.reference} · ${row.service?.title ?? 'Unassigned'}`, href: `/crm/clients/${row.id}`, restricted: row.restricted }))),
    db.referral.findMany({ where: { organisationId: user.organisationId, OR: [{ reference: { contains: q } }, { personName: { contains: q } }, { referrerOrganisation: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Referral', title: row.reference, subtitle: `${row.personName} · ${row.service.title}`, href: `/crm/referrals/${row.id}` }))),
    db.incident.findMany({ where: { organisationId: user.organisationId, OR: [{ reference: { contains: q } }, { category: { contains: q } }, { status: { contains: q } }] }, include: { client: { select: { displayName: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Incident', title: row.reference, subtitle: `${row.category} · ${row.status}${row.client?.displayName ? ` · ${row.client.displayName}` : ''}`, href: `/crm/incidents/${row.id}`, restricted: row.restricted }))),
    db.property.findMany({ where: { organisationId: user.organisationId, OR: [{ publicName: { contains: q } }, { neighbourhood: { contains: q } }, { serviceType: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Property', title: row.publicName, subtitle: `${row.neighbourhood} · ${row.service?.title ?? row.serviceType}`, href: `/crm/properties/${row.id}`, restricted: row.confidential }))),
    Promise.all([
      db.invoice.findMany({ where: { organisationId: user.organisationId, reference: { contains: q } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Invoice', title: row.reference, subtitle: `Invoice · ${row.status}`, href: `/crm/billing?invoice=${row.id}` }))),
      db.housingBenefitClaim.findMany({ where: { client: { organisationId: user.organisationId }, OR: [{ client: { reference: { contains: q } } }, { client: { displayName: { contains: q } } }, { status: { contains: q } }] }, include: { client: { select: { id: true, reference: true, displayName: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Housing Benefit', title: row.client.reference, subtitle: `${row.client.displayName} · ${row.status}`, href: `/crm/billing?client=${row.client.id}` })))
    ]).then((rows) => rows.flat())
  ]);
  return groups.flat().slice(0, 60);
}

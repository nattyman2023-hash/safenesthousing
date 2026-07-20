import { db } from './db';
import { canViewRestricted, getScopedIds, hasPermission } from './auth';
import type { getCurrentUser } from './auth';

export type SearchResult = { id: string; type: string; title: string; subtitle: string; href: string; restricted?: boolean };
type CrmUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function searchCrmRecords(user: CrmUser, query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const serviceIds = getScopedIds(user, 'serviceIds');
  const propertyIds = getScopedIds(user, 'propertyIds');
  const restricted = canViewRestricted(user);
  const [clientsRead, referralsRead, incidentsRead, propertiesRead, financeRead] = await Promise.all([
    hasPermission(user, 'clients.read'), hasPermission(user, 'referrals.read'), hasPermission(user, 'incidents.read'), hasPermission(user, 'properties.read'), hasPermission(user, 'finance.read')
  ]);
  const groups = await Promise.all([
    clientsRead ? db.client.findMany({ where: { organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}), ...(!restricted ? { restricted: false } : {}), OR: [{ reference: { contains: q } }, { displayName: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Client', title: row.displayName, subtitle: `${row.reference} · ${row.service?.title ?? 'Unassigned'}`, href: `/crm/clients/${row.id}`, restricted: row.restricted }))) : Promise.resolve([]),
    referralsRead ? db.referral.findMany({ where: { organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}), OR: [{ reference: { contains: q } }, { personName: { contains: q } }, { referrerOrganisation: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Referral', title: row.reference, subtitle: `${row.personName} · ${row.service.title}`, href: `/crm/referrals/${row.id}` }))) : Promise.resolve([]),
    incidentsRead ? db.incident.findMany({ where: { organisationId: user.organisationId, ...(!restricted ? { restricted: false } : {}), ...(serviceIds.length ? { client: { serviceId: { in: serviceIds } } } : {}), OR: [{ reference: { contains: q } }, { category: { contains: q } }, { status: { contains: q } }] }, include: { client: { select: { displayName: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Incident', title: row.reference, subtitle: `${row.category} · ${row.status}${row.client?.displayName ? ` · ${row.client.displayName}` : ''}`, href: `/crm/incidents/${row.id}`, restricted: row.restricted }))) : Promise.resolve([]),
    propertiesRead ? db.property.findMany({ where: { organisationId: user.organisationId, ...(propertyIds.length ? { id: { in: propertyIds } } : {}), OR: [{ publicName: { contains: q } }, { neighbourhood: { contains: q } }, { serviceType: { contains: q } }] }, include: { service: { select: { title: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Property', title: row.publicName, subtitle: `${row.neighbourhood} · ${row.service?.title ?? row.serviceType}`, href: `/crm/properties/${row.id}`, restricted: row.confidential }))) : Promise.resolve([]),
    financeRead ? Promise.all([
      db.invoice.findMany({ where: { organisationId: user.organisationId, reference: { contains: q } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Invoice', title: row.reference, subtitle: `Invoice · ${row.status}`, href: `/crm/billing?invoice=${row.id}` }))),
      db.housingBenefitClaim.findMany({ where: { client: { organisationId: user.organisationId }, OR: [{ client: { reference: { contains: q } } }, { client: { displayName: { contains: q } } }, { status: { contains: q } }] }, include: { client: { select: { id: true, reference: true, displayName: true } } }, take: 20 }).then((rows) => rows.map((row) => ({ id: row.id, type: 'Housing Benefit', title: row.client.reference, subtitle: `${row.client.displayName} · ${row.status}`, href: `/crm/billing?client=${row.client.id}` })))
    ]).then((rows) => rows.flat()) : Promise.resolve([])
  ]);
  return groups.flat().slice(0, 60);
}

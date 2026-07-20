import { db } from './db';
import { canViewRestricted, getScopedIds } from './auth';
import type { getCurrentUser } from './auth';

export type ReportKey = 'occupancy' | 'referrals' | 'housing-benefit-exceptions' | 'incident-actions';
export type ReportRow = Record<string, string | number | boolean | null>;

export const reportDefinitions: Record<ReportKey, { title: string; description: string; permission: string }> = {
  occupancy: { title: 'Occupancy by property', description: 'Room capacity, occupancy, and availability by property.', permission: 'properties.read' },
  referrals: { title: 'Referral pipeline', description: 'Referral source, service, status, and next action dates.', permission: 'referrals.read' },
  'housing-benefit-exceptions': { title: 'Housing Benefit exceptions', description: 'Claim and payment statuses requiring finance action.', permission: 'finance.read' },
  'incident-actions': { title: 'Incident actions', description: 'Open and completed actions from the incident register.', permission: 'incidents.read' }
};

export const reportHeaders: Record<ReportKey, string[]> = {
  occupancy: ['Property', 'Neighbourhood', 'Capacity', 'Occupied rooms', 'Available rooms'],
  referrals: ['Reference', 'Person', 'Service', 'Status', 'Received', 'Follow-up date'],
  'housing-benefit-exceptions': ['Client reference', 'Client', 'Claim status', 'Payment status', 'Weekly rent (minor)', 'Service charge (minor)'],
  'incident-actions': ['Incident reference', 'Category', 'Severity', 'Incident status', 'Action', 'Owner', 'Due date', 'Completed']
};

type CrmUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

function dateValue(value: Date | null): string | null { return value?.toISOString().slice(0, 10) ?? null; }

export async function getReportRows(user: CrmUser, report: ReportKey): Promise<ReportRow[]> {
  const serviceIds = getScopedIds(user, 'serviceIds');
  const propertyIds = getScopedIds(user, 'propertyIds');
  if (report === 'occupancy') {
    const properties = await db.property.findMany({ where: { organisationId: user.organisationId, ...(propertyIds.length ? { id: { in: propertyIds } } : {}) }, include: { rooms: { select: { status: true } } }, orderBy: { publicName: 'asc' } });
    return properties.map((property) => ({ Property: property.publicName, Neighbourhood: property.neighbourhood, Capacity: property.capacity, 'Occupied rooms': property.rooms.filter((room) => room.status === 'OCCUPIED').length, 'Available rooms': property.rooms.filter((room) => room.status === 'AVAILABLE').length }));
  }
  if (report === 'referrals') {
    const referrals = await db.referral.findMany({ where: { organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}) }, include: { service: { select: { title: true } } }, orderBy: { createdAt: 'desc' } });
    return referrals.map((referral) => ({ Reference: referral.reference, Person: referral.personName, Service: referral.service.title, Status: referral.status, Received: dateValue(referral.createdAt), 'Follow-up date': dateValue(referral.followUpDate) }));
  }
  if (report === 'housing-benefit-exceptions') {
    const claims = await db.housingBenefitClaim.findMany({ where: { client: { organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}) }, OR: [{ status: { in: ['EVIDENCE_REQUIRED', 'SUSPENDED', 'REJECTED'] } }, { paymentStatus: { in: ['PAUSED', 'FAILED'] } }] }, include: { client: { select: { reference: true, displayName: true } } }, orderBy: { id: 'desc' } });
    return claims.map((claim) => ({ 'Client reference': claim.client.reference, Client: claim.client.displayName, 'Claim status': claim.status, 'Payment status': claim.paymentStatus, 'Weekly rent (minor)': claim.weeklyRentMinor, 'Service charge (minor)': claim.serviceChargeMinor }));
  }
  const incidents = await db.incident.findMany({ where: { organisationId: user.organisationId, ...(serviceIds.length ? { client: { serviceId: { in: serviceIds } } } : {}), ...(!canViewRestricted(user) ? { restricted: false } : {}) }, include: { actions: { orderBy: { dueDate: 'asc' } } }, orderBy: { incidentAt: 'desc' } });
  return incidents.flatMap((incident) => (incident.actions.length ? incident.actions : [null]).map((action) => ({ 'Incident reference': incident.reference, Category: incident.category, Severity: incident.severity, 'Incident status': incident.status, Action: action?.action ?? null, Owner: action?.owner ?? null, 'Due date': dateValue(action?.dueDate ?? null), Completed: action?.completedAt ? 'Yes' : 'No' })));
}

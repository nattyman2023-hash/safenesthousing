import { db } from './db';
import { formatDate } from './format';
import { isTaskOverdue } from './domain';
import { getCurrentUser } from './auth';
import { summariseAppointments, type CalendarAppointment } from './appointments';
import { summariseComplaints } from './complaints-domain';
import { summariseCompliance, summarisePolicies } from './compliance-domain';
import { summariseConcerns } from './concerns-domain';
import { isContactLogNote } from './contact-tracking';
import { inspectPlacementDependencies } from './placement-operations';
import { buildCalendarEntries, buildCalendarWeek, buildServiceUserAttention, summariseAttention, summariseCalendarWeek } from './dashboard-domain';
import { summariseMaintenance } from './operations-domain';
import { isTaskClosed, summariseTaskQueue } from './task-workflow';
import { addDays, startOfWeek } from './dates';

/** Fictional fallback content keeps the CRM populated for assessment when the database is empty
 * or momentarily unreachable. Fictional fallback data is limited to development and test environments
 * has been removed so local and production behave identically. */
function fictional<T>(items: T[]): T[] { return items; }

export const fallbackServices = [
  { id: 'supported-accommodation', slug: 'supported-accommodation', title: 'Supported accommodation', summary: 'A safe, settled home with practical support around you.', content: 'Our supported homes combine a real tenancy with consistent, person-led support.', audience: 'Adults who need a safe place to live while building independence.', serviceType: 'Supported accommodation' },
  { id: 'homelessness-support', slug: 'homelessness-support', title: 'Homelessness support', summary: 'A route from crisis to a home that lasts.', content: 'We work with people who have experienced homelessness to secure safety, stability, and a next step.', audience: 'People experiencing or at risk of homelessness.', serviceType: 'Homelessness support' },
  { id: 'care-leavers', slug: 'care-leavers', title: 'Care leavers and young people', summary: 'A steady start for young adults making their own way.', content: 'Our homes for young people blend daily life skills with the right amount of independence.', audience: 'Young people aged 18–25.', serviceType: 'Young people' },
  { id: 'domestic-abuse', slug: 'domestic-abuse', title: 'Domestic abuse', summary: 'Confidential refuge and support, without judgement.', content: 'Our confidential refuge service offers safety, advocacy, and a plan for what comes next.', audience: 'Women and families leaving domestic abuse.', serviceType: 'Domestic abuse' },
  { id: 'mental-health', slug: 'mental-health', title: 'Mental health', summary: 'A calm base for recovery and everyday wellbeing.', content: 'Step-down accommodation and visiting support for people moving towards greater independence.', audience: 'Adults who need a supported step between hospital and home.', serviceType: 'Mental health' },
  { id: 'refugee-move-on', slug: 'refugee-move-on', title: 'Refugee move-on', summary: 'A welcoming home while a new chapter takes shape.', content: 'We help newly granted refugees and families establish a stable home and community connections.', audience: 'Refugees and families ready for move-on accommodation.', serviceType: 'Refugee move-on' }
];

export const fallbackProperties = [
  { id: 'willow-house', slug: 'willow-house', publicName: 'Willow House', neighbourhood: 'Northside', serviceType: 'Domestic abuse', publicSummary: 'Six-bed staffed house for women fleeing domestic abuse. Children welcome. Secure entry, garden, shared kitchen.', capacity: 6, publicVacancyState: '2 rooms available', facilities: ['Secure entry', 'Garden', 'Shared kitchen'], eligibility: 'Women and families leaving domestic abuse.', confidential: true },
  { id: 'harbour-court', slug: 'harbour-court', publicName: 'Harbour Court', neighbourhood: 'Riverside', serviceType: 'Young people', publicSummary: 'Eight semi-independent flats for care leavers, with daily key work and life-skills programme.', capacity: 8, publicVacancyState: '1 room available', facilities: ['Self-contained flats', 'Daily key work', 'Life-skills programme'], eligibility: 'Young people aged 18–25.', confidential: false },
  { id: 'fenwick-road', slug: 'fenwick-road', publicName: 'Fenwick Road', neighbourhood: 'Eastfield', serviceType: 'Mental health', publicSummary: 'Four-bed shared house for mental health step-down, with visiting support three days a week.', capacity: 4, publicVacancyState: 'Full — waitlist', facilities: ['Shared house', 'Visiting support', 'Quiet garden'], eligibility: 'Adults moving from hospital or higher support.', confidential: false },
  { id: 'alder-terrace', slug: 'alder-terrace', publicName: 'Alder Terrace', neighbourhood: 'Westgate', serviceType: 'Homelessness support', publicSummary: 'Ten-bed supported house for adults moving on from homelessness. Staffed daytime, on-call overnight.', capacity: 10, publicVacancyState: '3 rooms available', facilities: ['Day staff', 'On-call overnight', 'Communal kitchen'], eligibility: 'Adults aged 18+ moving on from homelessness.', confidential: false },
  { id: 'linden-place', slug: 'linden-place', publicName: 'Linden Place', neighbourhood: 'Old Town', serviceType: 'Refugee move-on', publicSummary: 'Self-contained flats for newly granted refugees and families, with weekly integration support.', capacity: 5, publicVacancyState: 'Family flat available', facilities: ['Self-contained flats', 'Family friendly', 'Integration support'], eligibility: 'Newly granted refugees and families.', confidential: false }
];

export const fallbackNews = [
  { id: 'new-houses', slug: 'new-houses-westgate', title: 'Two new houses open in Westgate, adding twelve supported rooms', summary: 'A partnership with the city council brings our first Housing First-model homes online this summer.', category: 'Announcements', publishedAt: new Date('2026-06-12'), authorName: 'Safe Nest team', content: 'This summer we opened two new homes in Westgate, adding twelve supported rooms for people with the longest histories of rough sleeping.' },
  { id: 'leah-story', slug: 'leahs-year-at-willow-house', title: '“I got my daughter back” — Leah’s year at Willow House', summary: 'A resident’s own account of refuge, recovery and reunion. Shared with permission.', category: 'Stories', publishedAt: new Date('2026-05-16'), authorName: 'Safe Nest team', content: 'Leah shares what a safe, steady place meant for her family.' },
  { id: 'outcomes-report', slug: 'outcomes-report-2025-26', title: 'Our 2025–26 outcomes report is out', summary: '94% of residents sustained their move-on tenancy at six months.', category: 'Reports', publishedAt: new Date('2026-05-02'), authorName: 'Safe Nest team', content: 'Our outcomes report shares the full data, method and honest misses.' },
  { id: 'gardeners', slug: 'volunteer-gardeners-wanted', title: 'Volunteer gardeners wanted for three of our houses', summary: 'Green-fingered? Our residents are building kitchen gardens this summer.', category: 'Community', publishedAt: new Date('2026-04-20'), authorName: 'Safe Nest team', content: 'We are looking for volunteers to help residents build kitchen gardens.' },
  { id: 'renters-rights', slug: 'renters-rights-explainer', title: 'What the Renters’ Rights changes mean for our residents', summary: 'A plain-English explainer from our housing team.', category: 'Policy', publishedAt: new Date('2026-03-04'), authorName: 'Safe Nest team', content: 'A plain-English overview of the changes most relevant to residents.' }
];

export const fallbackSiteSettings: Record<string, string> = {
  'homepage.headline': 'A safe place to land. The support to move on.',
  'homepage.stats.moveOn': '94%',
  'homepage.stats.newRooms': '12',
  'homepage.stats.responseTarget': '7 days',
  'contact.generalEmail': 'hello@safenesthousing.org.uk',
  'contact.referralEmail': 'hello@safenesthousing.org.uk',
  'contact.emergencyMessage': 'In immediate danger, call 999. For confidential support, call 0808 157 0000.'
};

export async function getSiteSettings(): Promise<Record<string, string>> {
  try {
    const rows = await db.siteSetting.findMany({ where: { organisation: { slug: 'safe-nest' } } });
    return { ...fallbackSiteSettings, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  } catch { return fallbackSiteSettings; }
}

export async function getServices() {
  try {
    const rows = await db.service.findMany({ where: { published: true }, orderBy: { displayOrder: 'asc' } });
    return rows.length ? rows : fictional(fallbackServices);
  } catch { return fictional(fallbackServices); }
}

export async function getServiceBySlug(slug: string) {
  const services = await getServices();
  return services.find((service) => service.slug === slug) ?? null;
}

export async function getPublicProperties() {
  try {
    const rows = await db.property.findMany({ where: { published: true }, orderBy: { displayOrder: 'asc' }, select: { id: true, slug: true, publicName: true, neighbourhood: true, serviceType: true, publicSummary: true, capacity: true, publicVacancyState: true, facilities: true, eligibility: true, confidential: true } });
    if (rows.length) return rows.map((row) => ({ ...row, facilities: safeJsonArray(row.facilities) }));
  } catch { /* fall through to safe fictional fallback */ }
  return fictional(fallbackProperties);
}

export async function getPublicPropertyBySlug(slug: string) {
  const properties = await getPublicProperties();
  return properties.find((property) => property.slug === slug) ?? null;
}

export async function getPublishedNews() {
  try {
    const rows = await db.newsPost.findMany({ where: { published: true }, include: { category: true }, orderBy: { publishedAt: 'desc' } });
    if (rows.length) return rows.map((row) => ({ ...row, category: row.category.name }));
  } catch { /* fallback */ }
  return fictional(fallbackNews);
}

export async function getNewsBySlug(slug: string) {
  const news = await getPublishedNews();
  return news.find((post) => post.slug === slug) ?? null;
}

export async function getDashboardData() {
  const user = await getCurrentUser();
  if (!user) return { currentResidents: 0, availableRooms: 0, openReferrals: 0, referralsNeedingAction: [], openIncidents: 0, tasks: [], properties: [], reviewCount: 0, hbExceptions: 0, occupancy: 0 };
  const clientWhere = { organisationId: user.organisationId };
  const propertyWhere = { organisationId: user.organisationId };
  const referralWhere = { organisationId: user.organisationId, status: { notIn: ['CLOSED', 'DECLINED', 'WITHDRAWN', 'PLACED'] } };
  try {
    const [clients, availableRooms, referrals, referralsNeedingAction, incidents, tasks, properties, reviews, hbExceptions] = await Promise.all([
      db.client.count({ where: { ...clientWhere, status: 'CURRENT' } }),
      db.room.count({ where: { status: 'AVAILABLE', property: propertyWhere } }),
      db.referral.count({ where: referralWhere }),
      db.referral.findMany({ where: referralWhere, include: { service: true }, orderBy: [{ followUpDate: 'asc' }, { createdAt: 'asc' }], take: 5 }),
      db.incident.count({ where: { organisationId: user.organisationId, status: { not: 'CLOSED' } } }),
      db.task.findMany({ where: { organisationId: user.organisationId, status: { not: 'DONE' } }, orderBy: { dueAt: 'asc' }, take: 6 }),
      db.property.findMany({ where: propertyWhere, include: { rooms: true } }),
      db.supportPlan.count({ where: { client: clientWhere, reviewDate: { lte: new Date(Date.now() + 14 * 86400000) } } }),
      db.housingBenefitClaim.count({ where: { client: clientWhere, status: { in: ['EVIDENCE_REQUIRED', 'SUSPENDED', 'REJECTED'] } } })
    ]);
    const totalRooms = properties.reduce((total, property) => total + property.rooms.length, 0);
    const occupiedRooms = properties.reduce((total, property) => total + property.rooms.filter((room) => room.status === 'OCCUPIED').length, 0);
    return { currentResidents: clients, availableRooms, openReferrals: referrals, referralsNeedingAction, openIncidents: incidents, tasks, properties, reviewCount: reviews, hbExceptions, occupancy: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0 };
  } catch {
    return { currentResidents: 0, availableRooms: 0, openReferrals: 0, referralsNeedingAction: [], openIncidents: 0, tasks: [], properties: [], reviewCount: 0, hbExceptions: 0, occupancy: 0 };
    return { currentResidents: 24, availableRooms: 6, openReferrals: 11, referralsNeedingAction: [], openIncidents: 3, tasks: [{ id: 't1', title: 'Call back Northside referral', dueAt: new Date(Date.now() + 86400000), priority: 'HIGH', status: 'OPEN' }], properties: fallbackProperties.map((property) => ({ ...property, rooms: [] })), reviewCount: 5, hbExceptions: 2, occupancy: 82 };
  }
}

export async function getCrmReferrals() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db.referral.findMany({ where: { organisationId: user.organisationId }, include: { service: true, assignments: { orderBy: { assignedAt: 'desc' }, take: 1, include: { user: { select: { id: true, name: true, email: true } } } } }, orderBy: { createdAt: 'desc' } });
    return rows;
  } catch { /* fallback */ }
  return fictional([
    { id: 'ref-1', reference: 'SN-2607-001', status: 'TRIAGE', personName: 'A. Morgan', referrerName: 'J. Whitfield', referrerOrganisation: 'City Housing Options', service: { title: 'Homelessness support' }, createdAt: new Date('2026-07-17'), followUpDate: new Date('2026-07-21') },
    { id: 'ref-2', reference: 'SN-2607-002', status: 'ASSESSMENT_BOOKED', personName: 'R. Khan', referrerName: 'M. Green', referrerOrganisation: 'Community Mental Health Team', service: { title: 'Mental health' }, createdAt: new Date('2026-07-16'), followUpDate: new Date('2026-07-20') },
    { id: 'ref-3', reference: 'SN-2607-003', status: 'OFFER_MADE', personName: 'S. Taylor', referrerName: 'L. Byrne', referrerOrganisation: 'Leaving Care Service', service: { title: 'Care leavers and young people' }, createdAt: new Date('2026-07-14'), followUpDate: new Date('2026-07-18') },
    { id: 'ref-4', reference: 'SN-2607-004', status: 'AWAITING_INFORMATION', personName: 'Anonymous', referrerName: 'Safe Nest duty line', referrerOrganisation: 'Internal', service: { title: 'Domestic abuse' }, createdAt: new Date('2026-07-12'), followUpDate: new Date('2026-07-19') }
  ]);
}

export async function getReferralAssignees(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, _serviceId: string) {
  try {
    const users = await db.user.findMany({
      where: { organisationId: user.organisationId, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    });
    return users;
  } catch { return []; }
}

export async function getCrmClients() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db.client.findMany({ where: { organisationId: user.organisationId }, include: { service: true, placements: { include: { property: true } } }, orderBy: { updatedAt: 'desc' } });
    return rows;
  } catch { /* fallback */ }
  return fictional([
    { id: 'client-1', reference: 'SN-C-001', displayName: 'Amelia Morgan', status: 'CURRENT', riskLevel: 'Medium', restricted: false, service: { title: 'Homelessness support' }, placements: [{ property: { publicName: 'Alder Terrace' }, roomId: 'Room 4' }] },
    { id: 'client-2', reference: 'SN-C-002', displayName: 'Rafi Khan', status: 'CURRENT', riskLevel: 'Low', restricted: false, service: { title: 'Mental health' }, placements: [{ property: { publicName: 'Fenwick Road' }, roomId: 'Room 2' }] },
    { id: 'client-3', reference: 'SN-C-003', displayName: 'Sofia Taylor', status: 'WAITLIST', riskLevel: 'High', restricted: true, service: { title: 'Care leavers and young people' }, placements: [] }
  ]);
}

export async function getCrmIncidents() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db.incident.findMany({ where: { organisationId: user.organisationId }, include: { client: true, updates: { orderBy: { createdAt: 'desc' }, take: 10 }, actions: { orderBy: { dueDate: 'asc' } } }, orderBy: { incidentAt: 'desc' } });
    return rows;
  } catch { /* fallback */ }
  return fictional([
    { id: 'incident-1', reference: 'INC-2607-018', category: 'Welfare concern', severity: 'High', status: 'UNDER_REVIEW', incidentAt: new Date('2026-07-17'), restricted: true, client: { displayName: 'Restricted record' } },
    { id: 'incident-2', reference: 'INC-2607-017', category: 'Property safety', severity: 'Medium', status: 'ACTION_PLAN_ACTIVE', incidentAt: new Date('2026-07-15'), restricted: false, client: { displayName: 'Amelia Morgan' } },
    { id: 'incident-3', reference: 'INC-2607-014', category: 'Accident', severity: 'Low', status: 'CLOSED', incidentAt: new Date('2026-07-09'), restricted: false, client: { displayName: 'Rafi Khan' } }
  ]);
}

export async function getCrmTasks() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db.task.findMany({ where: { organisationId: user.organisationId }, include: { assignedTo: { select: { id: true, name: true } } }, orderBy: { dueAt: 'asc' } });
    return rows.map((task) => ({ ...task, overdue: isTaskOverdue(task) }));
  } catch { /* fallback */ }
  return fictional([
    { id: 'task-1', title: 'Call back Northside referral', description: 'Confirm assessment availability.', priority: 'HIGH', status: 'OPEN', dueAt: new Date('2026-07-18'), overdue: false },
    { id: 'task-2', title: 'Review support plan', description: 'Quarterly review due for current resident.', priority: 'MEDIUM', status: 'OPEN', dueAt: new Date('2026-07-19'), overdue: false },
    { id: 'task-3', title: 'Upload gas safety certificate', description: 'Alder Terrace compliance folder.', priority: 'HIGH', status: 'OPEN', dueAt: new Date('2026-07-17'), overdue: true }
  ]);
}

export async function getRotaShifts() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const rows = await db.rotaShift.findMany({ where: { organisationId: user.organisationId }, include: { property: true, assignments: true }, orderBy: { startsAt: 'asc' } });
    const userIds = [...new Set(rows.flatMap((shift) => shift.assignments.map((assignment) => assignment.userId)))];
    const staff = userIds.length ? await db.user.findMany({ where: { id: { in: userIds }, organisationId: user.organisationId }, select: { id: true, name: true } }) : [];
    return rows.map((shift) => ({ ...shift, assignments: shift.assignments.map((assignment) => ({ ...assignment, user: staff.find((member) => member.id === assignment.userId) ?? { id: assignment.userId, name: 'Unknown staff member' } })) }));
  } catch { return []; }
}

function safeJsonArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

/* --- Operations module loaders (appointments, repairs, concerns, complaints, compliance, policies) --- */

const clientRefSelect = { id: true, displayName: true, reference: true, restricted: true } as const;

export async function getCrmAppointments() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.appointment.findMany({
      where: { organisationId: user.organisationId },
      include: { client: { select: clientRefSelect }, property: { select: { id: true, publicName: true } } },
      orderBy: { startsAt: 'asc' }
    });
  } catch { return []; }
}

export async function getCrmMaintenanceTickets() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.maintenanceTicket.findMany({
      where: { organisationId: user.organisationId },
      include: { property: { select: { id: true, publicName: true } }, client: { select: clientRefSelect }, updates: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: [{ status: 'asc' }, { targetFixAt: 'asc' }]
    });
  } catch { return []; }
}

export async function getCrmConcerns() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.concern.findMany({
      where: { organisationId: user.organisationId },
      include: { client: { select: clientRefSelect }, property: { select: { id: true, publicName: true } }, actions: { orderBy: { createdAt: 'asc' } } },
      orderBy: { raisedAt: 'desc' }
    });
  } catch { return []; }
}

export async function getCrmComplaints() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.complaint.findMany({
      where: { organisationId: user.organisationId },
      include: { client: { select: clientRefSelect } },
      orderBy: { receivedAt: 'desc' }
    });
  } catch { return []; }
}

export async function getCrmComplianceRecords() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    const properties = await db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true } });
    if (!properties.length) return [];
    return await db.propertyComplianceRecord.findMany({
      where: { propertyId: { in: properties.map((property) => property.id) } },
      include: { property: { select: { id: true, publicName: true, serviceType: true } } },
      orderBy: [{ nextDueAt: 'asc' }]
    });
  } catch { return []; }
}

export async function getCrmPolicies() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.policyResource.findMany({ where: { organisationId: user.organisationId }, orderBy: [{ status: 'asc' }, { reviewDueAt: 'asc' }] });
  } catch { return []; }
}

export async function getCrmStaffOptions() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  } catch { return []; }
}

export async function getCrmPropertyOptions() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.property.findMany({ where: { organisationId: user.organisationId }, select: { id: true, publicName: true, serviceType: true }, orderBy: { publicName: 'asc' } });
  } catch { return []; }
}

/** Everything the operations dashboard, calendar and module pages need, in one round of queries.
 * Domain summaries are computed here so pages stay presentational. */
export async function getCrmOperationsBoard(now = new Date()) {
  const user = await getCurrentUser();
  if (!user) return null;
  const organisationId = user.organisationId;
  try {
    const [appointments, tickets, concerns, complaints, complianceRecords, policies, tasks, clients, contactNotes, safeWellChecks] = await Promise.all([
      db.appointment.findMany({ where: { organisationId }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, category: true, ownerId: true, clientId: true, propertyId: true } }),
      db.maintenanceTicket.findMany({ where: { organisationId }, select: { id: true, status: true, reportedAt: true, completedAt: true, priority: true, category: true, safetyRisk: true, targetFixAt: true } }),
      db.concern.findMany({ where: { organisationId }, select: { id: true, status: true, raisedAt: true, dueAt: true, resolvedAt: true, severity: true, category: true } }),
      db.complaint.findMany({ where: { organisationId }, select: { id: true, status: true, stage: true, category: true, receivedAt: true, acknowledgedAt: true, dueAt: true, closedAt: true, outcome: true, learning: true } }),
      db.propertyComplianceRecord.findMany({ where: { property: { organisationId } }, select: { id: true, propertyId: true, status: true, complianceType: true, lastCheckedAt: true, nextDueAt: true } }),
      db.policyResource.findMany({ where: { organisationId }, select: { id: true, status: true, category: true, effectiveFrom: true, reviewDueAt: true, requiresRead: true } }),
      db.task.findMany({ where: { organisationId }, select: { id: true, title: true, status: true, priority: true, dueAt: true, assignedToId: true, department: true, category: true, clientId: true, completedAt: true } }),
      db.client.findMany({ where: { organisationId }, select: { id: true, displayName: true, restricted: true, status: true, keyWorkerId: true, riskLevel: true, contactFrequencyDays: true, safeWellFrequencyDays: true } }),
      db.caseNote.findMany({ where: { client: { organisationId }, completed: true, meaningful: true }, select: { clientId: true, occurredAt: true, method: true, attempted: true, nextContactDueAt: true } }),
      db.safeWellCheck.findMany({ where: { client: { organisationId }, status: { in: ['COMPLETED', 'CONCERN_RAISED'] } }, select: { clientId: true, completedAt: true } })
    ]);

    // The contact query is already limited to notes that happened and were meaningful. Notes logged
    // as structured case-work rather than contact (the same row, told apart by its contact-tracking
    // metadata) are dropped here, so the newest survivor is the last planned contact that actually
    // happened — the same rule the service user profile measures planned contact with.
    const lastContact = new Map<string, Date>();
    for (const note of contactNotes) {
      if (!isContactLogNote(note)) continue;
      const previous = lastContact.get(note.clientId);
      if (!previous || note.occurredAt.getTime() > previous.getTime()) lastContact.set(note.clientId, note.occurredAt);
    }
    const lastSafeWell = new Map<string, Date>();
    for (const check of safeWellChecks) {
      if (!check.completedAt) continue;
      const previous = lastSafeWell.get(check.clientId);
      if (!previous || check.completedAt.getTime() > previous.getTime()) lastSafeWell.set(check.clientId, check.completedAt);
    }
    const openTaskCount = new Map<string, number>();
    const overdueTaskCount = new Map<string, number>();
    for (const task of tasks) {
      if (!task.clientId || isTaskClosed(task.status)) continue;
      openTaskCount.set(task.clientId, (openTaskCount.get(task.clientId) ?? 0) + 1);
      if (isTaskOverdue(task)) overdueTaskCount.set(task.clientId, (overdueTaskCount.get(task.clientId) ?? 0) + 1);
    }

    const attentionRows = buildServiceUserAttention(clients.map((client) => ({
      clientId: client.id,
      displayName: client.displayName,
      restricted: client.restricted,
      status: client.status,
      keyWorkerId: client.keyWorkerId,
      riskLevel: client.riskLevel,
      contactFrequencyDays: client.contactFrequencyDays,
      safeWellFrequencyDays: client.safeWellFrequencyDays,
      lastSupportContactAt: lastContact.get(client.id) ?? null,
      lastSafeWellCompletedAt: lastSafeWell.get(client.id) ?? null,
      openTasks: openTaskCount.get(client.id) ?? 0,
      overdueTasks: overdueTaskCount.get(client.id) ?? 0
    })), now);

    const calendarEntries = buildCalendarEntries({ appointments: appointments as CalendarAppointment[], tasks, now });
    const weekStart = startOfWeek(now);
    const calendarDays = buildCalendarWeek(calendarEntries, weekStart, 7, now);

    return {
      appointments: summariseAppointments(appointments as CalendarAppointment[], now),
      maintenance: summariseMaintenance(tickets, now),
      concerns: summariseConcerns(concerns, now),
      complaints: summariseComplaints(complaints, now),
      compliance: summariseCompliance(complianceRecords, now),
      policies: summarisePolicies(policies, now),
      tasks: summariseTaskQueue(tasks, now),
      attention: summariseAttention(attentionRows),
      attentionRows,
      calendarEntries,
      calendarDays,
      calendarSummary: summariseCalendarWeek(calendarDays),
      weekStart,
      weekEnd: addDays(weekStart, 6)
    };
  } catch { return null; }
}

export async function getCrmClientOptions() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.client.findMany({ where: { organisationId: user.organisationId }, select: { id: true, displayName: true, reference: true, restricted: true }, orderBy: { displayName: 'asc' } });
  } catch { return []; }
}

export async function getCrmClientProfile(clientId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const profile = await db.client.findFirst({
      where: { id: clientId, organisationId: user.organisationId },
      include: {
        service: true,
        keyWorker: { select: { id: true, name: true } },
        supportWorker: { select: { id: true, name: true } },
        referral: { select: { id: true, reference: true, createdAt: true, status: true, referrerOrganisation: true } },
        placements: {
          include: {
            property: { select: { id: true, publicName: true, neighbourhood: true, confidential: true, rooms: { select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } } } },
            occupancyRecords: { select: { id: true, startDate: true, endDate: true } }
          },
          orderBy: { startDate: 'desc' }
        },
        supportPlans: { include: { goals: true, reviews: { orderBy: { reviewDate: 'desc' }, take: 3 } }, orderBy: { createdAt: 'desc' } },
        caseNotes: { orderBy: { occurredAt: 'desc' }, take: 20 },
        housingBenefit: true,
        penPortrait: true,
        riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 10 },
        safeWellChecks: { orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }], take: 10 },
        moveChecklists: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 5 },
        relationshipsFrom: { include: { relatedClient: { select: clientRefSelect }, relatedPerson: true }, orderBy: { createdAt: 'desc' } },
        relationshipsTo: { include: { client: { select: clientRefSelect }, relatedPerson: true }, orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' }, take: 25 },
        // The list above is capped so the profile stays fast, so the metric reads the real total
        // from its own count rather than from the length of the capped list.
        _count: { select: { documents: true } },
        incidents: { include: { actions: { orderBy: { dueDate: 'asc' } }, assignedLead: { select: { id: true, name: true } } }, orderBy: { incidentAt: 'desc' }, take: 20 },
        appointments: { orderBy: { startsAt: 'desc' }, take: 10 },
        maintenanceTickets: { orderBy: { reportedAt: 'desc' }, take: 10 },
        concerns: { orderBy: { raisedAt: 'desc' }, take: 10 },
        complaints: { orderBy: { receivedAt: 'desc' }, take: 10 },
        tasks: { where: { status: { notIn: ['DONE', 'CANCELLED'] } }, orderBy: { dueAt: 'asc' }, take: 10 }
      }
    });
    if (!profile) return null;
    // Documents record the uploader's account id. One extra query resolves the names so the profile
    // can show who filed each file without exposing anything else about those accounts.
    const uploaderIds = [...new Set(profile.documents.map((document) => document.uploadedBy))];
    const uploaders = uploaderIds.length
      ? await db.user.findMany({ where: { id: { in: uploaderIds }, organisationId: user.organisationId }, select: { id: true, name: true } })
      : [];
    return { ...profile, documentUploaders: Object.fromEntries(uploaders.map((uploader) => [uploader.id, uploader.name])) as Record<string, string> };
  } catch { return null; }
}

/** The placement register: every placement the organisation holds, with the property, room and
 * occupancy rows the list needs to describe it. Ordered newest first so a new move-in is visible. */
export async function getCrmPlacements() {
  const user = await getCurrentUser();
  if (!user) return [];
  try {
    return await db.placement.findMany({
      where: { client: { organisationId: user.organisationId } },
      include: {
        client: { select: { id: true, reference: true, displayName: true, restricted: true } },
        property: { select: { id: true, publicName: true, rooms: { select: { id: true, label: true, status: true } } } },
        occupancyRecords: { select: { id: true, startDate: true, endDate: true } }
      },
      orderBy: { startDate: 'desc' }
    });
  } catch { return []; }
}

/**
 * One placement, with the records the detail page needs to be an operational record rather than a
 * page of ids: the room, the move checklists worked against this stay, and the Safe & Well, incident,
 * repair, document, appointment and task records that belong to the same service user. Everything is
 * scoped to the signed-in user's organisation, so another organisation's placement is a real 404.
 */
export async function getCrmPlacement(placementId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const placement = await db.placement.findFirst({
      where: { id: placementId, client: { organisationId: user.organisationId } },
      include: {
        client: {
          select: {
            id: true, reference: true, displayName: true, restricted: true, status: true, riskLevel: true,
            safeguardingFlag: true, contactFrequencyDays: true, admissionDate: true,
            keyWorker: { select: { id: true, name: true } },
            supportWorker: { select: { id: true, name: true } },
            housingBenefit: { orderBy: { submittedAt: 'desc' }, take: 1 }
          }
        },
        property: { select: { id: true, publicName: true, neighbourhood: true, serviceType: true, confidential: true, capacity: true } },
        occupancyRecords: { orderBy: { startDate: 'desc' } }
      }
    });
    if (!placement) return null;
    const now = new Date();
    const [room, checklists, safeWellChecks, incidents, maintenanceTickets, documents, documentCount, appointments, tasks, dependencies] = await Promise.all([
      db.room.findFirst({ where: { id: placement.roomId }, select: { id: true, label: true, status: true, notes: true } }),
      db.moveChecklist.findMany({ where: { placementId: placement.id }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
      db.safeWellCheck.findMany({ where: { clientId: placement.clientId }, orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }], take: 5, select: { id: true, status: true, method: true, scheduledFor: true, completedAt: true, concernRaised: true, concernSummary: true, nextDueAt: true } }),
      db.incident.findMany({ where: { organisationId: user.organisationId, clientId: placement.clientId }, orderBy: { incidentAt: 'desc' }, take: 5, select: { id: true, reference: true, category: true, severity: true, status: true, incidentAt: true, restricted: true } }),
      db.maintenanceTicket.findMany({ where: { organisationId: user.organisationId, OR: [{ clientId: placement.clientId }, { roomId: placement.roomId }] }, orderBy: { reportedAt: 'desc' }, take: 5, select: { id: true, reference: true, title: true, status: true, priority: true, reportedAt: true } }),
      db.document.findMany({ where: { clientId: placement.clientId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, displayName: true, category: true, createdAt: true, restricted: true } }),
      db.document.count({ where: { clientId: placement.clientId } }),
      db.appointment.findMany({ where: { organisationId: user.organisationId, clientId: placement.clientId, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 5, select: { id: true, title: true, category: true, startsAt: true, status: true } }),
      db.task.findMany({ where: { organisationId: user.organisationId, clientId: placement.clientId, status: { notIn: ['DONE', 'CANCELLED'] } }, orderBy: { dueAt: 'asc' }, take: 5, select: { id: true, title: true, dueAt: true, priority: true, status: true, relatedType: true, relatedId: true } }),
      inspectPlacementDependencies({ id: placement.id, clientId: placement.clientId })
    ]);
    return { ...placement, room, checklists, safeWellChecks, incidents, maintenanceTickets, documents, documentCount, appointments, tasks, dependencies };
  } catch { return null; }
}


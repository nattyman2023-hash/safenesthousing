import { z } from 'zod';
import { APPOINTMENT_CATEGORIES, APPOINTMENT_STATUSES } from './appointments';
import { COMPLAINT_CATEGORIES, COMPLAINT_OUTCOMES, COMPLAINT_RAISED_BY, COMPLAINT_STAGES, COMPLAINT_STATUSES } from './complaints-domain';
import { COMPLIANCE_STATUSES, POLICY_CATEGORIES, POLICY_STATUSES, PROPERTY_COMPLIANCE_TYPES } from './compliance-domain';
import { CONCERN_CATEGORIES, CONCERN_SEVERITIES, CONCERN_STATUSES } from './concerns-domain';
import { CONTACT_DIRECTIONS, CONTACT_METHODS } from './contact-tracking';
import { MOVE_CHECKLIST_TYPES, MOVE_ITEM_STATUSES } from './move-checklist';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES, MAINTENANCE_TRADES } from './operations-domain';
import { RISK_ASSESSMENT_STATUSES, RISK_ASSESSMENT_TYPES, RISK_LEVELS } from './risk-domain';
import { SAFE_WELL_METHODS, SAFE_WELL_STATUSES } from './safe-well';
import { SERVICE_SLUG_MAX_LENGTH, SERVICE_SLUG_PATTERN } from './service-slug';

export const internalReferralSchema = z.object({
  personName: z.string().trim().min(2).max(160),
  serviceId: z.string().trim().min(1),
  referrerName: z.string().trim().min(2).max(120),
  referrerOrganisation: z.string().trim().max(160).optional(),
  referrerEmail: z.string().trim().email().max(160),
  risk: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  currentLocation: z.string().trim().min(2).max(500),
  housingSituation: z.string().trim().min(10).max(4000),
  supportNeeds: z.string().trim().min(10).max(4000),
  knownRisks: z.string().trim().max(4000).optional()
});

const flagValue = z.preprocess((value) => value === true || value === 'on' || value === 'true', z.boolean());
const numberFromForm = (max: number) => z.preprocess((value) => (value === '' || value === undefined || value === null ? undefined : value), z.coerce.number().int().min(0).max(max).optional());

/** A finalised case note. The contact-tracking fields (see lib/contact-tracking.ts) are optional so
 * the plain "add case note" form keeps working, while a logged contact can be recorded in full. */
export const caseNoteSchema = z.object({
  contactType: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80),
  note: z.string().trim().min(10).max(8000),
  outcome: z.string().trim().max(2000).optional(),
  followUpAction: z.string().trim().max(2000).optional(),
  followUpDate: z.string().trim().optional(),
  occurredAt: z.string().trim().optional(),
  method: z.enum(CONTACT_METHODS).optional(),
  direction: z.preprocess((value) => (value === '' ? undefined : value), z.enum(CONTACT_DIRECTIONS).optional()),
  durationMinutes: numberFromForm(1440),
  completed: flagValue.optional(),
  attempted: flagValue.optional(),
  meaningful: flagValue.optional(),
  restricted: flagValue.default(false)
});

export const incidentReviewSchema = z.object({
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  status: z.enum(['DRAFT', 'OPEN', 'UNDER_REVIEW', 'EXTERNAL_REFERRAL_MADE', 'ACTION_PLAN_ACTIVE', 'MONITORING', 'CLOSED']),
  closureDecision: z.string().trim().max(4000).optional(),
  reviewDate: z.string().trim().optional()
});

export const supportGoalSchema = z.object({
  category: z.string().trim().min(2).max(80),
  desiredOutcome: z.string().trim().min(5).max(500),
  actionSteps: z.string().trim().min(5).max(2000),
  owner: z.string().trim().max(120).optional(),
  targetDate: z.string().trim().optional()
});

export const supportReviewSchema = z.object({
  supportPlanId: z.string().trim().min(1),
  reviewDate: z.string().trim().min(1),
  notes: z.string().trim().min(10).max(4000)
});

export const incidentUpdateSchema = z.object({ update: z.string().trim().min(10).max(4000) });
export const incidentActionSchema = z.object({ action: z.string().trim().min(3).max(500), owner: z.string().trim().max(120).optional(), dueDate: z.string().trim().optional() });
export const incidentActionUpdateSchema = z.object({ completed: z.boolean() });

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueAt: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
  clientId: z.string().trim().optional()
});

export const taskStatusSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']) });
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueAt: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional()
});
export const rotaShiftSchema = z.object({
  propertyId: z.string().trim().optional(),
  serviceId: z.string().trim().optional(),
  shiftType: z.string().trim().min(2).max(100),
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().min(1),
  assignedUserId: z.string().trim().optional(),
  handover: z.string().trim().max(2000).optional(),
  overrideReason: z.string().trim().max(1000).optional()
});

const optionalDateValue = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().optional());
const minorUnit = z.coerce.number().int().min(0).max(100_000_000);

export const housingBenefitUpdateSchema = z.object({
  status: z.enum(['NOT_STARTED', 'PENDING', 'EVIDENCE_REQUIRED', 'SUBMITTED', 'IN_PAYMENT', 'SUSPENDED', 'REJECTED', 'CLOSED']),
  paymentStatus: z.enum(['PENDING', 'IN_PAYMENT', 'PAUSED', 'FAILED', 'CLOSED']),
  submittedAt: optionalDateValue,
  evidenceRequired: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(2000).optional()),
  weeklyRentMinor: minorUnit,
  serviceChargeMinor: minorUnit
});

export const invoiceCreateSchema = z.object({
  reference: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers, and hyphens for the invoice reference.'),
  dueAt: optionalDateValue,
  items: z.array(z.object({
    description: z.string().trim().min(2).max(200),
    quantity: z.coerce.number().int().min(1).max(10_000),
    unitMinor: minorUnit
  })).min(1).max(30)
});

export const invoiceStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID', 'OVERDUE'])
});

export const paymentSchema = z.object({
  amountMinor: z.coerce.number().int().min(1).max(100_000_000),
  paidAt: z.string().trim().min(1),
  method: z.enum(['BANK_TRANSFER', 'DIRECT_DEBIT', 'CASH', 'CARD', 'OTHER'])
});

export const placementCreateSchema = z.object({
  clientId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  tenancyRef: z.string().trim().max(160).optional()
});

export const placementStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'MOVED_OUT', 'CANCELLED']),
  endDate: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().optional())
});

/** Optional fields so one endpoint can take a status change, an ordinary edit, or both.
 * `endDate` keeps the empty string distinct from "not sent": an empty value clears the date on an
 * active placement, while omitting it leaves the stored date alone. */
export const placementUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'MOVED_OUT', 'CANCELLED']).optional(),
  endDate: z.string().trim().max(40).optional(),
  endedReason: z.string().trim().max(240).optional(),
  startDate: z.string().trim().max(40).optional(),
  tenancyRef: z.string().trim().max(160).optional(),
  propertyId: z.string().trim().min(1).max(120).optional(),
  roomId: z.string().trim().min(1).max(120).optional()
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: 'Send the placement field you want to change.' });

/** Removing an incorrect placement: a confirmation plus a reason is required, and the reason is
 * written to the audit log, so a duplicate is always traceable to the person who corrected it. */
export const placementRemovalSchema = z.object({
  reason: z.string().trim().min(5, 'Record why this placement is being removed.').max(240),
  confirmed: flagValue.refine((value) => value === true, { message: 'Confirm the removal before it is applied.' })
});

export const userInviteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  jobTitle: z.string().trim().max(120).optional(),
  roleSlug: z.string().trim().min(2).max(80)
});

export const referralAssignmentSchema = z.object({ assignedToId: z.string().trim().min(1).max(100) });

export const userAccessUpdateSchema = z.object({
  active: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()),
  roleSlug: z.string().trim().min(2).max(80)
});

export const siteSettingsUpdateSchema = z.object({
  settings: z.array(z.object({
    key: z.enum(['homepage.headline', 'homepage.stats.moveOn', 'homepage.stats.newRooms', 'homepage.stats.responseTarget', 'contact.generalEmail', 'contact.referralEmail', 'contact.emergencyMessage']),
    value: z.string().trim().max(4000)
  })).min(1).max(20)
});

export const emailitApiKeySchema = z.object({ apiKey: z.string().trim().min(1, 'Enter an Emailit API key.').max(512, 'The Emailit API key is too long.') });

const publishValue = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean());

/** The Service columns a content form owns. Held as one object so the create and update schemas can
 * never drift from the edit form they both serve. In prisma/schema.prisma every one of these except
 * `published` is NOT NULL, which is why the create schema requires all of them. */
const serviceContentFields = {
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(10).max(500),
  content: z.string().trim().min(10).max(8000),
  audience: z.string().trim().min(5).max(1000),
  referralRoutes: z.string().trim().min(5).max(2000),
  eligibility: z.string().trim().min(5).max(2000),
  supportModel: z.string().trim().min(5).max(2000),
  published: publishValue
};

export const serviceContentSchema = z.object(serviceContentFields);

/**
 * A slug may be left blank, in which case the endpoint derives one from the service name
 * (`serviceSlugFromTitle`). Supplying one is a deliberate correction, so it is normalised to lower
 * case and held to the URL-safe pattern. Uniqueness is checked against the database rather than here:
 * `@@unique([organisationId, slug])` is a two-column constraint no schema rule can see on its own.
 */
const serviceSlugInput = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().toLowerCase().min(2, 'Add a slug, or leave the field blank to generate one from the service name.').max(SERVICE_SLUG_MAX_LENGTH).regex(SERVICE_SLUG_PATTERN, 'Use lower-case letters, numbers and single hyphens.').optional()
);

const serviceDisplayOrder = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(10000).optional()
);

/** Creating a service: every NOT NULL Service column, plus the optional slug and ordering. */
export const serviceCreateSchema = z.object({
  ...serviceContentFields,
  slug: serviceSlugInput,
  displayOrder: serviceDisplayOrder
});

/**
 * Updating a service. Partial, and deliberately so: the publish toggle sends `{ published: false }`
 * alone and a slug correction sends `{ slug }` alone. An absent field means "unchanged" — publication
 * is never inferred from a missing key, which would silently unpublish a live service on every edit.
 */
export const serviceUpdateSchema = serviceCreateSchema.partial();

export const newsContentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(500),
  content: z.string().trim().min(10).max(12000),
  authorName: z.string().trim().min(2).max(160),
  published: publishValue
});

export const passwordResetRequestSchema = z.object({ email: z.string().trim().email().max(160) });
export const passwordResetSchema = z.object({ token: z.string().min(32).max(128), password: z.string().min(12).max(200) });

export const retentionResourceTypes = ['ContactSubmission', 'Referral', 'Client', 'CaseNote', 'Incident', 'Document', 'AuditLog'] as const;
export const dataSubjectRequestTypes = ['ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'OBJECTION', 'PORTABILITY', 'OTHER'] as const;
export const dataSubjectRequestStatuses = ['OPEN', 'IN_REVIEW', 'ACTION_REQUIRED', 'ON_HOLD', 'COMPLETED', 'DECLINED'] as const;

const safeDateInput = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.').optional());
const legalBasisNote = z.string().trim().min(5, 'Add the approved legal basis or policy reference.').max(2000);
const safeSubjectRef = z.string().trim().min(2).max(160).refine((value) => !/[\r\n]/.test(value), 'Use an approved reference without line breaks.');
/**
 * What an HTML form actually sends for a checkbox.
 *
 * A ticked box arrives as its value (`on`, or `true` where a form sets one) and an unticked box
 * arrives as `false` or an empty string from the hidden input that pairs with it. Both spellings of
 * "no" must be accepted: refusing them would turn an unticked box into a rejected save, and silently
 * defaulting them would turn it into a save that ignored what the member of staff chose.
 */
const booleanInput = z.preprocess((value) => {
  if (value === true || value === 'true' || value === 'on') return true;
  if (value === false || value === 'false' || value === '') return false;
  return value;
}, z.boolean());

export const retentionRuleCreateSchema = z.object({
  resourceType: z.enum(retentionResourceTypes),
  retentionDays: z.coerce.number().int().min(1, 'Retention must be at least one day.').max(36500, 'Retention cannot exceed 100 years.'),
  legalBasisNote,
  active: booleanInput.default(true)
});

export const retentionRuleUpdateSchema = z.object({
  retentionDays: z.coerce.number().int().min(1, 'Retention must be at least one day.').max(36500, 'Retention cannot exceed 100 years.'),
  legalBasisNote,
  active: booleanInput
});

export const dataSubjectRequestCreateSchema = z.object({
  requestType: z.enum(dataSubjectRequestTypes),
  subjectRef: safeSubjectRef,
  dueAt: safeDateInput,
  notes: z.string().trim().max(4000).optional(),
  legalHold: booleanInput.default(false)
});

export const dataSubjectRequestUpdateSchema = z.object({
  status: z.enum(dataSubjectRequestStatuses),
  dueAt: safeDateInput,
  notes: z.string().trim().max(4000).optional(),
  legalHold: booleanInput
}).superRefine((value, context) => {
  if (['COMPLETED', 'DECLINED'].includes(value.status) && (!value.notes || value.notes.length < 10)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['notes'], message: 'Add a resolution note of at least 10 characters before closing the request.' });
  }
});

export const incidentCreateSchema = z.object({
  clientId: z.string().trim().optional(),
  category: z.string().trim().min(2).max(120),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  incidentAt: z.string().trim().min(1, 'Enter the date and time of the incident.'),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().min(10).max(8000),
  immediateAction: z.string().trim().max(4000).optional(),
  restricted: booleanInput.default(true)
});

export const propertyCreateSchema = z.object({
  publicName: z.string().trim().min(2).max(160),
  serviceId: z.string().trim().optional(),
  neighbourhood: z.string().trim().min(2).max(120),
  serviceType: z.string().trim().min(2).max(120),
  publicSummary: z.string().trim().min(10).max(1000),
  eligibility: z.string().trim().min(5).max(2000),
  capacity: z.coerce.number().int().min(1).max(1000),
  publicVacancyState: z.string().trim().min(2).max(120),
  accessibility: z.string().trim().max(500).optional(),
  confidential: booleanInput.default(false)
});

export const roomCreateSchema = z.object({
  propertyId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'OFFERED', 'VOID', 'MAINTENANCE']).default('AVAILABLE'),
  notes: z.string().trim().max(1000).optional()
});

export const clientCreateSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  serviceId: z.string().trim().optional(),
  referralId: z.string().trim().optional(),
  keyWorkerId: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().optional()),
  dateOfBirth: safeDateInput,
  phone: z.string().trim().max(80).optional(),
  email: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().email().max(160).optional()),
  address: z.string().trim().max(1000).optional(),
  gender: z.string().trim().max(80).optional(),
  pronouns: z.string().trim().max(80).optional(),
  admissionDate: safeDateInput,
  riskLevel: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  communicationNeeds: z.string().trim().max(1000).optional(),
  importantAlerts: z.string().trim().max(2000).optional(),
  safeguardingFlag: booleanInput.default(false),
  restricted: booleanInput.default(false),
  status: z.enum(['CURRENT', 'WAITLIST', 'MOVED_ON', 'ARCHIVED']).default('WAITLIST')
});

export const clientUpdateSchema = clientCreateSchema.partial();

const optionalText = (max: number) => z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(max).optional());

export const clientRelationshipSchema = z.object({
  relatedClientId: optionalText(100),
  relationshipType: z.string().trim().min(2).max(80),
  inverseRelationshipType: optionalText(80),
  startDate: safeDateInput,
  endDate: safeDateInput,
  notes: optionalText(3000),
  isEmergencyContact: booleanInput.default(false),
  isNextOfKin: booleanInput.default(false),
  fullName: optionalText(160),
  phone: optionalText(80),
  email: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().email().max(160).optional()),
  address: optionalText(1000),
  relatedPersonNotes: optionalText(3000),
  preferredContactMethod: optionalText(80),
  consentToContact: booleanInput.default(false)
});

export const clientRelationshipUpdateSchema = clientRelationshipSchema.partial();
/* ------------------------------------------------------------------------- *
 * Support operations modules.
 *
 * Every enum below is imported from the domain module that owns it, so the CRM
 * can never accept a value that a domain transition guard would reject later.
 * Optional free text accepts an empty string from a browser form and stores
 * `undefined` instead, which keeps "not answered" distinct from "answered with
 * nothing" in the database.
 * ------------------------------------------------------------------------- */

const optionalString = (max: number) => z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().max(max).optional());
const optionalRef = optionalString(60);

export const appointmentCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the appointment a title.').max(200),
  category: z.enum(APPOINTMENT_CATEGORIES),
  startsAt: z.string().trim().min(1, 'Choose when the appointment starts.'),
  endsAt: optionalString(40),
  location: optionalString(200),
  clientId: optionalRef,
  propertyId: optionalRef,
  ticketId: optionalRef,
  ownerId: optionalRef,
  attendees: optionalString(500),
  notes: optionalString(2000),
  allDay: flagValue.default(false)
});

export const appointmentUpdateSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  outcome: optionalString(2000),
  notes: optionalString(2000),
  startsAt: optionalString(40),
  location: optionalString(200)
});

export const maintenanceTicketCreateSchema = z.object({
  title: z.string().trim().min(3, 'Describe the repair in a few words.').max(200),
  description: optionalString(2000),
  category: z.enum(MAINTENANCE_CATEGORIES),
  trade: z.enum(MAINTENANCE_TRADES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  safetyRisk: flagValue.default(false),
  clientId: optionalRef,
  propertyId: optionalRef,
  roomId: optionalRef,
  assignedToId: optionalRef,
  contractor: optionalString(160),
  targetFixAt: optionalString(40),
  costMinor: numberFromForm(100_000_000)
});

export const maintenanceTicketUpdateSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES),
  note: z.string().trim().min(3, 'Add a short progress note.').max(2000),
  contractor: optionalString(160),
  targetFixAt: optionalString(40),
  costMinor: numberFromForm(100_000_000)
});

export const concernCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the concern a title.').max(200),
  summary: z.string().trim().min(10, 'Describe what has been noticed and by whom.').max(4000),
  category: z.enum(CONCERN_CATEGORIES),
  severity: z.enum(CONCERN_SEVERITIES),
  clientId: optionalRef,
  propertyId: optionalRef,
  ownerId: optionalRef,
  dueAt: optionalString(40),
  referralNeeded: flagValue.default(false)
});

export const concernUpdateSchema = z.object({
  status: z.enum(CONCERN_STATUSES),
  resolution: optionalString(4000),
  referralNeeded: flagValue.optional(),
  action: optionalString(2000),
  dueAt: optionalString(40),
  ownerId: optionalRef
});

export const complaintCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the complaint a title.').max(200),
  summary: z.string().trim().min(10, 'Record what was said in the complainant\'s own terms.').max(4000),
  category: z.enum(COMPLAINT_CATEGORIES),
  severity: z.enum(CONCERN_SEVERITIES),
  stage: z.enum(COMPLAINT_STAGES),
  raisedBy: z.enum(COMPLAINT_RAISED_BY),
  complainantName: optionalString(160),
  clientId: optionalRef,
  ownerId: optionalRef,
  receivedAt: optionalString(40),
  dueAt: optionalString(40)
});

export const complaintUpdateSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  stage: z.enum(COMPLAINT_STAGES),
  severity: z.enum(CONCERN_SEVERITIES),
  outcome: z.preprocess((value) => (value === '' ? undefined : value), z.enum(COMPLAINT_OUTCOMES).optional()),
  learning: optionalString(4000),
  resolution: optionalString(4000),
  dueAt: optionalString(40),
  ownerId: optionalRef
});

export const complianceRecordSchema = z.object({
  propertyId: z.string().trim().min(1, 'Choose the property this obligation belongs to.'),
  complianceType: z.enum(PROPERTY_COMPLIANCE_TYPES),
  status: z.enum(COMPLIANCE_STATUSES),
  lastCheckedAt: optionalString(40),
  nextDueAt: optionalString(40),
  certificateRef: optionalString(160),
  contractor: optionalString(160),
  outcome: optionalString(2000),
  notes: optionalString(2000)
});

export const complianceRecordUpdateSchema = complianceRecordSchema.partial().extend({
  propertyId: z.string().trim().min(1, 'Choose the property this obligation belongs to.')
});

export const policyResourceCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the policy a title.').max(200),
  category: z.enum(POLICY_CATEGORIES),
  summary: optionalString(2000),
  version: optionalString(40),
  externalUrl: optionalString(500),
  status: z.enum(POLICY_STATUSES),
  ownerId: optionalRef,
  effectiveFrom: optionalString(40),
  reviewDueAt: optionalString(40),
  requiresRead: flagValue.default(false)
});

export const policyResourceUpdateSchema = z.object({
  status: z.enum(POLICY_STATUSES),
  summary: optionalString(2000),
  version: optionalString(40),
  reviewDueAt: optionalString(40),
  requiresRead: flagValue.optional()
});

/* --- Service user profile records ---------------------------------------- */

const penPortraitFieldShape = {
  aboutMe: optionalString(4000),
  myNeeds: optionalString(4000),
  howIShow: optionalString(4000),
  whatMatters: optionalString(4000),
  myStrengths: optionalString(4000),
  communication: optionalString(4000),
  likes: optionalString(4000),
  dislikes: optionalString(4000),
  healthNeeds: optionalString(4000),
  risksToMe: optionalString(4000),
  whoSupportsMe: optionalString(4000)
};

export const penPortraitSchema = z.object(penPortraitFieldShape);

export const riskAssessmentCreateSchema = z.object({
  assessmentType: z.enum(RISK_ASSESSMENT_TYPES),
  level: z.enum(RISK_LEVELS),
  status: z.enum(RISK_ASSESSMENT_STATUSES),
  reviewDueAt: optionalString(40),
  summary: z.string().trim().min(10, 'Summarise what the assessment found.').max(4000),
  controlMeasures: optionalString(4000),
  triggerReason: optionalString(2000)
});

export const riskAssessmentUpdateSchema = z.object({
  status: z.enum(RISK_ASSESSMENT_STATUSES),
  level: z.enum(RISK_LEVELS).optional(),
  reviewDueAt: optionalString(40),
  summary: optionalString(4000),
  controlMeasures: optionalString(4000),
  triggerReason: optionalString(2000)
});

export const safeWellCheckCreateSchema = z.object({
  scheduledFor: optionalString(40),
  method: z.enum(SAFE_WELL_METHODS),
  checkedById: optionalRef,
  actionsTaken: optionalString(4000)
});

export const safeWellCheckUpdateSchema = z.object({
  status: z.enum(SAFE_WELL_STATUSES),
  method: z.enum(SAFE_WELL_METHODS).optional(),
  concernRaised: flagValue.optional(),
  concernSummary: optionalString(4000),
  actionsTaken: optionalString(4000)
});

export const moveChecklistCreateSchema = z.object({
  checklistType: z.enum(MOVE_CHECKLIST_TYPES),
  targetDate: optionalString(40),
  propertyId: optionalRef,
  notes: optionalString(2000)
});

export const moveChecklistItemUpdateSchema = z.object({
  status: z.enum(MOVE_ITEM_STATUSES),
  notes: optionalString(2000)
});

/* Contact tracking lives on the case note itself (lib/contact-tracking.ts reads the case-note
 * contact fields), so logged contacts use `caseNoteSchema` above. */

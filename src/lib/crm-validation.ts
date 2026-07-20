import { z } from 'zod';

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

export const caseNoteSchema = z.object({
  contactType: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80),
  note: z.string().trim().min(10).max(8000),
  outcome: z.string().trim().max(2000).optional(),
  followUpDate: z.string().trim().optional(),
  restricted: z.preprocess((value) => value === true || value === 'on' || value === 'true', z.boolean()).default(false)
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
  assignedToId: z.string().trim().optional()
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

const publishValue = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean());

export const serviceContentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(10).max(500),
  content: z.string().trim().min(10).max(8000),
  audience: z.string().trim().min(5).max(1000),
  referralRoutes: z.string().trim().min(5).max(2000),
  eligibility: z.string().trim().min(5).max(2000),
  supportModel: z.string().trim().min(5).max(2000),
  published: publishValue
});

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
const booleanInput = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean());

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

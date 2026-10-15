import { buildServiceUserTimeline, type TimelineEntry, type TimelineEntryInput, type TimelineKind } from './su-timeline';
import { isContactLogNote, type ContactLogNote } from './contact-tracking';
import { isEnteredInError } from './placement-lifecycle';

/** One aggregated history for a service user profile: every dated event the CRM holds about the
 * person — referral, placement, support plan and review, risk assessment, contacts, case notes,
 * Safe & Well checks, incidents, appointments, tasks, concerns, complaints, repairs and filed
 * documents — merged by lib/su-timeline so one profile reads as one story.
 *
 * The input is structural rather than Prisma's generated types so the aggregation can be tested with
 * hand-built profiles, and so a loader can pass a narrower selection without changing this module.
 * Nothing here decides what staff may see: the restricted flag is handed to the timeline builder,
 * which keeps the chronology but withholds the narrative. */

export type ClientProfileIncidentAction = {
  id: string;
  action: string;
  owner?: string | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
};

export type ClientProfileTimelineInput = {
  client: {
    id: string;
    reference: string;
    displayName: string;
    restricted: boolean;
    status: string;
    createdAt: Date;
    admissionDate?: Date | null;
  };
  referral?: { id: string; reference?: string | null; createdAt: Date; status?: string | null; source?: string | null } | null;
  placements?: Array<{ id: string; status: string; startDate: Date; endDate?: Date | null; property?: { publicName: string } | null; roomId?: string | null }>;
  supportPlans?: Array<{ id: string; version: number; status: string; createdAt: Date; reviews?: Array<{ id: string; reviewDate: Date; notes?: string | null }> }>;
  caseNotes?: Array<{ id: string; occurredAt?: Date | null; createdAt: Date; category: string; contactType: string; method?: string | null; outcome?: string | null; attempted?: boolean; completed?: boolean; nextContactDueAt?: Date | null }>;
  safeWellChecks?: Array<{ id: string; status: string; method?: string | null; scheduledFor?: Date | null; completedAt?: Date | null; concernRaised?: boolean; concernSummary?: string | null }>;
  riskAssessments?: Array<{ id: string; assessmentType: string; level: string; status: string; assessedAt: Date; summary?: string | null }>;
  incidents?: Array<{ id: string; reference: string; category: string; severity: string; status: string; incidentAt: Date; location?: string | null; description: string; restricted?: boolean; actions?: ClientProfileIncidentAction[] }>;
  documents?: Array<{ id: string; displayName: string; category: string; description?: string | null; createdAt: Date; restricted?: boolean }>;
  appointments?: Array<{ id: string; title: string; startsAt: Date; status: string; category?: string | null }>;
  tasks?: Array<{ id: string; title: string; dueAt?: Date | null; createdAt: Date; status: string; priority: string }>;
  concerns?: Array<{ id: string; reference: string; title: string; status: string; severity: string; raisedAt: Date }>;
  complaints?: Array<{ id: string; reference: string; title: string; status: string; stage: string; receivedAt: Date }>;
  maintenanceTickets?: Array<{ id: string; reference: string; title: string; status: string; priority: string; reportedAt: Date }>;
};

export type ClientProfileTimelineOptions = {
  now?: Date;
  limit?: number;
  /** Restrict the timeline to these kinds when the profile shows a filtered view. */
  kinds?: TimelineKind[];
};

/**
 * Whether the timeline shows a note as a contact or as a straight case note. The rule itself lives
 * in contact-tracking, so the profile, the operations board and the automation engine all classify
 * — and therefore count — the same notes.
 */
export function caseNoteTimelineKind(note: ContactLogNote): TimelineKind {
  return isContactLogNote(note) ? 'CONTACT' : 'CASE_NOTE';
}


/** Merges every dated record on a service user profile into one ordered timeline. Entries are keyed
 * by their source so two events on the same day are never collapsed, and the profile's restricted
 * flag decides whether narrative text travels with the chronology. */
export function buildClientProfileTimeline(profile: ClientProfileTimelineInput, options: ClientProfileTimelineOptions = {}): TimelineEntry[] {
  const entries: TimelineEntryInput[] = [];
  const profileHref = `/crm/clients/${profile.client.id}`;

  const referral = profile.referral;
  if (referral) {
    entries.push({
      kind: 'REFERRAL',
      id: `referral-${referral.id}`,
      occurredAt: referral.createdAt,
      title: 'Referral received',
      detail: [referral.reference, referral.source].filter(Boolean).join(' · ') || null,
      status: referral.status ?? null,
      href: '/crm/referrals'
    });
  }

  for (const placement of profile.placements ?? []) {
    entries.push({
      kind: 'PLACEMENT',
      id: `placement-start-${placement.id}`,
      occurredAt: placement.startDate,
      title: isEnteredInError(placement.status) ? 'Placement recorded in error' : 'Placement started',
      detail: placement.property?.publicName ?? 'Property not recorded',
      status: placement.status,
      href: `/crm/placements/${placement.id}`
    });
    if (placement.endDate) {
      entries.push({
        kind: 'PLACEMENT_END',
        id: `placement-end-${placement.id}`,
        occurredAt: placement.endDate,
        title: isEnteredInError(placement.status) ? 'Placement marked entered in error' : 'Placement ended or moved on',
        detail: placement.property?.publicName ?? null,
        status: placement.status,
        href: `/crm/placements/${placement.id}`
      });
    }
  }

  for (const plan of profile.supportPlans ?? []) {
    entries.push({
      kind: 'SUPPORT_PLAN',
      id: `support-plan-${plan.id}`,
      occurredAt: plan.createdAt,
      title: `Support plan version ${plan.version} recorded`,
      status: plan.status,
      href: '#support-plan'
    });
    for (const review of plan.reviews ?? []) {
      entries.push({
        kind: 'SUPPORT_PLAN_REVIEW',
        id: `support-plan-review-${review.id}`,
        occurredAt: review.reviewDate,
        title: 'Support plan reviewed',
        detail: review.notes ?? null,
        href: '#support-plan'
      });
    }
  }

  for (const assessment of profile.riskAssessments ?? []) {
    entries.push({
      kind: 'RISK_ASSESSMENT',
      id: `risk-${assessment.id}`,
      occurredAt: assessment.assessedAt,
      title: `${assessment.assessmentType.replace(/_/g, ' ').toLowerCase()} risk assessed`,
      detail: assessment.summary ?? null,
      status: assessment.level,
      category: assessment.status,
      href: profileHref
    });
  }

  for (const note of profile.caseNotes ?? []) {
    const kind = caseNoteTimelineKind(note);
    entries.push({
      kind,
      id: `case-note-${note.id}`,
      occurredAt: note.occurredAt ?? note.createdAt,
      title: kind === 'CONTACT' ? `Contact: ${note.contactType}` : `${note.category} case note`,
      detail: note.outcome ?? null,
      status: note.attempted ? 'Attempted contact' : null,
      category: note.category,
      href: profileHref
    });
  }

  for (const check of profile.safeWellChecks ?? []) {
    const occurredAt = check.completedAt ?? check.scheduledFor;
    if (!occurredAt) continue;
    entries.push({
      kind: 'SAFE_WELL',
      id: `safe-well-${check.id}`,
      occurredAt,
      title: check.completedAt ? 'Safe & Well check completed' : 'Safe & Well check scheduled',
      detail: check.concernRaised ? check.concernSummary ?? 'Concern raised — open the record to read the detail.' : check.method?.replace(/_/g, ' ').toLowerCase() ?? null,
      status: check.status,
      href: profileHref
    });
  }

  for (const incident of profile.incidents ?? []) {
    const outstanding = (incident.actions ?? []).filter((action) => !action.completedAt).length;
    entries.push({
      kind: 'INCIDENT',
      id: `incident-${incident.id}`,
      occurredAt: incident.incidentAt,
      title: `${incident.reference} — ${incident.category}`,
      detail: incident.restricted ? null : [incident.description, incident.location].filter(Boolean).join(' · '),
      status: incident.severity,
      category: outstanding ? `${incident.status} · ${outstanding} action${outstanding === 1 ? '' : 's'} outstanding` : incident.status,
      href: `/crm/incidents/${incident.id}`
    });
  }

  for (const appointment of profile.appointments ?? []) {
    entries.push({
      kind: 'APPOINTMENT',
      id: `appointment-${appointment.id}`,
      occurredAt: appointment.startsAt,
      title: appointment.title,
      category: appointment.category ?? null,
      status: appointment.status,
      href: '/crm/appointments'
    });
  }

  for (const task of profile.tasks ?? []) {
    entries.push({
      kind: 'TASK',
      id: `task-${task.id}`,
      occurredAt: task.dueAt ?? task.createdAt,
      title: task.title,
      status: task.status,
      category: task.priority,
      href: '/crm/tasks'
    });
  }

  for (const concern of profile.concerns ?? []) {
    entries.push({
      kind: 'CONCERN',
      id: `concern-${concern.id}`,
      occurredAt: concern.raisedAt,
      title: `${concern.reference} — ${concern.title}`,
      status: concern.status,
      category: concern.severity,
      href: '/crm/concerns'
    });
  }

  for (const complaint of profile.complaints ?? []) {
    entries.push({
      kind: 'COMPLAINT',
      id: `complaint-${complaint.id}`,
      occurredAt: complaint.receivedAt,
      title: `${complaint.reference} — ${complaint.title}`,
      status: complaint.status,
      category: complaint.stage,
      href: '/crm/complaints'
    });
  }

  for (const ticket of profile.maintenanceTickets ?? []) {
    entries.push({
      kind: 'MAINTENANCE',
      id: `maintenance-${ticket.id}`,
      occurredAt: ticket.reportedAt,
      title: `${ticket.reference} — ${ticket.title}`,
      status: ticket.status,
      category: ticket.priority,
      href: '/crm/maintenance'
    });
  }

  for (const document of profile.documents ?? []) {
    entries.push({
      kind: 'DOCUMENT',
      id: `document-${document.id}`,
      occurredAt: document.createdAt,
      title: `Document filed: ${document.displayName}`,
      detail: document.restricted ? null : [document.category, document.description].filter(Boolean).join(' · ') || null,
      status: document.restricted ? 'RESTRICTED' : 'FILED',
      category: document.category,
      href: '/crm/documents'
    });
  }

  return buildServiceUserTimeline({
    entries,
    restricted: profile.client.restricted,
    kinds: options.kinds,
    limit: options.limit,
    now: options.now
  });
}


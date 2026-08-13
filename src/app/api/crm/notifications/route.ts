import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/** Lightweight summary of items needing attention, for the top-bar notifications bell. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  const organisationId = user.organisationId;
  const [openReferrals, openIncidents, overdueTasks, unfilledShifts] = await Promise.all([
    db.referral.count({ where: { organisationId, status: { in: ['NEW', 'TRIAGE', 'AWAITING_INFORMATION'] } } }).catch(() => 0),
    db.incident.count({ where: { organisationId, status: { in: ['OPEN', 'UNDER_REVIEW', 'ACTION_PLAN_ACTIVE'] } } }).catch(() => 0),
    db.task.count({ where: { organisationId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }).catch(() => 0),
    db.rotaShift.count({ where: { organisationId, startsAt: { gte: new Date() }, assignments: { none: {} } } }).catch(() => 0)
  ]);
  return NextResponse.json({ openReferrals, openIncidents, overdueTasks, unfilledShifts, total: openReferrals + openIncidents + overdueTasks + unfilledShifts });
}

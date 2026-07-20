import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getCrmReferrals, getReferralAssignees } from '@/lib/data';
import { getCurrentUser, getScopedIds, hasPermission } from '@/lib/auth';
import { CrmPageHeader, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { formatDate, formatDateTime } from '@/lib/format';
import { nextReferralStatuses } from '@/lib/domain';
import { ReferralAssignmentForm } from '@/components/ReferralAssignmentForm';
import { ReferralStatusForm } from '@/components/ReferralStatusForm';

export default async function ReferralDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const serviceIds = getScopedIds(user, 'serviceIds');
  const canManage = await hasPermission(user, 'referrals.write');
  let referral: any = null;
  try {
    referral = await db.referral.findFirst({
      where: { id: params.id, organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}) },
      include: {
        service: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        assignments: { orderBy: { assignedAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } }
      }
    });
  } catch { /* fallback below */ }
  if (!referral) referral = (await getCrmReferrals()).find((item) => item.id === params.id);
  if (!referral) notFound();
  const assignees = canManage && referral.serviceId ? await getReferralAssignees(user, referral.serviceId) : [];
  const currentAssignee = referral.assignments?.[0]?.user ?? null;
  const statusHistory = referral.statusHistory ?? [{ createdAt: referral.createdAt, previous: null, next: referral.status, reason: 'Referral received' }];

  return <div className="crm-page"><CrmPageHeader eyebrow={`Referral / ${referral.reference}`} title={referral.personName} intro={`${referral.service.title} · received ${formatDate(referral.createdAt)}`} action={canManage ? 'Assign referral' : undefined} actionHref={canManage ? '#assign' : undefined} />{referral.anonymousDomesticAbuse && <RestrictedNote />}<div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Referral status</h2><StatusBadge status={referral.status} /></div><div className="panel-body">{canManage ? <ReferralStatusForm referralId={referral.id} currentStatus={referral.status} nextStatuses={nextReferralStatuses(referral.status)} followUpDate={referral.followUpDate} /> : <p className="muted">Status changes are limited to referral leads.</p>}</div></section><section className="crm-panel"><div className="panel-header"><h2>Assignment</h2><span className="muted" style={{ fontSize: 10 }}>Audited ownership</span></div><div className="panel-body">{canManage ? <ReferralAssignmentForm referralId={referral.id} currentAssignee={currentAssignee} assignees={assignees} /> : <p className="muted">{currentAssignee ? `Assigned to ${currentAssignee.name}.` : 'No staff member assigned yet.'}</p>}</div></section><section className="crm-panel"><div className="panel-header"><h2>Referrer</h2><span className="muted" style={{ fontSize: 10 }}>Safe to contact</span></div><div className="panel-body"><p style={{ margin: 0, fontSize: 12 }}><strong>{referral.referrerName}</strong><br />{referral.referrerOrganisation}<br />{referral.referrerEmail}<br />{referral.referrerPhone}</p></div></section></div><div style={{ marginTop: 18 }}><TableCard title="Activity history"><table className="crm-table"><thead><tr><th>When</th><th>Change</th><th>Reason</th><th>By</th></tr></thead><tbody>{statusHistory.map((event: any) => <tr key={event.id ?? String(event.createdAt)}><td>{formatDateTime(event.createdAt)}</td><td><StatusBadge status={event.next} /></td><td>{event.reason ?? '—'}</td><td>Safe Nest team</td></tr>)}</tbody></table></TableCard></div>{referral.assignments?.length > 0 && <div style={{ marginTop: 18 }}><TableCard title="Assignment history"><table className="crm-table"><thead><tr><th>When</th><th>Assigned to</th></tr></thead><tbody>{referral.assignments.map((assignment: any) => <tr key={assignment.id}><td>{formatDateTime(assignment.assignedAt)}</td><td>{assignment.user?.name ?? 'Unknown staff member'} · {assignment.user?.email}</td></tr>)}</tbody></table></TableCard></div>}<div style={{ marginTop: 18 }}><Link href="/crm/referrals" className="crm-button crm-button-secondary">← Back to referrals</Link></div></div>;
}

import { notFound } from 'next/navigation';
import { getCrmIncidents } from '@/lib/data';
import { CrmPageHeader, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { IncidentReviewForm } from '@/components/IncidentReviewForm';
import { IncidentFollowUpForm } from '@/components/IncidentFollowUpForm';
import { formatDate } from '@/lib/format';

export default async function IncidentDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const incident: any = (await getCrmIncidents()).find((item) => item.id === params.id);
  if (!incident) notFound();
  return <div className="crm-page"><CrmPageHeader eyebrow={`Incident / ${incident.reference}`} title={incident.category} intro={`${formatDate(incident.incidentAt)} · ${incident.client?.displayName}`} action="Add update" actionHref="#update" />{incident.restricted && <RestrictedNote />}<div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Incident status</h2><StatusBadge status={incident.status} /></div><div className="panel-body"><IncidentReviewForm incidentId={incident.id} severity={incident.severity} status={incident.status} reviewDate={incident.reviewDate} closureDecision={incident.closureDecision} /></div></section></div><IncidentFollowUpForm incidentId={incident.id} updates={incident.updates ?? []} actions={incident.actions ?? []} /><div style={{ marginTop: 18 }}><TableCard title="Audit history"><table className="crm-table"><thead><tr><th>When</th><th>Event</th><th>Actor</th><th>Access</th></tr></thead><tbody><tr><td>17 Jul 2026</td><td>Incident created</td><td>Support lead</td><td><StatusBadge status="LOGGED" tone="success" /></td></tr><tr><td>17 Jul 2026</td><td>Restricted record viewed</td><td>Safeguarding lead</td><td><StatusBadge status="AUDITED" tone="warning" /></td></tr></tbody></table></TableCard></div></div>;
}

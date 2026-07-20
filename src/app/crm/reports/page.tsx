import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getReportRows, reportDefinitions, reportHeaders, type ReportKey } from '@/lib/reports';
import { CrmPageHeader, EmptyState, MetricCard, StatusBadge, TableCard } from '@/components/CrmUI';
import { formatDateTime } from '@/lib/format';

const reportKeys = Object.keys(reportDefinitions) as ReportKey[];

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [canExport, canAudit] = await Promise.all([hasPermission(user, 'reports.export'), hasPermission(user, 'audit.read')]);
  const cards = await Promise.all(reportKeys.map(async (key) => {
    const definition = reportDefinitions[key];
    const allowed = canExport && await hasPermission(user, definition.permission);
    const rows = allowed ? await getReportRows(user, key).catch(() => []) : [];
    return { key, definition, allowed, rows };
  }));
  const exportLogs = await db.auditLog.findMany({ where: { organisationId: user.organisationId, action: 'REPORT_EXPORTED', ...(canAudit ? {} : { actorId: user.id }) }, orderBy: { createdAt: 'desc' }, take: 12 }).catch(() => []);
  const occupancyRows = cards.find((card) => card.key === 'occupancy')?.rows ?? [];
  const referralsRows = cards.find((card) => card.key === 'referrals')?.rows ?? [];
  const hbRows = cards.find((card) => card.key === 'housing-benefit-exceptions')?.rows ?? [];
  const incidentRows = cards.find((card) => card.key === 'incident-actions')?.rows ?? [];
  return <div className="crm-page"><CrmPageHeader eyebrow="Insight" title="Reports" intro="Live operational reports are scoped to your role and organisation. CSV exports create an audit event." /><div className="metric-grid"><MetricCard label="Properties" value={occupancyRows.length} detail="Included in occupancy report" tone="teal" icon="building" /><MetricCard label="Referrals" value={referralsRows.length} detail="Included in pipeline report" tone="blue" icon="clipboard" /><MetricCard label="HB exceptions" value={hbRows.length} detail="Finance action required" tone="gold" icon="chart" /><MetricCard label="Incident actions" value={incidentRows.length} detail="Rows in safeguarding report" tone="red" icon="alert" /></div><div className="crm-panels">{cards.map((card) => <section className="crm-panel" key={card.key}><div className="panel-header"><h2>{card.definition.title}</h2>{card.allowed ? <StatusBadge status="AVAILABLE" tone="success" /> : <StatusBadge status="RESTRICTED" tone="warning" />}</div><div className="panel-body"><p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 12 }}>{card.definition.description}</p><p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 10 }}>{card.allowed ? `${card.rows.length} rows currently available.` : `Requires ${card.definition.permission} and reports.export.`}</p>{card.allowed ? <><Link className="crm-button crm-button-secondary" href={`/api/crm/reports/export?report=${card.key}`}>Download CSV</Link>{card.rows.length ? <div className="table-scroll" style={{ marginTop: 16 }}><table className="crm-table"><thead><tr>{reportHeaders[card.key].slice(0, 3).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{card.rows.slice(0, 3).map((row, index) => <tr key={index}>{reportHeaders[card.key].slice(0, 3).map((header) => <td key={header}>{String(row[header] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <p className="muted" style={{ marginTop: 16, fontSize: 11 }}>No rows match this report.</p>}</> : <p className="muted" style={{ fontSize: 11 }}>This report is hidden until the required permission is assigned.</p>}</div></section>)}</div><div style={{ marginTop: 18 }}><TableCard title="Export history" count={`${exportLogs.length} events`}><table className="crm-table"><thead><tr><th>When</th><th>Report</th><th>Rows</th><th>Audit</th></tr></thead><tbody>{exportLogs.length ? exportLogs.map((log) => { let after: { report?: string; rowCount?: number } = {}; try { after = JSON.parse(log.afterJson ?? '{}'); } catch {} return <tr key={log.id}><td>{formatDateTime(log.createdAt)}</td><td><strong>{after.report ?? log.resourceId}</strong></td><td>{after.rowCount ?? '—'}</td><td><StatusBadge status="LOGGED" tone="success" /></td></tr>; }) : <tr><td colSpan={4}><EmptyState title="No exports yet" message="Your audited report exports will appear here." /></td></tr>}</tbody></table></TableCard></div></div>;
}

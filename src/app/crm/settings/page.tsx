import { db } from '@/lib/db';
import { fallbackSiteSettings } from '@/lib/data';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { CrmPageHeader, EmptyState, StatusBadge } from '@/components/CrmUI';
import { SettingsForm } from '@/components/SettingsForm';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const canWrite = await hasPermission(user, 'content.write');
  if (!user || !canWrite) return <div className="crm-page"><CrmPageHeader eyebrow="Organisation administration" title="Settings" intro="Structured content, emergency details, SEO defaults, and operational configuration." /><EmptyState title="Content administration access required" message="Only authorised content or organisation administrators can change public settings." /></div>;
  const rows = await db.siteSetting.findMany({ where: { organisationId: user.organisationId } }).catch(() => []);
  const settings = { ...fallbackSiteSettings, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  return <div className="crm-page"><CrmPageHeader eyebrow="Organisation administration" title="Settings" intro="Public-facing settings are saved to the organisation record and every change is audited." /><div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Public content</h2><StatusBadge status="EDITABLE" tone="success" /></div><div className="panel-body"><SettingsForm settings={settings} /></div></section><section className="crm-panel"><div className="panel-header"><h2>Security</h2><StatusBadge status="AUDITED" tone="warning" /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>MFA is required for invited accounts and privileged roles. Sessions expire after eight hours, password setup links expire after 30 minutes, and setting changes are recorded without storing full message contents.</p><a className="crm-button crm-button-secondary" href="/crm/users">Manage users and roles →</a></div></section></div></div>;
}

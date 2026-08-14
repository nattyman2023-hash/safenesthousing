import { db } from '@/lib/db';
import { fallbackSiteSettings } from '@/lib/data';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { CrmPageHeader, StatusBadge } from '@/components/CrmUI';
import { SettingsForm } from '@/components/SettingsForm';
import { EmailitSettingsForm } from '@/components/EmailitSettingsForm';
import { hasStoredEmailitApiKey } from '@/lib/email-settings';

export default async function SettingsPage() {
  const user = await requireUser();
  const rows = await db.siteSetting.findMany({ where: { organisationId: user.organisationId } }).catch(() => []);
  const settings = { ...fallbackSiteSettings, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  const emailitConfigured = await hasStoredEmailitApiKey(user.organisationId).catch(() => false);
  return <div className="crm-page"><CrmPageHeader eyebrow="Organisation administration" title="Settings" intro="Public-facing settings are saved to the organisation record and every change is audited." /><div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Public content</h2><StatusBadge status="EDITABLE" tone="success" /></div><div className="panel-body"><SettingsForm settings={settings} /></div></section><section className="crm-panel"><div className="panel-header"><h2>Email delivery</h2><StatusBadge status={emailitConfigured ? 'CONFIGURED' : 'ACTION NEEDED'} tone={emailitConfigured ? 'success' : 'warning'} /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Enter the Emailit API key used for password resets and other transactional email. It is encrypted at rest, never shown after saving, and every change is audited.</p><EmailitSettingsForm configured={emailitConfigured} /></div></section><section className="crm-panel"><div className="panel-header"><h2>Security</h2><StatusBadge status="AUDITED" tone="warning" /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Sessions expire after eight hours, password setup links expire after 30 minutes, and setting changes are recorded without storing full message contents.</p><a className="crm-button crm-button-secondary" href="/crm/users">Manage users →</a></div></section></div></div>;
}

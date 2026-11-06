import { db } from '@/lib/db';
import { crmDataUnavailable } from '@/lib/crm-errors';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { CrmPageHeader, StatusBadge } from '@/components/CrmUI';
import { SettingsForm } from '@/components/SettingsForm';
import { EmailitSettingsForm } from '@/components/EmailitSettingsForm';
import { hasStoredEmailitApiKey } from '@/lib/email-settings';

export default async function SettingsPage() {
  const user = await requireUser();
  const rows = await db.siteSetting.findMany({ where: { organisationId: user.organisationId } }).catch((error) => {
    throw crmDataUnavailable('settings', error);
  });
  // Saved values only. The public marketing defaults are deliberately not merged in here: an
  // unsaved figure must read as "not configured", never as a performance metric this organisation
  // has actually recorded.
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>;
  const configured = rows.length > 0;
  const emailitConfigured = await hasStoredEmailitApiKey(user.organisationId).catch(() => false);
  return <div className="crm-page"><CrmPageHeader eyebrow="Organisation administration" title="Settings" intro="Public-facing settings are saved to the organisation record and every change is audited." /><div className="crm-panels"><section className="crm-panel"><div className="panel-header"><h2>Public content</h2><StatusBadge status={configured ? 'SAVED' : 'NOT CONFIGURED'} tone={configured ? 'success' : 'warning'} /></div><div className="panel-body">{!configured && <p className="muted" style={{ fontSize: 12 }}>Nothing has been saved for this organisation yet, so every field below is blank. Placeholder text marks a value as not configured; no figure is presented as if it were recorded.</p>}<SettingsForm settings={settings} /></div></section><section className="crm-panel"><div className="panel-header"><h2>Email delivery</h2><StatusBadge status={emailitConfigured ? 'CONFIGURED' : 'ACTION NEEDED'} tone={emailitConfigured ? 'success' : 'warning'} /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Enter the Emailit API key used for password resets and other transactional email. It is encrypted at rest, never shown after saving, and every change is audited.</p><EmailitSettingsForm configured={emailitConfigured} /></div></section><section className="crm-panel"><div className="panel-header"><h2>Security</h2><StatusBadge status="AUDITED" tone="warning" /></div><div className="panel-body"><p className="muted" style={{ fontSize: 12 }}>Sessions expire after eight hours, password setup links expire after 30 minutes, and setting changes are recorded without storing full message contents.</p><a className="crm-button crm-button-secondary" href="/crm/users">Manage users →</a></div></section></div></div>;
}

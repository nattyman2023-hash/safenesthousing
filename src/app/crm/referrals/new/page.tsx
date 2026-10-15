import Link from 'next/link';
import { getReferralSelectableServices } from '@/lib/service-catalogue';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { CrmReferralForm } from '@/components/CrmReferralForm';

export default async function NewReferralPage() {
  // The options offered here are built from the same rule POST /api/crm/referrals enforces,
  // so a service the form lists is always a service the endpoint accepts.
  const user = await requireUser();
  const services = await getReferralSelectableServices(user.organisationId);
  return <div className="crm-page"><div className="crm-page-header"><div><p className="crm-eyebrow">Referrals / New</p><h1>Record a referral</h1><p>Internal intake is saved to the same auditable pipeline as public referrals.</p></div><Link className="crm-button crm-button-secondary" href="/crm/referrals">Cancel</Link></div><CrmReferralForm services={services} /></div>;
}

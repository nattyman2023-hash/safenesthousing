import Link from 'next/link';
import { getServices } from '@/lib/data';
import { CrmReferralForm } from '@/components/CrmReferralForm';

export default async function NewReferralPage() {
  const services = await getServices();
  return <div className="crm-page"><div className="crm-page-header"><div><p className="crm-eyebrow">Referrals / New</p><h1>Record a referral</h1><p>Internal intake is saved to the same auditable pipeline as public referrals.</p></div><Link className="crm-button crm-button-secondary" href="/crm/referrals">Cancel</Link></div><CrmReferralForm services={services.map((service) => ({ id: service.id, title: service.title }))} /></div>;
}

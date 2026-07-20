import type { Metadata } from 'next';
import { getServices } from '@/lib/data';
import { ReferralForm } from '@/components/ReferralForm';
export const metadata: Metadata = { title: 'Make a referral', description: 'Securely refer someone to Safe Nest housing and support.' };
export default async function ReferralsPage() { const services = (await getServices()).map((service) => ({ id: service.id, title: service.title })); return <main><section className="page-hero"><div className="container"><p className="eyebrow">Make a referral</p><h1>Let’s take the next step together.</h1><p>Use this form for a new referral. We will acknowledge it within seven days. For immediate danger, call 999.</p></div></section><section className="section"><div className="container" style={{ maxWidth: 900 }}><ReferralForm services={services as { id: string; title: string }[]} /></div></section></main>; }

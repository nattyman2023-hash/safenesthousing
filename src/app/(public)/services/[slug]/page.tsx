import { notFound } from 'next/navigation';
import { getServiceBySlug } from '@/lib/data';
import { ButtonLink } from '@/components/PublicUI';
import { Icon } from '@/components/Icons';
export default async function ServiceDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const service = await getServiceBySlug(params.slug);if (!service) notFound();const referralRoutes = 'referralRoutes' in service ? service.referralRoutes : 'Referrals are welcome from professionals, partner organisations, and people contacting us directly.';const eligibility = 'eligibility' in service ? service.eligibility : 'We will talk with you about eligibility, safety, and availability.';return <main><section className="page-hero"><div className="container"><p className="eyebrow">Our service</p><h1>{service.title}</h1><p>{service.summary}</p></div></section><section className="section"><div className="container service-detail-grid"><div className="prose"><h2>What this service offers</h2><p>{service.content}</p><p>We start with a conversation about what is happening now, what would make things safer, and what kind of support feels useful. From there we agree a practical next step.</p><ButtonLink href="/referrals">Make a referral <Icon name="arrow" size={15} /></ButtonLink></div><div className="info-card"><h3>Who it is for</h3><p>{service.audience}</p><h3>How to access it</h3><p>{referralRoutes}</p><h3>What happens next</h3><p>{eligibility}</p></div></div></section></main>;
}

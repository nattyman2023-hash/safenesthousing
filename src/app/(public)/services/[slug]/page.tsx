import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getServiceBySlug } from '@/lib/data';
import { getServiceEditorial } from '@/lib/service-content';
import { ButtonLink, getServiceVisual, PublicPageHero } from '@/components/PublicUI';
import { Icon } from '@/components/Icons';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const service = await getServiceBySlug(params.slug);
  if (!service) return { title: 'Service not found' };
  const visual = getServiceVisual(service.slug);
  return {
    title: service.title,
    description: service.summary,
    openGraph: { images: [{ url: visual.src, alt: visual.alt }] }
  };
}

export default async function ServiceDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const service = await getServiceBySlug(params.slug);
  if (!service) notFound();
  const editorial = getServiceEditorial(service.slug);
  const referralRoutes = editorial?.referralRoutes ?? ('referralRoutes' in service ? service.referralRoutes : 'Referrals are welcome from professionals, partner organisations, and people contacting us directly.');
  const eligibility = editorial?.eligibility ?? ('eligibility' in service ? service.eligibility : 'We will talk with you about eligibility, safety, and availability.');
  const audience = editorial?.audience ?? ('audience' in service ? service.audience : 'People who need a safe place and practical support.');
  const intro = editorial?.intro ?? service.content;
  const supportIncludes = editorial?.supportIncludes ?? [];

  return <main>
    <PublicPageHero eyebrow="Our service" title={service.title} intro={service.summary} image={getServiceVisual(service.slug)} />
    <section className="section"><div className="container service-detail-grid"><article className="prose"><h2>What this service offers</h2><p>{intro}</p><h2>Support can include</h2><ul>{supportIncludes.map((item) => <li key={item}>{item}</li>)}</ul><h2>How support works</h2><p>{editorial?.howItWorks ?? 'We start with a conversation about what is happening now, what would make things safer, and what kind of support feels useful. From there we agree a practical next step.'}</p><h2>What progress can look like</h2><p>{editorial?.outcomes ?? 'We agree practical next steps with you and review them as your situation changes.'}</p><ButtonLink href="/referrals">Make a referral <Icon name="arrow" size={15} /></ButtonLink></article><aside className="info-card"><h3>Who it is for</h3><p>{audience}</p><h3>How to access it</h3><p>{referralRoutes}</p><h3>What we consider</h3><p>{eligibility}</p><h3>Our support model</h3><p>{editorial?.supportModel ?? 'Person-led support with planned reviews and clear safeguarding arrangements.'}</p></aside></div></section>
  </main>;
}

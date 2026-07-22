import type { Metadata } from 'next';
import { getServices } from '@/lib/data';
import { getFeaturedVisual, PublicPageHero, SectionHeading, ServiceCard } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('services');

export const metadata: Metadata = {
  title: 'Our services',
  description: 'Explore Safe Nest housing, refuge, homelessness, mental-health, young people, and refugee move-on support services.',
  openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] }
};

export default async function ServicesPage() {
  const services = await getServices();
  return <main>
    <PublicPageHero eyebrow="How we help" title="Support shaped around real life." intro="From a safe room tonight to the confidence to move on, our services meet people at different points in their journey." image={featuredImage} />
    <section className="section section-tint"><div className="container content-grid"><div className="prose"><SectionHeading eyebrow="Our approach" title="Start with the person, then plan the support." /><p>There is no single route through housing need. We begin with a conversation about safety, current circumstances, strengths, and what would make the next step feel possible.</p><p>Our services combine accommodation with practical support. That might mean help with a tenancy, a calm place to recover, advocacy with other organisations, or support to build the confidence for move-on.</p></div><div className="info-card"><h3>What you can expect</h3><ul><li>A clear explanation of what happens next</li><li>Support shaped around your communication and access needs</li><li>Respect for privacy, consent, and choice</li><li>Honest conversations about suitability and availability</li></ul></div></div></section>
    <section className="section"><div className="container"><SectionHeading eyebrow="Six ways we support" title="Find the right place to start." /><div className="service-grid">{services.map((service) => <ServiceCard key={service.slug} service={service} />)}</div></div></section>
    <section className="section"><div className="container content-grid"><div className="info-card"><h3>Not sure which service fits?</h3><p>You do not need to diagnose the right route before contacting us. Tell us what is happening and we will help identify the safest next step.</p></div><div className="prose"><h2>Referrals and self-referrals</h2><p>Professionals, partner organisations, family members, and people seeking support can all get in touch. If there is immediate danger, call 999. The online form is not an emergency service.</p><a className="text-link" href="/referrals">Make a referral <span aria-hidden="true">→</span></a></div></div></section>
  </main>;
}

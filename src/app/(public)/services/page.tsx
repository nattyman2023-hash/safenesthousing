import type { Metadata } from 'next';
import { getServices } from '@/lib/data';
import { getServiceVisual, PublicPageHero, SectionHeading, ServiceCard } from '@/components/PublicUI';

export const metadata: Metadata = { title: 'Our services', description: 'Housing and support services from Safe Nest.' };

export default async function ServicesPage() {
  const services = await getServices();
  return <main>
    <PublicPageHero eyebrow="How we help" title="Support shaped around real life." intro="From a safe room tonight to the confidence to move on, our services meet people at different points in their journey." image={getServiceVisual('homelessness-support')} />
    <section className="section"><div className="container"><SectionHeading eyebrow="Six ways we support" title="Find the right place to start." /><div className="service-grid">{services.map((service) => <ServiceCard key={service.slug} service={service} />)}</div></div></section>
  </main>;
}

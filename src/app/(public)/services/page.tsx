import type { Metadata } from 'next';
import { getServices } from '@/lib/data';
import { SectionHeading, ServiceCard } from '@/components/PublicUI';
export const metadata: Metadata = { title: 'Our services', description: 'Housing and support services from Safe Nest.' };
export default async function ServicesPage() { const services = await getServices(); return <main><section className="page-hero"><div className="container"><p className="eyebrow">How we help</p><h1>Support shaped around real life.</h1><p>From a safe room tonight to the confidence to move on, our services meet people at different points in their journey.</p></div></section><section className="section"><div className="container"><SectionHeading eyebrow="Six ways we support" title="Find the right place to start." /><div className="service-grid">{services.map((service) => <ServiceCard key={service.slug} service={service} />)}</div></div></section></main>; }

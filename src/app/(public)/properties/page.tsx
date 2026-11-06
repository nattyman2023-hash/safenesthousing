import type { Metadata } from 'next';
import { getPublicProperties } from '@/lib/data';
import { getFeaturedVisual, PropertyCard, PublicPageHero } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('properties');

export const metadata: Metadata = { title: 'Our properties', description: 'Neighbourhood-level information about Safe Nest homes. Exact refuge addresses are never published.', openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] } };

export default async function PropertiesPage() {
  const properties = await getPublicProperties();
  const filters = ['All', 'Vacancies', 'Young people', 'Women only', 'Step-down', 'Refugee move-on'];
  return <main>
    <PublicPageHero eyebrow="Accommodation" title="Our properties" intro="We share locations at neighbourhood level. Exact addresses of refuge accommodation are never published; full details are shared with referrers after assessment." image={featuredImage} />
    <section className="section"><div className="container"><div className="filter-pills">{filters.map((filter, index) => <button key={filter} className={`filter-pill ${index === 0 ? 'active' : ''}`}>{filter}</button>)}</div>{properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.slug} property={property} />)}</div> : <div className="empty-state"><h3>Property details are not published yet</h3><p>We only publish a home once it has been added and approved by our team. Please contact us to discuss current availability and referrals.</p></div>}</div></section>
  </main>;
}

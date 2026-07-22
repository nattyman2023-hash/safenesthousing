import type { Metadata } from 'next';
import { getPublicProperties } from '@/lib/data';
import { getPropertyVisual, PropertyCard, PublicPageHero } from '@/components/PublicUI';

export const metadata: Metadata = { title: 'Our properties', description: 'Neighbourhood-level information about Safe Nest homes. Exact refuge addresses are never published.' };

export default async function PropertiesPage() {
  const properties = await getPublicProperties();
  const filters = ['All', 'Vacancies', 'Young people', 'Women only', 'Step-down', 'Refugee move-on'];
  return <main>
    <PublicPageHero eyebrow="Accommodation" title="Our properties" intro="We share locations at neighbourhood level. Exact addresses of refuge accommodation are never published; full details are shared with referrers after assessment." image={getPropertyVisual()} />
    <section className="section"><div className="container"><div className="filter-pills">{filters.map((filter, index) => <button key={filter} className={`filter-pill ${index === 0 ? 'active' : ''}`}>{filter}</button>)}</div><div className="property-grid">{properties.map((property) => <PropertyCard key={property.slug} property={property} />)}</div></div></section>
  </main>;
}

import { notFound } from 'next/navigation';
import { getPublicPropertyBySlug } from '@/lib/data';
import { ButtonLink, getPropertyVisual, PropertyPhoto, PublicPageHero } from '@/components/PublicUI';
import { Icon } from '@/components/Icons';

export default async function PropertyDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const property = await getPublicPropertyBySlug(params.slug);
  if (!property) notFound();

  return <main>
    <PublicPageHero eyebrow={property.serviceType} title={`${property.publicName} - ${property.neighbourhood}`} intro={property.publicSummary} image={getPropertyVisual(property.serviceType)} />
    <section className="section"><div className="container content-grid"><div><PropertyPhoto serviceType={property.serviceType} detail /><h2>A place to feel settled</h2><p className="muted">This home is part of our {property.serviceType.toLowerCase()} service. We will talk with you about suitability, availability, and what support would feel useful.</p></div><div className="info-card"><h3>At a glance</h3><ul>{property.facilities?.map((item) => <li key={item}>{item}</li>)}</ul><h3 style={{ marginTop: 24 }}>Eligibility</h3><p>{property.eligibility}</p><h3>Availability</h3><p>{property.publicVacancyState}</p><ButtonLink href="/referrals">Enquire about this home <Icon name="arrow" size={15} /></ButtonLink></div></div></section>
  </main>;
}

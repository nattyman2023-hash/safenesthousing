import Link from 'next/link';
import { Icon } from './Icons';

export function SectionHeading({ eyebrow, title, intro, align = 'left' }: { eyebrow?: string; title: string; intro?: string; align?: 'left' | 'center' }) {
  return <div className={`section-heading align-${align}`}>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{intro && <p className="section-intro">{intro}</p>}</div>;
}

export function ButtonLink({ href, children, secondary = false, small = false }: { href: string; children: React.ReactNode; secondary?: boolean; small?: boolean }) {
  return <Link href={href} className={`button ${secondary ? 'button-secondary' : 'button-primary'} ${small ? 'button-small' : ''}`}>{children}</Link>;
}

export function ServiceCard({ service }: { service: { slug: string; title: string; summary: string; audience?: string } }) {
  return <Link className="service-card" href={`/services/${service.slug}`}><span className="service-number">0{service.title.length % 6 + 1}</span><h3>{service.title}</h3><p>{service.summary}</p><span className="text-link">Explore service <Icon name="arrow" size={15} /></span></Link>;
}

export function PropertyCard({ property }: { property: { slug: string; publicName: string; neighbourhood: string; serviceType: string; publicSummary: string; publicVacancyState: string; facilities?: string[] } }) {
  const vacancy = !property.publicVacancyState.toLowerCase().includes('full');
  return <article className="property-card"><div className="property-photo"><span>Safe Nest home</span></div><div className="property-card-content"><div className="tag-row"><span className={`status-tag ${vacancy ? 'status-available' : 'status-neutral'}`}>{property.publicVacancyState}</span><span className="tag-outline">{property.serviceType}</span></div><h3>{property.publicName} <span>· {property.neighbourhood}</span></h3><p>{property.publicSummary}</p><ButtonLink href={`/properties/${property.slug}`} secondary small>{vacancy ? 'Enquire' : 'Join waitlist'} <Icon name="arrow" size={14} /></ButtonLink></div></article>;
}

export function StatsBand({ settings }: { settings?: Record<string, string> }) {
  return <section className="stats-band"><div className="container stats-grid"><div><strong>{settings?.['homepage.stats.moveOn'] ?? '94%'}</strong><span>move-on tenancies sustained at six months</span></div><div><strong>{settings?.['homepage.stats.newRooms'] ?? '12'}</strong><span>new supported rooms opened this year</span></div><div><strong>{settings?.['homepage.stats.responseTarget'] ?? '7 days'}</strong><span>our target for acknowledging referrals</span></div><div><strong>24/7</strong><span>confidential safety support</span></div></div></section>;
}

export function UrgentHelp() {
  return <section className="urgent-band"><div className="container urgent-inner"><div><p className="eyebrow">Need help now?</p><h2>If there is immediate danger, call 999.</h2><p>For confidential domestic abuse support, call our 24/7 line on <strong>0800 000 0000</strong>. You do not need to use the referral form.</p></div><ButtonLink href="/contact" secondary>Other ways to contact us <Icon name="arrow" size={15} /></ButtonLink></div></section>;
}

export function PublicFormField({ label, name, type = 'text', required = false, placeholder, children }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; children?: React.ReactNode }) {
  return <div className="form-field"><label htmlFor={name}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children ?? <input id={name} name={name} type={type} placeholder={placeholder} required={required} />}</div>;
}

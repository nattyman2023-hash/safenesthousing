import type { Metadata } from 'next';
import { getFeaturedVisual, PublicPageHero } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('safeguarding');

export const metadata: Metadata = { title: 'Safeguarding', description: 'How Safe Nest responds to safeguarding concerns and helps people speak safely.', openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] } };

export default function SafeguardingPage() {
  return <main>
    <PublicPageHero eyebrow="Safety first" title="Safeguarding" intro="We take concerns seriously and make space for people to speak safely." image={featuredImage} />
    <section className="section"><div className="container prose" style={{ maxWidth: 780 }}><h2>If someone is in immediate danger</h2><p>Call 999. This website and the referral form are not emergency services.</p><h2>Confidential support</h2><p>For confidential domestic-abuse support, call 0800 000 0000. If it is not safe to leave a message, tell us the safest way to communicate.</p><h2>How we work</h2><p>Safeguarding decisions are made by trained staff under organisational policy. Restricted records have need-to-know access and important viewing and changes are audited.</p></div></section>
  </main>;
}

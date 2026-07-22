import { getServiceVisual, PublicPageHero } from '@/components/PublicUI';

export default function SafeguardingPage() {
  return <main>
    <PublicPageHero eyebrow="Safety first" title="Safeguarding" intro="We take concerns seriously and make space for people to speak safely." image={getServiceVisual('domestic-abuse')} />
    <section className="section"><div className="container prose" style={{ maxWidth: 780 }}><h2>If someone is in immediate danger</h2><p>Call 999. This website and the referral form are not emergency services.</p><h2>Confidential support</h2><p>For confidential domestic-abuse support, call 0800 000 0000. If it is not safe to leave a message, tell us the safest way to communicate.</p><h2>How we work</h2><p>Safeguarding decisions are made by trained staff under organisational policy. Restricted records have need-to-know access and important viewing and changes are audited.</p></div></section>
  </main>;
}

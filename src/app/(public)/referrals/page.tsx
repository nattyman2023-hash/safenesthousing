import type { Metadata } from 'next';
import { getPublicSelectableServices } from '@/lib/service-catalogue';
import { getFeaturedVisual, PublicPageHero } from '@/components/PublicUI';
import { ReferralForm } from '@/components/ReferralForm';

const featuredImage = getFeaturedVisual('referrals');

export const metadata: Metadata = { title: 'Make a referral', description: 'Securely refer someone to Safe Nest housing and support.', openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] } };

export default async function ReferralsPage() {
  // Same rule as POST /api/referrals: only a published service can accept a referral,
  // so the menu never offers an option the endpoint would reject.
  const services = await getPublicSelectableServices();
  return <main>
    <PublicPageHero eyebrow="Make a referral" title="Let's take the next step together." intro="Use this form for a new referral. We will acknowledge it within seven days. For immediate danger, call 999." image={featuredImage} />
    <section className="section"><div className="container" style={{ maxWidth: 900 }}>{services.length === 0 && <div className="info-card" style={{ marginBottom: 24 }}><h3>Online referrals are temporarily unavailable</h3><p>We cannot accept new referrals through this form right now. Please call <strong>0808 157 0000</strong> or use the <a className="text-link" href="/contact">contact page</a> and we will respond by the safest route. If you are in immediate danger, call 999.</p></div>}<ReferralForm services={services} /></div></section>
  </main>;
}

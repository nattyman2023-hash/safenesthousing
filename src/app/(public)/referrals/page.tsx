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
    <section className="section"><div className="container" style={{ maxWidth: 900 }}><ReferralForm services={services} /></div></section>
  </main>;
}

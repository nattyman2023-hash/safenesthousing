import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { getFeaturedVisual, PublicPageHero } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('contact');

export const metadata: Metadata = { title: 'Contact Safe Nest', description: 'Talk to Safe Nest Housing & Support.', openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] } };

export default function ContactPage() {
  return <main>
    <PublicPageHero eyebrow="Contact" title="Talk to us" intro="We are happy to answer questions about our services, properties, referrals, and partnerships." image={featuredImage} imagePosition="72% 35%" />
    <section className="section"><div className="container form-layout"><div className="form-sidebar"><h2>There is a way in.</h2><p>If you are unsure where to start, send a message and we will help you find the right next step.</p><div className="contact-list"><div className="contact-row"><strong>General</strong><span>hello@safenesthousing.org.uk<br />01234 000 000 - Mon-Fri, 9-5</span></div><div className="contact-row"><strong>Referrals</strong><span>Use our <a href="/referrals" style={{ color: 'var(--teal-700)', textDecoration: 'underline' }}>referral form</a>.</span></div><div className="contact-row"><strong>Urgent - 24/7</strong><span style={{ color: 'var(--danger)' }}><strong>0800 000 0000</strong><br />In immediate danger, call 999.</span></div><div className="contact-row"><strong>Office</strong><span>Safe Nest Housing &amp; Support<br />1 Example Street, Your Town, AB1 2CD</span></div></div></div><ContactForm /></div></section>
  </main>;
}

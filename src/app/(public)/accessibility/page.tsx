import type { Metadata } from 'next';
import { getFeaturedVisual, PublicPageHero } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('accessibility');

export const metadata: Metadata = {
  title: 'Accessibility statement',
  description: 'How Safe Nest is making its housing and support website easier to use, understand, and navigate for everyone.',
  openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] }
};

export default function AccessibilityPage() {
  return <main>
    <PublicPageHero eyebrow="Everyone welcome" title="Accessibility" intro="We want everyone to be able to find information, ask for help, and make a referral in a way that works for them." image={featuredImage} />
    <section className="section"><div className="container content-grid"><article className="prose"><h2>Our commitment</h2><p>Safe Nest is committed to making this website usable by as many people as possible, including people who use assistive technology, keyboard navigation, browser zoom, captions, voice control, or alternative ways of communicating.</p><p>We use plain language where we can, keep the main actions visible, and treat access needs as part of good housing and support practice rather than an afterthought.</p><h2>How the site is designed</h2><ul><li>Pages use a logical heading order and meaningful link text.</li><li>Forms have visible labels, clear instructions, and status messages.</li><li>Interactive controls can be reached with a keyboard and have visible focus styles.</li><li>Layouts reflow for phones, tablets, desktops, and zoomed views.</li><li>Images have alternative text when they convey information; decorative images are hidden from assistive technology.</li><li>Motion is kept limited and the interface respects reduced-motion preferences.</li><li>Colour is not the only way we communicate status or an action.</li></ul></article><aside className="info-card"><h3>Compliance status</h3><p>This website is currently considered <strong>partially compliant</strong> with WCAG 2.2 AA while we complete a formal sample audit and address any issues it identifies.</p><p>We will update this statement when major changes are made and at least once a year.</p><p><strong>Statement reviewed:</strong> 23 July 2026</p></aside></div></section>
    <section className="section section-tint"><div className="container content-grid"><div className="prose"><h2>Known limits and our next steps</h2><p>We are continuing to review image descriptions, form feedback, zoom behaviour, contrast, and the staff area. Some older documents or third-party content may not yet meet the same standard as the public website.</p><p>We will prioritise issues that prevent someone from understanding their options, contacting us safely, or completing a referral.</p></div><div className="prose"><h2>Tell us what would help</h2><p>If something prevents you from using this site, please <a href="/contact" style={{ color: 'var(--teal-700)', textDecoration: 'underline' }}>contact us</a> or email <a href="mailto:hello@safenesthousing.org.uk" style={{ color: 'var(--teal-700)', textDecoration: 'underline' }}>hello@safenesthousing.org.uk</a>.</p><p>Tell us the page, what you were trying to do, and the format or adjustment that would help. You do not need to explain a diagnosis or share sensitive personal information.</p><p>We can discuss alternative ways to receive non-confidential information. This website is not monitored as an emergency service; call 999 if someone is in immediate danger.</p></div></div></section>
  </main>;
}

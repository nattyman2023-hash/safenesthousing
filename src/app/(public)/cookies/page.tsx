import { getPropertyVisual, PublicPageHero } from '@/components/PublicUI';

export default function CookiesPage() {
  return <main>
    <PublicPageHero eyebrow="Your choices" title="Cookies" intro="We keep cookies to the minimum needed for this service to work." image={getPropertyVisual('Young people')} />
    <section className="section"><div className="container prose" style={{ maxWidth: 780 }}><h2>Essential cookies</h2><p>Staff areas use an httpOnly, secure session cookie to keep authorised users signed in. It cannot be read by page scripts.</p><h2>Analytics</h2><p>No analytics cookies are enabled in this development implementation. If Safe Nest adds analytics, it should use a documented consent and retention approach.</p></div></section>
  </main>;
}

import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

export function PublicFooter() {
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div><BrandLogo href="/" className="brand-logo-footer" /><p className="footer-copy">A safe place to land. The support to move on.</p></div>
      <div><p className="footer-label">Explore</p><div className="footer-links"><Link href="/about">About us</Link><Link href="/services">Our services</Link><Link href="/properties">Our properties</Link><Link href="/news">News &amp; stories</Link></div></div>
      <div><p className="footer-label">Talk to us</p><div className="footer-links"><a href="mailto:hello@safenesthousing.org.uk">hello@safenesthousing.org.uk</a><a href="tel:01234000000">01234 000 000</a><Link href="/contact">Contact us</Link><Link href="/referrals">Make a referral</Link></div></div>
      <div className="footer-urgent"><p className="footer-label">Urgent help</p><p>In immediate danger, call <strong>999</strong>.</p><p>For confidential domestic abuse support, call <strong>0800 000 0000</strong>.</p></div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} Safe Nest Housing &amp; Support</span><div><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/accessibility">Accessibility</Link><Link href="/staff/login">Staff login</Link></div></div>
  </footer>;
}

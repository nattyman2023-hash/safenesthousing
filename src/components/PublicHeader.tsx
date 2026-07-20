'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './Icons';

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const links = [['About', '/about'], ['Services', '/services'], ['Properties', '/properties'], ['News', '/news'], ['Contact', '/contact']];
  return <header className="site-header">
    <div className="container header-inner">
      <Link href="/" className="wordmark" onClick={() => setOpen(false)}><span>Safe Nest</span><small>Housing &amp; Support</small></Link>
      <nav className={`site-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        {links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
        <Link className="button button-primary button-small" href="/referrals" onClick={() => setOpen(false)}>Make a referral <Icon name="arrow" size={15} /></Link>
      </nav>
      <button className="icon-button menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button>
    </div>
  </header>;
}

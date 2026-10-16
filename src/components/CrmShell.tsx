'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';
import { NotificationsBell } from './NotificationsBell';

type IconName = 'home' | 'clipboard' | 'users' | 'calendar' | 'building' | 'alert' | 'check' | 'chart' | 'shield' | 'file' | 'settings';
type NavItem = { label: string; href: string; icon: IconName };

/**
 * The sidebar is grouped by the work it supports rather than by the order modules were built, so a
 * staff member looking for tonight's cover or an overdue policy does not have to scan twenty-three
 * equally weighted links.
 */
const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/crm/dashboard', icon: 'home' }] },
  { label: 'People and care', items: [
    { label: 'Referrals', href: '/crm/referrals', icon: 'clipboard' },
    { label: 'Clients', href: '/crm/clients', icon: 'users' },
    { label: 'Placements', href: '/crm/placements', icon: 'clipboard' },
    { label: 'Appointments', href: '/crm/appointments', icon: 'calendar' },
    { label: 'Calendar', href: '/crm/calendar', icon: 'calendar' }
  ] },
  { label: 'Safety and quality', items: [
    { label: 'Incidents', href: '/crm/incidents', icon: 'alert' },
    { label: 'Concerns', href: '/crm/concerns', icon: 'alert' },
    { label: 'Complaints', href: '/crm/complaints', icon: 'clipboard' },
    { label: 'Compliance', href: '/crm/compliance', icon: 'shield' },
    { label: 'Policies', href: '/crm/policies', icon: 'file' }
  ] },
  { label: 'Property and operations', items: [
    { label: 'Properties', href: '/crm/properties', icon: 'building' },
    { label: 'Repairs', href: '/crm/maintenance', icon: 'building' },
    { label: 'Rota', href: '/crm/rota', icon: 'calendar' },
    { label: 'Tasks', href: '/crm/tasks', icon: 'check' }
  ] },
  { label: 'Governance', items: [
    { label: 'Billing', href: '/crm/billing', icon: 'chart' },
    { label: 'Reports', href: '/crm/reports', icon: 'chart' },
    { label: 'Documents', href: '/crm/documents', icon: 'file' },
    { label: 'Services', href: '/crm/settings/services', icon: 'clipboard' },
    { label: 'Content', href: '/crm/content', icon: 'file' },
    { label: 'Governance', href: '/crm/governance', icon: 'shield' },
    { label: 'Audit log', href: '/crm/audit', icon: 'shield' },
    { label: 'Users and roles', href: '/crm/users', icon: 'users' },
    { label: 'Settings', href: '/crm/settings', icon: 'settings' }
  ] }
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

/** The longest matching href wins, so /crm/referrals/new reads as Referrals and not as Calendar. */
function activeItem(pathname: string): NavItem | null {
  return ALL_ITEMS
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0] ?? null;
}

export function CrmShell({ children, userName = 'Development admin', role = 'Organisation administrator' }: { children: React.ReactNode; userName?: string; role?: string }) {
  const pathname = usePathname();
  // The drawer is open only while the current path still equals the path it was opened on, so any
  // navigation — a link, the browser Back button, a redirect — closes it without an effect.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const closeMenu = () => setMenuPath(null);
  const active = activeItem(pathname);
  const section = NAV_SECTIONS.find((group) => group.items.some((item) => item.href === active?.href));

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuPath(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const link = (item: NavItem) => <Link className={active?.href === item.href ? 'active' : ''} key={item.href} href={item.href} aria-current={active?.href === item.href ? 'page' : undefined} onClick={closeMenu}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>;

  return <div className="crm-app">
    <aside className={`crm-sidebar${menuOpen ? ' is-open' : ''}`} id="crm-sidebar">
      <div className="crm-brand">
        <span className="brand-mark">⌂</span>
        <span><strong>Safe Nest</strong><small>Operations</small></span>
        <button type="button" className="crm-menu-close" onClick={closeMenu} aria-label="Close navigation"><Icon name="close" size={18} /></button>
      </div>
      <div className="workspace-pill"><span className="online-dot" /> Safe Nest Housing</div>
      <nav className="crm-nav" aria-label="CRM navigation">
        {NAV_SECTIONS.map((group) => <div className="crm-nav-group" key={group.label}><p className="nav-label">{group.label}</p>{group.items.map(link)}</div>)}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar avatar-small">{userName.slice(0, 1)}</div>
        <div><strong>{userName}</strong><span>{role}</span></div>
        <a href="/api/auth/logout" aria-label="Sign out"><Icon name="logout" size={16} /></a>
      </div>
    </aside>
    {menuOpen && <button type="button" className="crm-scrim" aria-label="Close navigation" onClick={closeMenu} />}
    <main className="crm-main">
      <header className="crm-topbar">
        <div className="crm-topbar-leading">
          <button type="button" className="crm-menu-toggle" onClick={() => setMenuPath(pathname)} aria-label="Open navigation" aria-controls="crm-sidebar" aria-expanded={menuOpen}><Icon name="menu" size={18} /></button>
          <div className="crm-breadcrumb">Safe Nest <span>/</span> {section?.label ?? 'Operations'}{active && <><span>/</span> {active.label}</>}</div>
        </div>
        <div className="crm-top-actions">
          <Link className="icon-button" href="/crm/search" aria-label="Search"><Icon name="search" /></Link>
          <NotificationsBell />
          <div className="avatar">{userName.slice(0, 1)}</div>
        </div>
      </header>
      {children}
    </main>
  </div>;
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icons';

const nav = [
  { label: 'Overview', href: '/crm/dashboard', icon: 'home' as const },
  { label: 'Referrals', href: '/crm/referrals', icon: 'clipboard' as const },
  { label: 'Clients', href: '/crm/clients', icon: 'users' as const },
  { label: 'Placements', href: '/crm/placements', icon: 'clipboard' as const },
  { label: 'Properties', href: '/crm/properties', icon: 'building' as const },
  { label: 'Incidents', href: '/crm/incidents', icon: 'alert' as const },
  { label: 'Tasks', href: '/crm/tasks', icon: 'check' as const },
  { label: 'Rota', href: '/crm/rota', icon: 'calendar' as const },
  { label: 'Billing', href: '/crm/billing', icon: 'chart' as const }
];

const secondary = [
  { label: 'Documents', href: '/crm/documents', icon: 'file' as const },
  { label: 'Content', href: '/crm/content', icon: 'file' as const },
  { label: 'Reports', href: '/crm/reports', icon: 'chart' as const },
  { label: 'Users & roles', href: '/crm/users', icon: 'users' as const },
  { label: 'Governance', href: '/crm/governance', icon: 'shield' as const },
  { label: 'Audit log', href: '/crm/audit', icon: 'shield' as const },
  { label: 'Settings', href: '/crm/settings', icon: 'settings' as const }
];

export function CrmShell({ children, userName = 'Development admin', role = 'Organisation administrator' }: { children: React.ReactNode; userName?: string; role?: string }) {
  const pathname = usePathname();
  return <div className="crm-app"><aside className="crm-sidebar"><div className="crm-brand"><span className="brand-mark">⌂</span><span><strong>Safe Nest</strong><small>Operations</small></span></div><div className="workspace-pill"><span className="online-dot" /> Safe Nest Housing</div><nav className="crm-nav" aria-label="CRM navigation"><p className="nav-label">Workspace</p>{nav.map((item) => <Link className={pathname.startsWith(item.href) ? 'active' : ''} key={item.href} href={item.href}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>)}<p className="nav-label nav-label-lower">Manage</p>{secondary.map((item) => <Link className={pathname.startsWith(item.href) ? 'active' : ''} key={item.href} href={item.href}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>)}</nav><div className="sidebar-footer"><div className="avatar avatar-small">{userName.slice(0, 1)}</div><div><strong>{userName}</strong><span>{role}</span></div><Link href="/api/auth/logout" aria-label="Sign out"><Icon name="logout" size={16} /></Link></div></aside><main className="crm-main"><header className="crm-topbar"><div className="crm-breadcrumb">Safe Nest <span>/</span> Operations</div><div className="crm-top-actions"><Link className="icon-button" href="/crm/search" aria-label="Search"><Icon name="search" /></Link><button className="icon-button" aria-label="Notifications"><Icon name="bell" /></button><div className="avatar">{userName.slice(0, 1)}</div></div></header>{children}</main></div>;
}

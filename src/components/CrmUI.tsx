import Link from 'next/link';
import { Icon } from './Icons';
import { StatusBadge } from './StatusBadge';

export function CrmPageHeader({ eyebrow, title, intro, action, actionHref }: { eyebrow?: string; title: string; intro?: string; action?: string; actionHref?: string }) {
  return <div className="crm-page-header"><div>{eyebrow && <p className="crm-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{intro && <p>{intro}</p>}</div>{action && actionHref && <Link className="crm-button crm-button-primary" href={actionHref}><Icon name="plus" size={16} /> {action}</Link>}</div>;
}

export function MetricCard({ label, value, detail, tone = 'teal', icon = 'chart' as const }: { label: string; value: string | number; detail: string; tone?: string; icon?: 'chart' | 'users' | 'clipboard' | 'building' | 'alert' | 'calendar' }) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={17} /></span></div><strong>{value}</strong><p>{detail}</p></div>;
}

export function FilterBar({ placeholder = 'Search records', children }: { placeholder?: string; children?: React.ReactNode }) {
  return <div className="filter-bar"><label className="search-box"><Icon name="search" size={17} /><input placeholder={placeholder} aria-label={placeholder} /></label>{children}<button className="crm-button crm-button-secondary">Filters <span className="filter-count">2</span></button></div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="clipboard" size={22} /></span><h3>{title}</h3><p>{message}</p></div>;
}

export function TableCard({ children, title, count }: { children: React.ReactNode; title?: string; count?: string }) {
  return <section className="table-card">{title && <div className="table-card-header"><h2>{title}{count && <span>{count}</span>}</h2><Link href="#view-all">View all <Icon name="arrow" size={14} /></Link></div>}<div className="table-scroll">{children}</div></section>;
}

export function RestrictedNote() { return <div className="restricted-note"><Icon name="shield" size={15} /><span>Restricted record — access is logged and limited to authorised staff.</span></div>; }

export { StatusBadge };

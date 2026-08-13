'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

type Summary = { openReferrals: number; openIncidents: number; overdueTasks: number; unfilledShifts: number; total: number };

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Summary | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/crm/notifications').then((res) => (res.ok ? res.json() : null)).then((json) => { if (!cancelled && json) setData(json); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const items = data ? [
    { label: 'Referrals awaiting triage', count: data.openReferrals, href: '/crm/referrals' },
    { label: 'Open incidents', count: data.openIncidents, href: '/crm/incidents' },
    { label: 'Overdue tasks', count: data.overdueTasks, href: '/crm/tasks' },
    { label: 'Unfilled upcoming shifts', count: data.unfilledShifts, href: '/crm/rota' }
  ].filter((item) => item.count > 0) : [];

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button className="icon-button" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={{ position: 'relative' }}>
        <Icon name="bell" />
        {data && data.total > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 999, background: 'var(--red, #b42318)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{data.total}</span>}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 260, background: '#fff', border: '1px solid #e0e9e9', borderRadius: 8, boxShadow: '0 8px 24px rgba(16,42,42,.12)', padding: 8, zIndex: 50 }}>
          <p style={{ margin: '4px 8px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted, #5a6b6b)' }}>Needs attention</p>
          {items.length === 0 && <p style={{ margin: '4px 8px 8px', fontSize: 12, color: 'var(--muted, #5a6b6b)' }}>Nothing needs your attention right now.</p>}
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: 6, fontSize: 13, textDecoration: 'none', color: 'inherit' }}>
              <span>{item.label}</span>
              <strong style={{ fontSize: 12 }}>{item.count}</strong>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

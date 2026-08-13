'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

/**
 * Client-side filter for CRM list pages.
 *
 * Renders a search input plus an optional status <select> (passed as children).
 * It locates the nearest table rendered after the filter bar and hides/shows
 * its <tbody> rows based on a case-insensitive text match, and (when a select
 * with a `data-filter-status` attribute is present) an exact cell-text match.
 */
export function FilterBar({ placeholder = 'Search records', children }: { placeholder?: string; children?: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const applyFilter = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    // Find the first table that appears after this filter bar in the document.
    let node: Element | null = root;
    let table: HTMLTableElement | null = null;
    const all = Array.from(root.ownerDocument.querySelectorAll('table.crm-table'));
    for (const candidate of all) {
      if (root.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) { table = candidate as HTMLTableElement; break; }
    }
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const q = query.trim().toLowerCase();
    // Normalise by stripping non-alphanumerics so raw enum values (UNDER_REVIEW)
    // match their formatted badge text ("Under Review").
    const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const statusNeedle = normalise(status);
    let visible = 0;
    for (const row of rows) {
      const text = row.textContent?.toLowerCase() ?? '';
      const rowNormalised = normalise(text);
      const matchesQuery = !q || text.includes(q) || rowNormalised.includes(normalise(q));
      const matchesStatus = status === 'ALL' || rowNormalised.includes(statusNeedle);
      const show = matchesQuery && matchesStatus;
      (row as HTMLElement).style.display = show ? '' : 'none';
      if (show) visible += 1;
    }
    const countEl = root.querySelector<HTMLElement>('[data-filter-visible]');
    if (countEl) countEl.textContent = String(visible);
  }, [query, status]);

  useEffect(() => { applyFilter(); }, [applyFilter]);

  // Detect the status select rendered as a child and wire it up.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const select = root.querySelector<HTMLSelectElement>('select[data-filter-status]');
    if (!select) return;
    const onChange = () => setStatus(select.value);
    select.addEventListener('change', onChange);
    setStatus(select.value);
    return () => select.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="filter-bar" ref={rootRef}>
      <label className="search-box">
        <Icon name="search" size={17} />
        <input
          placeholder={placeholder}
          aria-label={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {children}
      <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>
        <span data-filter-visible>—</span> shown
      </span>
    </div>
  );
}

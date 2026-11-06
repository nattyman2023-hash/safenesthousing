'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

/**
 * Collapsible home for a list page's "create" form, so the records come first and the form is one
 * click away. It opens when the page header's "Add …" button (href="#new") is used, when the page
 * is loaded at #new, and by default when there is nothing in the list yet.
 */
export function CreatePanel({ title, description, defaultOpen = false, children }: { title: string; description?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Only the first render decides: creating the first record must not snap the panel shut.
  const [initiallyOpen] = useState(defaultOpen);

  useEffect(() => {
    const reveal = () => {
      const panel = ref.current;
      if (!panel) return;
      panel.open = true;
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus({ preventScroll: true });
      });
    };
    if (window.location.hash === '#new') reveal();
    const onHashChange = () => { if (window.location.hash === '#new') reveal(); };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href="#new"]');
      if (link && !ref.current?.contains(link)) { event.preventDefault(); reveal(); }
    };
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('hashchange', onHashChange); document.removeEventListener('click', onClick); };
  }, []);

  return <details ref={ref} className="create-panel" open={initiallyOpen}>
    <summary>
      <span className="create-panel-icon" aria-hidden="true"><Icon name="plus" size={18} /></span>
      <span className="create-panel-text"><span className="create-panel-title">{title}</span>{description && <span className="create-panel-sub">{description}</span>}</span>
      <span className="create-panel-toggle" aria-hidden="true"><span className="when-closed">Open form</span><span className="when-open">Close</span></span>
    </summary>
    {children}
  </details>;
}

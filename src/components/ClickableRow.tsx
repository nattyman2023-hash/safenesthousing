'use client';

import { useRouter } from 'next/navigation';

/** A `<tr>` that navigates to `href` on click anywhere in the row, while still letting clicks on
 * an inner link, button, select, or input behave normally (so status dropdowns and action links
 * inside the row keep working instead of being hijacked by the row-level navigation). */
export function ClickableRow({ href, children, ...rest }: { href: string; children: React.ReactNode } & React.HTMLAttributes<HTMLTableRowElement>) {
  const router = useRouter();
  return (
    <tr
      {...rest}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('a, button, select, input, textarea, label')) return;
        router.push(href);
      }}
      style={{ cursor: 'pointer', ...rest.style }}
    >
      {children}
    </tr>
  );
}

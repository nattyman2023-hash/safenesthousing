import Link from 'next/link';

/**
 * The secondary actions for one row of the placement register.
 *
 * Everything lives behind a single disclosure so a row stays readable, and every action opens the
 * record itself: the placement page owns the edit form, the end form and the confirmation dialog, so
 * there is exactly one implementation of each lifecycle change rather than a second, thinner copy in
 * the list.
 *
 * The menu is rendered in the normal flow rather than absolutely positioned, because the register
 * lives inside a horizontally scrollable table wrapper that would clip a floating menu.
 */
export function PlacementRowActions({ placementId, current, label }: { placementId: string; current: boolean; label: string }) {
  const base = `/crm/placements/${placementId}`;
  return <details className="row-actions">
    <summary aria-label={`Placement actions for ${label}`}>⋯</summary>
    <div className="row-actions-menu">
      <Link href={base}>View placement</Link>
      <Link href={`${base}#edit`}>Edit placement</Link>
      {current && <Link href={`${base}#end`}>End placement</Link>}
      <Link href={`${base}#remove`}>Remove incorrect placement</Link>
    </div>
  </details>;
}

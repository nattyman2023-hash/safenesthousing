/**
 * Public homepage metrics.
 *
 * The client-facing site must not invent quantitative claims. A metric is returned only when an
 * editor has saved a non-empty value for it; there are no fallback percentages, room counts or
 * response targets. Callers render nothing when the list is empty.
 */

export type PublicMetric = { value: string; label: string };

const METRIC_DEFINITIONS = [
  { key: 'homepage.stats.moveOn', label: 'move-on tenancies sustained at six months' },
  { key: 'homepage.stats.newRooms', label: 'new supported rooms opened this year' },
  { key: 'homepage.stats.responseTarget', label: 'our target for acknowledging referrals' }
] as const;

export function publicMetrics(settings: Record<string, string> | undefined | null): PublicMetric[] {
  if (!settings) return [];
  return METRIC_DEFINITIONS.flatMap(({ key, label }) => {
    const value = settings[key]?.trim();
    return value ? [{ value, label }] : [];
  });
}

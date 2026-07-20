import { nextStatusLabel } from '@/lib/domain';

export function StatusBadge({ status, tone }: { status: string; tone?: 'danger' | 'warning' | 'success' | 'neutral' }) {
  const inferred = tone ?? (status.includes('CLOSED') || status.includes('PLACED') || status.includes('AVAILABLE') ? 'success' : status.includes('HIGH') || status.includes('CRITICAL') ? 'danger' : status.includes('WAIT') || status.includes('REVIEW') || status.includes('PENDING') ? 'warning' : 'neutral');
  return <span className={`crm-badge badge-${inferred}`}><span className="badge-dot" />{nextStatusLabel(status)}</span>;
}

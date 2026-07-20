import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { runRetentionReview } from '@/lib/retention-review';

export async function POST() {
  try {
    const user = await requirePermission('governance.manage');
    const result = await runRetentionReview({ organisationId: user.organisationId, triggeredBy: user.id });
    return NextResponse.json({ ok: true, runId: result.run.id, summary: result.summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to run the retention review.' : message }, { status });
  }
}

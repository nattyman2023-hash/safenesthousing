import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { runTaskAutomation } from '@/lib/task-engine';

/** Runs the recurring support-work automation for the signed-in user's organisation. Idempotent, so
 * staff can press it as often as they like; the audit trail records what each run produced. */
export async function POST() {
  try {
    const user = await requireUser();
    const result = await runTaskAutomation({ organisationId: user.organisationId });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to run the work automation.' : message }, { status });
  }
}

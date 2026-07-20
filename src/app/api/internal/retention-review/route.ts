import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runRetentionReview } from '@/lib/retention-review';

function authorised(request: Request) {
  const expected = process.env.RETENTION_REVIEW_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: Request) {
  if (!process.env.RETENTION_REVIEW_SECRET) return NextResponse.json({ error: 'Retention review scheduler is not configured.' }, { status: 503 });
  if (!authorised(request)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  try {
    const organisations = await db.organisation.findMany({ where: { retentionRules: { some: { active: true } } }, select: { id: true } });
    const results = [];
    for (const organisation of organisations) results.push(await runRetentionReview({ organisationId: organisation.id }));
    return NextResponse.json({ ok: true, organisations: results.map((result) => ({ runId: result.run.id, organisationId: result.run.organisationId, summary: result.summary })) });
  } catch {
    return NextResponse.json({ error: 'Unable to run scheduled retention reviews.' }, { status: 500 });
  }
}

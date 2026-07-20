import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { searchCrmRecords } from '@/lib/crm-search';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const results = await searchCrmRecords(user, query);
    const counts = results.reduce<Record<string, number>>((current, result) => ({ ...current, [result.type]: (current[result.type] ?? 0) + 1 }), {});
    if (query.length >= 2) await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CRM_SEARCH_PERFORMED', resourceType: 'Search', after: { resultCount: results.length, resultTypes: counts } });
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to search CRM records.' : message }, { status });
  }
}

import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { getReportRows, reportDefinitions, reportHeaders, type ReportKey } from '@/lib/reports';
import { toCsv } from '@/lib/csv';

function isReportKey(value: string): value is ReportKey { return value in reportDefinitions; }

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const reportValue = new URL(request.url).searchParams.get('report') ?? '';
    if (!isReportKey(reportValue)) return NextResponse.json({ error: 'Choose a supported report.' }, { status: 400 });
    const rows = await getReportRows(user, reportValue);
    const headers = reportHeaders[reportValue];
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'REPORT_EXPORTED', resourceType: 'Report', resourceId: reportValue, after: { report: reportValue, rowCount: rows.length, headers } });
    const filename = `safe-nest-${reportValue}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(toCsv(headers, rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to export the report.' : message }, { status });
  }
}

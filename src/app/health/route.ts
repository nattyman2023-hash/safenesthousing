import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runtimeConfigChecks } from '@/lib/env';
import { mailAdapterStatus } from '@/lib/mail';
import { rateLimitAdapterStatus } from '@/lib/rate-limit';
import { storageAdapterStatus } from '@/lib/storage-status';

export async function GET() {
  let database = 'ok';
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }
  const runtime = runtimeConfigChecks();
  const ready = database === 'ok' && runtime.ready;
  return NextResponse.json({
    status: ready ? 'ok' : 'degraded',
    service: 'safe-nest',
    timestamp: new Date().toISOString(),
    checks: { database },
    runtime: { environment: runtime.environment, ready: runtime.ready, checks: runtime.checks, warnings: runtime.warnings },
    adapters: { email: mailAdapterStatus(), storage: storageAdapterStatus(), rateLimit: rateLimitAdapterStatus(), malwareScanner: { provider: process.env.MALWARE_SCAN_PROVIDER ?? 'disabled', configured: (process.env.MALWARE_SCAN_PROVIDER ?? 'disabled') === 'disabled' || (!!process.env.MALWARE_SCAN_URL && !!process.env.MALWARE_SCAN_TOKEN) } }
  }, { status: ready ? 200 : 503 });
}

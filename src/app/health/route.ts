import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runtimeConfigChecks } from '@/lib/env';
import { mailAdapterStatusWithStoredSecrets } from '@/lib/mail';
import { rateLimitAdapterStatus } from '@/lib/rate-limit';
import { storageAdapterStatus } from '@/lib/storage-status';
import { schemaStatus } from '@/lib/schema-status';

export async function GET() {
  let database = 'ok';
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }
  const schema = database === 'ok' ? await schemaStatus() : 'unknown';
  const email = await mailAdapterStatusWithStoredSecrets();
  const runtime = runtimeConfigChecks({ ...process.env, EMAIL_PROVIDER: email.provider }, { emailConfigured: email.configured });
  const ready = database === 'ok' && schema !== 'outdated' && runtime.ready;
  return NextResponse.json({
    status: ready ? 'ok' : 'degraded',
    service: 'safe-nest',
    timestamp: new Date().toISOString(),
    checks: { database, schema },
    runtime: { environment: runtime.environment, ready: runtime.ready, checks: runtime.checks, warnings: runtime.warnings },
    adapters: { email, storage: storageAdapterStatus(), rateLimit: rateLimitAdapterStatus(), malwareScanner: runtime.malware }
  }, { status: ready ? 200 : 503 });
}

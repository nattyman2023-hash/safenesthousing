import { db } from '@/lib/db';

/**
 * The newest schema markers, one per migration since the base schema. Mirrors the checks in
 * scripts/migrate-local.mjs so /health can say whether the live database matches this release
 * without anyone needing shell access to the server. Only table/column names are inspected —
 * never row data.
 */
const REQUIRED_COLUMNS: Array<[table: string, column: string]> = [
  ['UserSession', 'mfaVerifiedAt'],
  ['Document', 'sha256'],
  ['DataSubjectRequest', 'legalHold'],
  ['Client', 'phone'],
  ['Client', 'supportWorkerId'],
  ['Document', 'description'],
  ['Document', 'documentDate']
];

const REQUIRED_TABLES = ['MfaRecoveryCode', 'DataRetentionReviewRun', 'OrganisationSecret', 'RelatedPerson', 'ClientRelationship', 'Concern', 'Complaint', 'MaintenanceTicket', 'Appointment', 'RiskAssessment', 'SafeWellCheck'];

export type SchemaStatus = 'ok' | 'outdated' | 'unknown';

export async function schemaStatus(): Promise<SchemaStatus> {
  if (!(process.env.DATABASE_URL ?? 'file:').startsWith('file:')) return 'unknown';
  try {
    const tables = new Set((await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row) => String(row.name)));
    if (REQUIRED_TABLES.some((table) => !tables.has(table))) return 'outdated';
    const columnCache = new Map<string, Set<string>>();
    for (const [table, column] of REQUIRED_COLUMNS) {
      if (!tables.has(table)) return 'outdated';
      if (!columnCache.has(table)) {
        const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
        columnCache.set(table, new Set(rows.map((row) => String(row.name))));
      }
      if (!columnCache.get(table)!.has(column)) return 'outdated';
    }
    return 'ok';
  } catch {
    return 'unknown';
  }
}

import { PrismaClient } from '@prisma/client';

/**
 * Database access for the zero-service acceptance suite.
 *
 * Two rules matter more than convenience here:
 *
 *  1. This client must point at a DISPOSABLE acceptance database. It refuses to run against
 *     anything else, so a mistaken invocation can never read or write `prisma/dev.db`, and can
 *     never reach a production database.
 *  2. Prisma is used only to prove what a UI action persisted, and to count rows before the first
 *     UI action. No record the suite asserts on is created by Prisma — a service that appears
 *     because a fixture inserted it would invalidate the whole exercise.
 */
const url = process.env.ACCEPTANCE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url || !/^file:\.\/acceptance-(zero|populated)\.db$/.test(url)) {
  throw new Error(`Refusing to run the acceptance suite against "${url ?? 'no DATABASE_URL'}". Start it with "node scripts/acceptance/run.mjs test ...", which points the suite at a disposable acceptance database.`);
}

export const prisma = new PrismaClient({ datasources: { db: { url } } });

/** Throwaway credentials for the throwaway database, supplied by scripts/acceptance/run.mjs. */
export const ADMIN_EMAIL = process.env.ACCEPTANCE_ADMIN_EMAIL ?? 'admin@safenesthousing.co.uk';
export const ADMIN_PASSWORD = process.env.ACCEPTANCE_ADMIN_PASSWORD ?? '';

if (!ADMIN_PASSWORD) {
  throw new Error('ACCEPTANCE_ADMIN_PASSWORD was not supplied. Start the suite with "node scripts/acceptance/run.mjs test ...".');
}

/** Raw row counts, so the "zero services" assertion is a database fact rather than a Prisma-model
 * interpretation. `SELECT COUNT(*) FROM Service = 0` is the evidence the release decision rests on. */
export async function tableCount(table: string): Promise<number> {
  if (!/^[A-Za-z]+$/.test(table)) throw new Error(`Refusing to interpolate "${table}" into a query.`);
  const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${table}"`) as { count: number | bigint }[];
  return Number(rows[0]?.count ?? 0);
}

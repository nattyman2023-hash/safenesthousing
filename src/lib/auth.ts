import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';

export const SESSION_COOKIE = 'safe_nest_session';

/** Assessment-build access model: a single, predictable authentication state.
 *
 * Authenticated = complete, unrestricted access to every CRM module and API.
 *
 * The previous layered flow (login -> MFA -> role -> permission -> presentation
 * mode -> page gate -> API gate) has been removed. MFA, RBAC permission gates,
 * role checks, service/property scoping and restricted-record gating no longer
 * participate in the active flow. Login (bcrypt password + a hashed session
 * cookie) remains the only access boundary, so there is one predictable state:
 * signed in = full access; signed out = redirected to /staff/login.
 *
 * Fundamental engineering protections are intentionally retained: passwords are
 * still bcrypt-hashed, sessions are still httpOnly/same-site hashed tokens,
 * tenant organisation scoping stays in data queries, and all Zod validation,
 * audit logging, append-only case notes, money-as-minor-units and safe file
 * path handling remain in force. */
export function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function createSession(userId: string) {
  const raw = randomBytes(32).toString('hex');
  await db.userSession.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60 });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) await db.userSession.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentSession() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return db.userSession.findFirst({ where: { tokenHash: hashToken(raw), revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: { include: { memberships: { include: { role: true } } } } } }).catch(() => null);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session?.user.active) return null;
  return session.user;
}

export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }

// Assessment build: every authenticated user is unrestricted. These helpers are
// kept as authenticated-only aliases so call sites stay explicit and readable.
export function hasRole(_user: Awaited<ReturnType<typeof getCurrentUser>>, _roles: string[]) { return true; }
export function canViewRestricted(_user: Awaited<ReturnType<typeof getCurrentUser>>) { return true; }
export function getScopedIds(_user: Awaited<ReturnType<typeof getCurrentUser>>, _field: 'serviceIds' | 'propertyIds') { return [] as string[]; }
export function getScopedIdsFromMemberships(_memberships: Array<{ active: boolean; serviceIds: string; propertyIds: string[] | string }>, _field: 'serviceIds' | 'propertyIds') { return [] as string[]; }
export function hasScopedAccess(_memberships: Array<{ active: boolean; serviceIds: string; propertyIds: string[] | string }>, _field: 'serviceIds' | 'propertyIds', _id: string) { return true; }

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

export async function requireRole(_roles: string[]) { return requireUser(); }
export async function hasPermission(_user: Awaited<ReturnType<typeof getCurrentUser>>, _permissionKey: string) { return true; }
export async function requirePermission(_permissionKey: string) { return requireUser(); }
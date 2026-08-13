import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';

export const SESSION_COOKIE = 'safe_nest_session';
export const RESTRICTED_RECORD_ROLES = ['super-administrator', 'organisation-administrator', 'safeguarding-lead', 'service-manager', 'support-lead'];
export const MFA_REQUIRED_ROLES = ['super-administrator', 'organisation-administrator', 'safeguarding-lead', 'service-manager', 'support-lead'];

export function roleRequiresMfa(roleSlug: string) { return MFA_REQUIRED_ROLES.includes(roleSlug); }

/** Local-development convenience only — never has any effect in production regardless of the
 * env var, and is off by default even locally. Set DISABLE_MFA_FOR_DEV=true in .env to skip MFA
 * while testing the CRM locally. */
export function mfaBypassEnabled() {
  return process.env.MFA_ENABLED === 'false' || (process.env.NODE_ENV !== 'production' && process.env.DISABLE_MFA_FOR_DEV === 'true');
}

/** TESTING-ONLY escape hatch. When ENABLE_DEV_AUTH_BYPASS=true and NODE_ENV is not production,
 * every authentication, permission, role and scope check is disabled so the CRM can be explored
 * freely without login, MFA, or RBAC. This function returns FALSE unconditionally in production,
 * so the bypass can never activate in a live environment. */
export function devAuthBypassEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

export function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function createSession(userId: string, mfaVerified = true) {
  const raw = randomBytes(32).toString('hex');
  await db.userSession.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), mfaVerifiedAt: mfaVerified ? new Date() : undefined } });
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
  if (devAuthBypassEnabled()) {
    // Testing mode: return any active user (falling back to the first user) without MFA checks.
    if (session?.user?.active) return session.user;
    return db.user.findFirst({ where: { active: true }, include: { memberships: { include: { role: true } } }, orderBy: { createdAt: 'asc' } }).catch(() => null);
  }
  if (!session?.user.active) return null;
  if (mfaBypassEnabled()) return session.user;
  const privilegedRole = session.user.memberships.some((membership) => membership.active && roleRequiresMfa(membership.role.slug));
  if ((session.user.mfaRequired || privilegedRole) && !session.mfaVerifiedAt) return null;
  return session.user;
}

export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }

export function hasRole(user: Awaited<ReturnType<typeof getCurrentUser>>, roles: string[]) {
  return !!user?.memberships.some((membership) => membership.active && roles.includes(membership.role.slug));
}

export function canViewRestricted(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (devAuthBypassEnabled()) return true;
  return hasRole(user, RESTRICTED_RECORD_ROLES);
}

export function getScopedIds(user: Awaited<ReturnType<typeof getCurrentUser>>, field: 'serviceIds' | 'propertyIds') {
  if (devAuthBypassEnabled()) return [];
  return getScopedIdsFromMemberships(user?.memberships ?? [], field);
}

export function getScopedIdsFromMemberships(memberships: Array<{ active: boolean; serviceIds: string; propertyIds: string[] | string }>, field: 'serviceIds' | 'propertyIds') {
  const values = new Set<string>();
  for (const membership of memberships.filter((item) => item.active)) {
    const raw = membership[field];
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    // An empty/blank scope means "unrestricted" for that membership (e.g. organisation-wide roles).
    if (!text || text === '[]') continue;
    try {
      const ids = JSON.parse(text) as unknown;
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string' && id) values.add(id);
    } catch {
      // Fail closed: a malformed scope must never widen access. In production this is a hard
      // configuration error; surface it rather than silently granting unrestricted access.
      if (process.env.NODE_ENV === 'production') throw new Error('MALFORMED_ACCESS_SCOPE');
    }
  }
  return [...values];
}

export function hasScopedAccess(memberships: Array<{ active: boolean; serviceIds: string; propertyIds: string[] | string }>, field: 'serviceIds' | 'propertyIds', id: string) {
  if (devAuthBypassEnabled()) return true;
  const ids = getScopedIdsFromMemberships(memberships, field);
  return ids.length === 0 || ids.includes(id);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!hasRole(user, roles)) throw new Error('FORBIDDEN');
  return user;
}

export async function hasPermission(user: Awaited<ReturnType<typeof getCurrentUser>>, permissionKey: string) {
  if (devAuthBypassEnabled()) return true;
  if (!user) return false;
  if (user.memberships.some((membership) => membership.active && membership.role.slug === 'super-administrator')) return true;
  const memberships = await db.membership.findMany({
    where: { userId: user.id, active: true },
    include: { role: { include: { permissions: { include: { permission: true } } } } }
  }).catch(() => null);
  return (memberships ?? []).some((membership) => membership.role.permissions.some((entry) => entry.permission.key === permissionKey));
}

export async function requirePermission(permissionKey: string) {
  const user = await requireUser();
  if (!(await hasPermission(user, permissionKey))) throw new Error('FORBIDDEN');
  return user;
}

import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';

export const SESSION_COOKIE = 'safe_nest_session';

/** The assessment access model has one application boundary: a valid session.
 *
 * A signed-in user can use every CRM page and API in their organisation. The
 * session is still a real server-side record backed by a hashed random token;
 * password hashing, validation, audit logging, organisation scoping, append-only
 * notes, minor-unit money, and private file handling remain active. */
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
  return db.userSession.findFirst({
    where: { tokenHash: hashToken(raw), revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, organisationId: true, email: true, name: true, passwordHash: true, jobTitle: true, active: true, createdAt: true, updatedAt: true } }
    }
  }).catch(() => null);
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session?.user.active) return null;
  return session.user;
}

export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

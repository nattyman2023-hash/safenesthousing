import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './env';
import { hashToken } from './auth';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const recoveryAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MFA_RECOVERY_CODE_COUNT = 10;

function encryptionKey() { return createHash('sha256').update(config.authSecret).digest(); }

export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptMfaSecret(value: string) {
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid MFA secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}

export function generateMfaSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let secret = '';
  for (let index = 0; index < bits.length; index += 5) secret += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return secret;
}

function decodeBase32(value: string) {
  const bits = value.replace(/=+$/g, '').toUpperCase().split('').map((character) => { const index = alphabet.indexOf(character); if (index < 0) throw new Error('Invalid MFA secret.'); return index.toString(2).padStart(5, '0'); }).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function createTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((offset) => { const expected = Buffer.from(createTotpCode(secret, timestamp + offset * 30_000)); const received = Buffer.from(code); return expected.length === received.length && timingSafeEqual(expected, received); });
}

export function buildOtpAuthUri(secret: string, email: string) {
  return `otpauth://totp/Safe%20Nest:${encodeURIComponent(email)}?secret=${secret}&issuer=Safe%20Nest&algorithm=SHA1&digits=6&period=30`;
}

export function normaliseRecoveryCode(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isRecoveryCode(value: string) {
  return /^[A-HJ-NP-Z2-9]{10}$/.test(normaliseRecoveryCode(value));
}

export function hashRecoveryCode(value: string) {
  return hashToken(normaliseRecoveryCode(value));
}

export function generateRecoveryCode() {
  const bytes = randomBytes(10);
  const value = [...bytes].map((byte) => recoveryAlphabet[byte & 31]).join('');
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

export function generateRecoveryCodes(count = MFA_RECOVERY_CODE_COUNT) {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

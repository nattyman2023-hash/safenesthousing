import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './env';

function encryptionKey() {
  return createHash('sha256').update(config.authSecret).digest();
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}

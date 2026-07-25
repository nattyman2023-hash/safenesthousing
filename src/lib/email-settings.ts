import { db } from './db';
import { decryptSecret } from './secrets';

export const EMAILIT_API_KEY_SETTING = 'emailit.apiKey';

export async function getStoredEmailitApiKey(organisationId: string) {
  const record = await db.organisationSecret.findUnique({ where: { organisationId_key: { organisationId, key: EMAILIT_API_KEY_SETTING } } });
  return record ? decryptSecret(record.secretCipher) : undefined;
}

export async function hasStoredEmailitApiKey(organisationId: string) {
  const record = await db.organisationSecret.findUnique({ where: { organisationId_key: { organisationId, key: EMAILIT_API_KEY_SETTING } }, select: { id: true } });
  return !!record;
}

export async function hasAnyStoredEmailitApiKey() {
  return (await db.organisationSecret.count({ where: { key: EMAILIT_API_KEY_SETTING } })) > 0;
}

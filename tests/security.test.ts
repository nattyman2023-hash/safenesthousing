import { describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { caseNoteSchema, dataSubjectRequestCreateSchema, dataSubjectRequestUpdateSchema, housingBenefitUpdateSchema, invoiceCreateSchema, newsContentSchema, paymentSchema, placementCreateSchema, referralAssignmentSchema, retentionRuleCreateSchema, serviceContentSchema, siteSettingsUpdateSchema, userAccessUpdateSchema, userInviteSchema } from '@/lib/crm-validation';
import { readPrivateDocument, removePrivateDocument, sanitiseDisplayName, scanDocument, sha256Bytes, storageAdapterStatus, storePrivateDocument, validateDocumentUpload } from '@/lib/storage';
import { internalReferralSchema } from '@/lib/crm-validation';
import { createTotpCode, decryptMfaSecret, encryptMfaSecret, generateRecoveryCodes, hashRecoveryCode, isRecoveryCode, verifyTotpCode } from '@/lib/mfa';
import { canViewRestricted, getScopedIds, hasScopedAccess, roleRequiresMfa } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { runtimeConfigChecks } from '@/lib/env';
import { getClientIp, rateLimit, rateLimitAdapterStatus } from '@/lib/rate-limit';
import { mailAdapterStatus } from '@/lib/mail';
import { mfaCodeSchema } from '@/lib/mfa-validation';
import { isRetentionDue, parseRetentionReviewSummary } from '@/lib/retention-review';

describe('protected data validation', () => {
  it('normalises restricted case-note form values', () => {
    const result = caseNoteSchema.safeParse({ contactType: 'Key work', category: 'Housing', note: 'A sufficiently detailed case note.', restricted: 'on' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.restricted).toBe(true);
  });

  it('keeps the internal referral risk level in the validated payload', () => {
    const result = internalReferralSchema.safeParse({ personName: 'A. Morgan', serviceId: 'svc', referrerName: 'J. Whitfield', referrerEmail: 'j@example.test', risk: 'High', currentLocation: 'Temporary accommodation', housingSituation: 'Housing has broken down and a safe place is needed.', supportNeeds: 'Tenancy support and a stable home.' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.risk).toBe('High');
  });

  it('removes path characters from document display names', () => {
    expect(sanitiseDisplayName('../private\\case note.pdf')).toBe('.privatecase note.pdf');
  });

  it('rejects a file with a mismatched extension', () => {
    expect(() => validateDocumentUpload(new File(['hello'], 'note.pdf', { type: 'text/plain' }))).toThrow('Unsupported file type');
  });

  it('hashes and records locally skipped document scans without writing file contents to metadata', async () => {
    const previousProvider = process.env.MALWARE_SCAN_PROVIDER;
    const previousRequired = process.env.REQUIRE_MALWARE_SCAN;
    process.env.MALWARE_SCAN_PROVIDER = 'disabled';
    delete process.env.REQUIRE_MALWARE_SCAN;
    try {
      const bytes = Buffer.from('Safe Nest test document');
      const result = await scanDocument(bytes, { displayName: 'note.txt', mimeType: 'text/plain', sha256: sha256Bytes(bytes) });
      expect(result.status).toBe('SKIPPED');
      expect(result.sha256).toHaveLength(64);
      expect(result).not.toHaveProperty('contents');
    } finally {
      if (previousProvider === undefined) delete process.env.MALWARE_SCAN_PROVIDER; else process.env.MALWARE_SCAN_PROVIDER = previousProvider;
      if (previousRequired === undefined) delete process.env.REQUIRE_MALWARE_SCAN; else process.env.REQUIRE_MALWARE_SCAN = previousRequired;
    }
  });

  it('verifies TOTP codes with clock skew tolerance and encrypted secrets', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const code = createTotpCode(secret, 59_000);
    expect(code).toBe('287082');
    expect(verifyTotpCode(secret, code, 59_000)).toBe(true);
    expect(verifyTotpCode(secret, code, 60_000)).toBe(true);
    expect(decryptMfaSecret(encryptMfaSecret(secret))).toBe(secret);
  });

  it('generates one-time recovery codes without exposing their stored representation', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => isRecoveryCode(code))).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: codes[0] }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].replace('-', '')));
    expect(roleRequiresMfa('organisation-administrator')).toBe(true);
    expect(roleRequiresMfa('support-worker')).toBe(false);
  });

  it('combines active membership scopes and keeps restricted roles explicit', () => {
    const user = { memberships: [{ active: true, role: { slug: 'support-worker' }, serviceIds: '["svc-a"]', propertyIds: '["prop-a"]' }, { active: false, role: { slug: 'safeguarding-lead' }, serviceIds: '["svc-b"]', propertyIds: '[]' }] } as never;
    expect(getScopedIds(user, 'serviceIds')).toEqual(['svc-a']);
    expect(getScopedIds(user, 'propertyIds')).toEqual(['prop-a']);
    expect(canViewRestricted(user)).toBe(false);
  });

  it('keeps finance payloads in integer minor units and rejects overbroad values', () => {
    expect(housingBenefitUpdateSchema.safeParse({ status: 'IN_PAYMENT', paymentStatus: 'IN_PAYMENT', weeklyRentMinor: 18500, serviceChargeMinor: 2500 }).success).toBe(true);
    expect(invoiceCreateSchema.safeParse({ reference: 'SN-INV-001', items: [{ description: 'Rent', quantity: 1, unitMinor: 18500 }] }).success).toBe(true);
    expect(paymentSchema.safeParse({ amountMinor: 0, paidAt: '2026-07-19', method: 'CASH' }).success).toBe(false);
    expect(invoiceCreateSchema.safeParse({ reference: 'bad reference', items: [{ description: 'Rent', quantity: 1, unitMinor: 18500 }] }).success).toBe(false);
  });

  it('escapes CSV values and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['Name', 'Note'], [{ Name: '=1+1', Note: 'She said "hello"' }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"She said ""hello"""');
  });

  it('validates placement and user administration payloads', () => {
    expect(placementCreateSchema.safeParse({ clientId: 'client', propertyId: 'property', roomId: 'room', startDate: '2026-08-01' }).success).toBe(true);
    expect(userInviteSchema.safeParse({ name: 'New Staff', email: 'staff@example.test', roleSlug: 'support-worker' }).success).toBe(true);
    const update = userAccessUpdateSchema.safeParse({ active: 'false', roleSlug: 'support-worker' });
    expect(update.success).toBe(true);
    if (update.success) expect(update.data.active).toBe(false);
  });

  it('validates referral assignment and respects service scope', () => {
    expect(referralAssignmentSchema.safeParse({ assignedToId: 'user-1' }).success).toBe(true);
    expect(referralAssignmentSchema.safeParse({ assignedToId: '' }).success).toBe(false);
    const scoped = [{ active: true, serviceIds: '["svc-a"]', propertyIds: '[]' }];
    expect(hasScopedAccess(scoped, 'serviceIds', 'svc-a')).toBe(true);
    expect(hasScopedAccess(scoped, 'serviceIds', 'svc-b')).toBe(false);
    expect(hasScopedAccess([{ active: true, serviceIds: '[]', propertyIds: '[]' }], 'serviceIds', 'svc-b')).toBe(true);
  });

  it('validates public settings and publishable content payloads', () => {
    expect(siteSettingsUpdateSchema.safeParse({ settings: [{ key: 'homepage.headline', value: 'A safer next step.' }] }).success).toBe(true);
    expect(serviceContentSchema.safeParse({ title: 'Housing support', summary: 'A useful service summary.', content: 'Longer service content for the public page.', audience: 'People who need housing support.', referralRoutes: 'Professional referrals are welcome.', eligibility: 'We discuss eligibility with each person.', supportModel: 'Person-led support.', published: 'on' }).success).toBe(true);
    expect(newsContentSchema.safeParse({ title: 'A public update', summary: 'A sufficiently detailed public summary.', content: 'A sufficiently detailed public news article.', authorName: 'Safe Nest team', published: false }).success).toBe(true);
  });

  it('requires approved retention basis and resolution notes', () => {
    expect(retentionRuleCreateSchema.safeParse({ resourceType: 'Client', retentionDays: 365, legalBasisNote: 'Approved safeguarding policy 4.2', active: true }).success).toBe(true);
    expect(retentionRuleCreateSchema.safeParse({ resourceType: 'Client', retentionDays: 0, legalBasisNote: 'No policy' }).success).toBe(false);
    expect(dataSubjectRequestCreateSchema.safeParse({ requestType: 'ACCESS', subjectRef: 'SN-C-001', legalHold: true }).success).toBe(true);
    expect(dataSubjectRequestUpdateSchema.safeParse({ status: 'COMPLETED', legalHold: false, notes: 'Completed after authorised review.' }).success).toBe(true);
    expect(dataSubjectRequestUpdateSchema.safeParse({ status: 'COMPLETED', legalHold: false, notes: 'Done' }).success).toBe(false);
  });

  it('keeps future per-record retention dates out of dry-run candidates', () => {
    const now = new Date('2026-07-19T00:00:00.000Z');
    expect(isRetentionDue(new Date('2025-01-01T00:00:00.000Z'), 30, now)).toBe(true);
    expect(isRetentionDue(new Date('2025-01-01T00:00:00.000Z'), 30, now, new Date('2026-08-01T00:00:00.000Z'))).toBe(false);
    expect(parseRetentionReviewSummary(JSON.stringify({ mode: 'DRY_RUN', rules: [] }))).not.toBeNull();
    expect(parseRetentionReviewSummary('{bad json')).toBeNull();
  });

  it('bounds request throttling and resolves the first forwarded client address', async () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.4' });
    expect(getClientIp({ headers })).toBe('203.0.113.9');
    const key = `security-test-${Date.now()}`;
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    const limited = await rateLimit(key, 2, 60_000);
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfter).toBeGreaterThan(0);
  });

  it('exposes explicit adapter status and supports an HTTP rate-limit backend', async () => {
    expect(storageAdapterStatus({ STORAGE_PROVIDER: 'local' }).configured).toBe(true);
    expect(storageAdapterStatus({ STORAGE_PROVIDER: 's3' }).configured).toBe(false);
    expect(storageAdapterStatus({ STORAGE_PROVIDER: 's3', STORAGE_REGION: 'eu-west-2', STORAGE_BUCKET: 'safe-nest', STORAGE_ACCESS_KEY: 'access', STORAGE_SECRET_KEY: 'credential' }).configured).toBe(true);
    expect(mailAdapterStatus({ SMTP_HOST: 'smtp.example', SMTP_PORT: '587' }).configured).toBe(true);
    expect(rateLimitAdapterStatus({ RATE_LIMIT_PROVIDER: 'http', RATE_LIMIT_URL: 'https://limit.example/check', RATE_LIMIT_TOKEN: 'token' }).configured).toBe(true);
    expect(rateLimitAdapterStatus({ RATE_LIMIT_PROVIDER: 'redis' }).configured).toBe(false);
    const previousProvider = process.env.RATE_LIMIT_PROVIDER;
    const previousUrl = process.env.RATE_LIMIT_URL;
    const previousToken = process.env.RATE_LIMIT_TOKEN;
    const previousFetch = globalThis.fetch;
    process.env.RATE_LIMIT_PROVIDER = 'http';
    process.env.RATE_LIMIT_URL = 'https://limit.example/check';
    process.env.RATE_LIMIT_TOKEN = 'token';
    globalThis.fetch = (async () => new Response(JSON.stringify({ allowed: false, retryAfter: 9 }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    try { expect(await rateLimit(`http-test-${Date.now()}`, 2, 60_000)).toEqual({ allowed: false, retryAfter: 9 }); } finally {
      if (previousProvider === undefined) delete process.env.RATE_LIMIT_PROVIDER; else process.env.RATE_LIMIT_PROVIDER = previousProvider;
      if (previousUrl === undefined) delete process.env.RATE_LIMIT_URL; else process.env.RATE_LIMIT_URL = previousUrl;
      if (previousToken === undefined) delete process.env.RATE_LIMIT_TOKEN; else process.env.RATE_LIMIT_TOKEN = previousToken;
      globalThis.fetch = previousFetch;
    }
  });

  it('keeps S3 object writes private and preserves the scan-before-write flow', async () => {
    const environmentKeys = ['STORAGE_PROVIDER', 'STORAGE_REGION', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'STORAGE_ENDPOINT', 'STORAGE_FORCE_PATH_STYLE', 'MALWARE_SCAN_PROVIDER', 'REQUIRE_MALWARE_SCAN'] as const;
    const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    const bytes = Buffer.from('S3 adapter test document');
    const sentCommands: string[] = [];
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
      sentCommands.push(command.constructor.name);
      if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => Uint8Array.from(bytes) } } as never;
      return {} as never;
    });
    Object.assign(process.env, { STORAGE_PROVIDER: 's3', STORAGE_REGION: 'eu-west-2', STORAGE_BUCKET: 'safe-nest', STORAGE_ACCESS_KEY: 'access', STORAGE_SECRET_KEY: 'credential', STORAGE_ENDPOINT: 'https://objects.example', STORAGE_FORCE_PATH_STYLE: 'true', MALWARE_SCAN_PROVIDER: 'disabled' });
    delete process.env.REQUIRE_MALWARE_SCAN;
    try {
      const stored = await storePrivateDocument(new File([bytes], 'note.txt', { type: 'text/plain' }));
      expect(stored.malwareScanStatus).toBe('SKIPPED');
      expect(await readPrivateDocument(stored.storageKey)).toEqual(bytes);
      await removePrivateDocument(stored.storageKey);
      expect(sentCommands).toEqual(['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand']);
    } finally {
      send.mockRestore();
      for (const key of environmentKeys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });

  it('fails closed for missing production SMTP and unsupported storage providers', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSmtpHost = process.env.SMTP_HOST;
    const previousSmtpPort = process.env.SMTP_PORT;
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    const { sendSafeEmail } = await import('@/lib/mail');
    await expect(sendSafeEmail({ to: 'test@example.test', subject: 'Test', text: 'Test', html: '<p>Test</p>' })).rejects.toThrow('SMTP_NOT_CONFIGURED');
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousSmtpHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = previousSmtpHost;
    if (previousSmtpPort === undefined) delete process.env.SMTP_PORT; else process.env.SMTP_PORT = previousSmtpPort;
    expect(runtimeConfigChecks({ NODE_ENV: 'production', STORAGE_PROVIDER: 's3' }).ready).toBe(false);
  });

  it('rejects unsafe production configuration while allowing a single-instance limiter with a warning', () => {
    const base = { NODE_ENV: 'production', APP_URL: 'https://safe-nest.example', DATABASE_URL: 'file:./prod.db', AUTH_SECRET: 'a'.repeat(40), FILE_SIGNING_SECRET: 'b'.repeat(40), RETENTION_REVIEW_SECRET: 'c'.repeat(40), SMTP_HOST: 'smtp.example', SMTP_PORT: '587', RATE_LIMIT_PROVIDER: 'memory', MALWARE_SCAN_PROVIDER: 'http', MALWARE_SCAN_URL: 'https://scanner.example/scan', MALWARE_SCAN_TOKEN: 'scanner-token' };
    const ready = runtimeConfigChecks(base);
    expect(ready.ready).toBe(true);
    expect(ready.warnings).toHaveLength(2);
    expect(ready.warnings.some((warning) => warning.includes('RATE_LIMIT_PROVIDER'))).toBe(true);
    expect(ready.warnings.some((warning) => warning.includes('STORAGE_PROVIDER'))).toBe(true);
    expect(runtimeConfigChecks({ ...base, APP_URL: 'http://safe-nest.example' }).ready).toBe(false);
    expect(runtimeConfigChecks({ ...base, AUTH_SECRET: 'replace-with-a-secret' }).ready).toBe(false);
    expect(runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'disabled' }).ready).toBe(false);
    expect(runtimeConfigChecks({ ...base, RETENTION_REVIEW_SECRET: 'short' }).ready).toBe(false);
  });
});

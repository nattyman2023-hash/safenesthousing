import { describe, expect, it } from 'vitest';
import { runtimeConfigChecks } from '@/lib/env';

/**
 * Readiness reporting must be truthful: a scanner that is not configured may never be printed as
 * `CONFIGURED`/`OK`, while the secure `REQUIRE_MALWARE_SCAN=true` path must still fail closed.
 */

const base: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  APP_URL: 'https://safe-nest.example',
  DATABASE_URL: 'file:./prod.db',
  AUTH_SECRET: 'a'.repeat(40),
  FILE_SIGNING_SECRET: 'b'.repeat(40),
  RETENTION_REVIEW_SECRET: 'c'.repeat(40),
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example',
  SMTP_PORT: '587',
  STORAGE_PROVIDER: 's3',
  STORAGE_REGION: 'eu-west-2',
  STORAGE_BUCKET: 'safe-nest-private',
  STORAGE_ACCESS_KEY: 'access-key',
  STORAGE_SECRET_KEY: 'storage-key',
  RATE_LIMIT_PROVIDER: 'http',
  RATE_LIMIT_URL: 'https://limiter.example/check',
  RATE_LIMIT_TOKEN: 'limiter-token'
};

function checkFor(result: ReturnType<typeof runtimeConfigChecks>, name: string) {
  const check = result.checks.find((entry) => entry.name === name);
  if (!check) throw new Error(`Expected a readiness check named ${name}`);
  return check;
}

describe('readiness reporting is truthful about the malware scanner', () => {
  it('reports a disabled scanner as NOT REQUIRED, never CONFIGURED, when enforcement is off', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'disabled' });
    expect(result.ready).toBe(true);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER')).toMatchObject({ ok: true, status: 'not-required' });
    expect(result.malware).toMatchObject({ provider: 'disabled', required: false, configured: false, enforced: false, state: 'not-configured' });
    expect(result.warnings.some((warning) => warning.includes('Malware scanning is not enforced'))).toBe(true);
    // No credential checks imply a URL/token is configured when the scanner is disabled.
    expect(result.checks.map((check) => check.name)).not.toContain('MALWARE_SCAN_URL');
    expect(result.checks.map((check) => check.name)).not.toContain('MALWARE_SCAN_TOKEN');
    expect(result.checks.every((check) => ['configured', 'not-configured', 'not-required'].includes(check.status))).toBe(true);
  });

  it('treats an absent provider and an absent REQUIRE flag as not enforced', () => {
    const result = runtimeConfigChecks(base);
    expect(result.ready).toBe(true);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER').status).toBe('not-required');
    expect(result.malware.required).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('Malware scanning is not enforced'))).toBe(true);
  });

  it('fails readiness when enforcement is on and the provider is disabled', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'disabled', REQUIRE_MALWARE_SCAN: 'true' });
    expect(result.ready).toBe(false);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER')).toMatchObject({ ok: false, status: 'not-configured' });
    expect(result.malware).toMatchObject({ required: true, configured: false, enforced: false });
    expect(result.warnings.some((warning) => warning.includes('MALWARE_SCAN_PROVIDER=disabled'))).toBe(true);
  });

  it('accepts a Cloudmersive API key without requiring a URL or token', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'cloudmersive', CLOUDMERSIVE_API_KEY: 'cm-test-key', REQUIRE_MALWARE_SCAN: 'true' });
    expect(result.ready).toBe(true);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER')).toMatchObject({ ok: true, status: 'configured' });
    expect(checkFor(result, 'CLOUDMERSIVE_API_KEY')).toMatchObject({ ok: true, status: 'configured' });
    expect(result.checks.some((check) => check.name === 'MALWARE_SCAN_URL' || check.name === 'MALWARE_SCAN_TOKEN')).toBe(false);
    expect(result.malware).toMatchObject({ provider: 'cloudmersive', configured: true, enforced: true, state: 'enforced' });
  });

  it('fails readiness when Cloudmersive is required without an API key', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'cloudmersive', CLOUDMERSIVE_API_KEY: '', REQUIRE_MALWARE_SCAN: 'true' });
    expect(result.ready).toBe(false);
    expect(checkFor(result, 'CLOUDMERSIVE_API_KEY')).toMatchObject({ ok: false, status: 'not-configured' });
    expect(result.warnings.some((warning) => warning.includes('CLOUDMERSIVE_API_KEY'))).toBe(true);
  });

  it('retains the URL and token requirements for the generic HTTP provider', () => {
    const configured = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'http', MALWARE_SCAN_URL: 'https://scanner.example/scan', MALWARE_SCAN_TOKEN: 'scanner-token', REQUIRE_MALWARE_SCAN: 'true' });
    expect(configured.ready).toBe(true);
    expect(configured.malware).toMatchObject({ provider: 'http', configured: true, enforced: true, state: 'enforced' });

    const missingToken = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'http', MALWARE_SCAN_URL: 'https://scanner.example/scan', REQUIRE_MALWARE_SCAN: 'true' });
    expect(missingToken.ready).toBe(false);
    expect(checkFor(missingToken, 'MALWARE_SCAN_TOKEN')).toMatchObject({ ok: false, status: 'not-configured' });

    const missingUrl = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'http', MALWARE_SCAN_TOKEN: 'scanner-token', REQUIRE_MALWARE_SCAN: 'true' });
    expect(missingUrl.ready).toBe(false);
    expect(checkFor(missingUrl, 'MALWARE_SCAN_URL')).toMatchObject({ ok: false, status: 'not-configured' });
  });

  it('reports configured but not enforced without claiming enforcement', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'http', MALWARE_SCAN_URL: 'https://scanner.example/scan', MALWARE_SCAN_TOKEN: 'scanner-token' });
    expect(result.ready).toBe(true);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER')).toMatchObject({ ok: true, status: 'configured' });
    expect(result.malware).toMatchObject({ configured: true, enforced: false, state: 'configured-not-enforced' });
    expect(result.warnings.some((warning) => warning.includes('Malware scanning is not enforced'))).toBe(true);
  });

  it('fails readiness for an unsupported provider when enforcement is on', () => {
    const result = runtimeConfigChecks({ ...base, MALWARE_SCAN_PROVIDER: 'clamav', REQUIRE_MALWARE_SCAN: 'true' });
    expect(result.ready).toBe(false);
    expect(checkFor(result, 'MALWARE_SCAN_PROVIDER')).toMatchObject({ ok: false, status: 'not-configured' });
    expect(result.warnings.some((warning) => warning.includes('not supported'))).toBe(true);
  });
});

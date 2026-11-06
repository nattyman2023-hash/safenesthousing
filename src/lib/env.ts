import { malwareScannerStatus } from './malware-scan';

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function hasStrongSecret(value: string | undefined) {
  return !!value && value.length >= 32 && !/(replace|change|development|local|secret)/i.test(value);
}

/**
 * Truthful readiness states. A check is `configured` only when its requirement is actually met,
 * `not-configured` when a required check is unmet, and `not-required` when policy does not demand it
 * (so an unconfigured optional integration never reads as `OK`).
 */
export type RuntimeCheckStatus = 'configured' | 'not-configured' | 'not-required';

export type RuntimeCheck = { name: string; ok: boolean; status: RuntimeCheckStatus };

function runtimeCheck(name: string, satisfied: boolean, required: boolean): RuntimeCheck {
  return {
    name,
    ok: !required || satisfied,
    status: satisfied ? 'configured' : required ? 'not-configured' : 'not-required'
  };
}

export function runtimeConfigChecks(environment: NodeJS.ProcessEnv = process.env, options: { emailConfigured?: boolean } = {}) {
  const production = environment.NODE_ENV === 'production';
  const emailProvider = environment.EMAIL_PROVIDER ?? (environment.EMAILIT_API_KEY ? 'emailit' : 'smtp');
  const scanner = malwareScannerStatus(environment);
  const scanningRequired = scanner.required;
  let appUrl: URL | null = null;
  try { appUrl = new URL(environment.APP_URL ?? ''); } catch { /* reported below */ }
  const emailReady = emailProvider === 'emailit' ? !!environment.EMAILIT_API_KEY || options.emailConfigured === true : emailProvider === 'smtp' && !!environment.SMTP_HOST && !!environment.SMTP_PORT;
  const checks: RuntimeCheck[] = [
    runtimeCheck('APP_URL', !!appUrl && appUrl.protocol === 'https:', production),
    runtimeCheck('DATABASE_URL', !!environment.DATABASE_URL, production),
    runtimeCheck('AUTH_SECRET', hasStrongSecret(environment.AUTH_SECRET), production),
    runtimeCheck('FILE_SIGNING_SECRET', hasStrongSecret(environment.FILE_SIGNING_SECRET), production),
    runtimeCheck('EMAIL', emailReady, production),
    runtimeCheck('STORAGE_PROVIDER', ['local', 's3'].includes(environment.STORAGE_PROVIDER ?? 'local'), production),
    runtimeCheck('STORAGE_BACKEND', (environment.STORAGE_PROVIDER ?? 'local') === 'local' || (!!environment.STORAGE_REGION && !!environment.STORAGE_BUCKET && !!environment.STORAGE_ACCESS_KEY && !!environment.STORAGE_SECRET_KEY), production),
    runtimeCheck('RATE_LIMIT_PROVIDER', ['memory', 'http'].includes(environment.RATE_LIMIT_PROVIDER ?? 'memory'), production),
    runtimeCheck('RATE_LIMIT_BACKEND', (environment.RATE_LIMIT_PROVIDER ?? 'memory') === 'memory' || (!!environment.RATE_LIMIT_URL && !!environment.RATE_LIMIT_TOKEN), production),
    // A disabled scanner is never `configured`: it has no scanner to reach. It is only `not-required`
    // while enforcement is off, and it fails readiness outright once enforcement is on.
    runtimeCheck('MALWARE_SCAN_PROVIDER', scanner.supported && scanner.provider !== 'disabled', scanningRequired)
  ];
  if (scanner.provider === 'http') {
    checks.push(runtimeCheck('MALWARE_SCAN_URL', !!environment.MALWARE_SCAN_URL, scanningRequired));
    checks.push(runtimeCheck('MALWARE_SCAN_TOKEN', !!environment.MALWARE_SCAN_TOKEN, scanningRequired));
  } else if (scanner.provider === 'cloudmersive') {
    // Cloudmersive uses a fixed official endpoint, so no URL or token check applies.
    checks.push(runtimeCheck('CLOUDMERSIVE_API_KEY', !!environment.CLOUDMERSIVE_API_KEY, scanningRequired));
  }
  checks.push(runtimeCheck('RETENTION_REVIEW_SECRET', hasStrongSecret(environment.RETENTION_REVIEW_SECRET), production));

  const warnings: string[] = [];
  if (production && (environment.RATE_LIMIT_PROVIDER ?? 'memory') === 'memory') warnings.push('RATE_LIMIT_PROVIDER=memory is suitable only for a single application instance; use the HTTP provider before horizontal scaling.');
  if (production && (environment.STORAGE_PROVIDER ?? 'local') === 'local') warnings.push('STORAGE_PROVIDER=local requires a persistent private filesystem and a single application instance; use S3-compatible object storage for multiple instances.');
  if (production && !scanningRequired) warnings.push('Malware scanning is not enforced: REQUIRE_MALWARE_SCAN is not true. Uploads are stored as SKIPPED and downloads are not gated.');
  if (production && scanningRequired && scanner.provider === 'disabled') warnings.push('Malware scanning is required but MALWARE_SCAN_PROVIDER=disabled; document uploads will be refused.');
  if (production && scanningRequired && !scanner.supported) warnings.push(`MALWARE_SCAN_PROVIDER=${scanner.provider} is not supported; document uploads will be refused.`);
  if (production && scanningRequired && scanner.supported && !scanner.configured) {
    const missing = scanner.provider === 'cloudmersive' ? 'CLOUDMERSIVE_API_KEY' : 'MALWARE_SCAN_URL and MALWARE_SCAN_TOKEN';
    warnings.push(`Malware scanning is required but ${missing} is not configured; document uploads will be refused.`);
  }

  return {
    environment: production ? 'production' : 'development',
    production,
    ready: checks.every((check) => check.ok),
    checks,
    warnings,
    malware: scanner
  };
}

export const config = {
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  authSecret: process.env.AUTH_SECRET ?? 'local-development-secret-change-this-please',
  fileSigningSecret: process.env.FILE_SIGNING_SECRET ?? 'local-file-signing-secret-change-this',
  emailFrom: process.env.EMAIL_FROM ?? 'Safe Nest <hello@safenesthousing.org.uk>',
  timezone: process.env.ORGANISATION_TIMEZONE ?? 'Europe/London'
};


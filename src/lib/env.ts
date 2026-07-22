export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function hasStrongSecret(value: string | undefined) {
  return !!value && value.length >= 32 && !/(replace|change|development|local|secret)/i.test(value);
}

export function runtimeConfigChecks(environment: NodeJS.ProcessEnv = process.env) {
  const production = environment.NODE_ENV === 'production';
  const emailProvider = environment.EMAIL_PROVIDER ?? (environment.EMAILIT_API_KEY ? 'emailit' : 'smtp');
  const malwareProvider = environment.MALWARE_SCAN_PROVIDER ?? 'disabled';
  const malwareScanRequired = production || environment.REQUIRE_MALWARE_SCAN === 'true';
  let appUrl: URL | null = null;
  try { appUrl = new URL(environment.APP_URL ?? ''); } catch { /* reported below */ }
  const checks = [
    { name: 'APP_URL', ok: !production || (!!appUrl && appUrl.protocol === 'https:') },
    { name: 'DATABASE_URL', ok: !production || !!environment.DATABASE_URL },
    { name: 'AUTH_SECRET', ok: !production || hasStrongSecret(environment.AUTH_SECRET) },
    { name: 'FILE_SIGNING_SECRET', ok: !production || hasStrongSecret(environment.FILE_SIGNING_SECRET) },
    { name: 'EMAIL', ok: !production || (emailProvider === 'emailit' ? !!environment.EMAILIT_API_KEY : emailProvider === 'smtp' && !!environment.SMTP_HOST && !!environment.SMTP_PORT) },
    { name: 'STORAGE_PROVIDER', ok: !production || ['local', 's3'].includes(environment.STORAGE_PROVIDER ?? 'local') },
    { name: 'STORAGE_BACKEND', ok: !production || (environment.STORAGE_PROVIDER ?? 'local') === 'local' || (!!environment.STORAGE_REGION && !!environment.STORAGE_BUCKET && !!environment.STORAGE_ACCESS_KEY && !!environment.STORAGE_SECRET_KEY) },
    { name: 'RATE_LIMIT_PROVIDER', ok: !production || ['memory', 'http'].includes(environment.RATE_LIMIT_PROVIDER ?? 'memory') },
    { name: 'RATE_LIMIT_BACKEND', ok: !production || (environment.RATE_LIMIT_PROVIDER ?? 'memory') === 'memory' || (!!environment.RATE_LIMIT_URL && !!environment.RATE_LIMIT_TOKEN) },
    { name: 'MALWARE_SCANNER', ok: !malwareScanRequired || (malwareProvider === 'http' && !!environment.MALWARE_SCAN_URL && !!environment.MALWARE_SCAN_TOKEN) },
    { name: 'RETENTION_REVIEW_SECRET', ok: !production || hasStrongSecret(environment.RETENTION_REVIEW_SECRET) }
  ];
  const warnings = production && (environment.RATE_LIMIT_PROVIDER ?? 'memory') === 'memory'
    ? ['RATE_LIMIT_PROVIDER=memory is suitable only for a single application instance; use the HTTP provider before horizontal scaling.']
    : [];
  if (production && (environment.STORAGE_PROVIDER ?? 'local') === 'local') warnings.push('STORAGE_PROVIDER=local requires a persistent private filesystem and a single application instance; use S3-compatible object storage for multiple instances.');
  if (malwareScanRequired && malwareProvider === 'disabled') warnings.push('Malware scanning is required for this environment but MALWARE_SCAN_PROVIDER=disabled.');
  if (production && environment.MFA_ENABLED === 'false') warnings.push('MFA is explicitly disabled for this environment; re-enable MFA before handling real staff or resident records.');
  if (production && environment.DISABLE_MFA_FOR_DEV === 'true') warnings.push('DISABLE_MFA_FOR_DEV is set but has no effect in production — MFA remains enforced for privileged roles.');
  return { environment: production ? 'production' : 'development', production, ready: checks.every((check) => check.ok), checks, warnings };
}

export const config = {
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  authSecret: process.env.AUTH_SECRET ?? 'local-development-secret-change-this-please',
  fileSigningSecret: process.env.FILE_SIGNING_SECRET ?? 'local-file-signing-secret-change-this',
  emailFrom: process.env.EMAIL_FROM ?? 'Safe Nest <hello@safenesthousing.org.uk>',
  timezone: process.env.ORGANISATION_TIMEZONE ?? 'Europe/London'
};

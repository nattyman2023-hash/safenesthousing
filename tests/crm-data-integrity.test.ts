import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmDataUnavailableError } from '@/lib/crm-errors';
import { getCrmClients, getCrmIncidents, getCrmProperties, getCrmProperty, getCrmReferrals, getCrmTasks } from '@/lib/data';

/**
 * Regression tests for the production-data integrity defects found in the audit.
 *
 * Every loader below used to return fictional operational records when its query failed, and the
 * CRM property page used to read the public marketing loader, which falls back to five illustrative
 * homes on an empty Property table. These tests pin the corrected contract:
 *
 *   - an empty table is `[]` (a truthful empty register), never a fixture;
 *   - a failed query throws `CrmDataUnavailableError`, never a fixture;
 *   - no environment variable can switch fixtures back on;
 *   - the marketing fallbacks are not reachable from CRM loaders.
 */

const { models } = vi.hoisted(() => {
  const modelNames = [
    'client', 'referral', 'incident', 'task', 'property', 'room', 'service', 'user', 'supportPlan',
    'housingBenefitClaim', 'appointment', 'maintenanceTicket', 'concern', 'complaint', 'policyResource',
    'propertyComplianceRecord', 'placement', 'rotaShift', 'caseNote', 'safeWellCheck', 'moveChecklist',
    'document', 'siteSetting', 'occupancyRecord', 'newsPost'
  ];
  const models: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  for (const name of modelNames) {
    models[name] = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn()
    };
  }
  return { models };
});

vi.mock('@/lib/db', () => ({ db: models }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', organisationId: 'org-1' })) }));

const FICTIONAL_NAMES = /Willow House|Harbour Court|Fenwick Road|Alder Terrace|Linden Place|Amelia Morgan|Rafi Khan|Sofia Taylor|SN-C-001|SN-C-002|SN-C-003|SN-2607-001|INC-2607-018/;

const loaders = [
  { label: 'clients', model: 'client', load: getCrmClients },
  { label: 'referrals', model: 'referral', load: getCrmReferrals },
  { label: 'incidents', model: 'incident', load: getCrmIncidents },
  { label: 'tasks', model: 'task', load: getCrmTasks },
  { label: 'properties', model: 'property', load: getCrmProperties }
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('empty registers are empty, not populated with fixtures', () => {
  it('returns no properties when the organisation has none', async () => {
    models.property.findMany.mockResolvedValue([]);
    await expect(getCrmProperties()).resolves.toEqual([]);
  });

  it.each(loaders)('returns [] for an empty $label table', async ({ model, load }) => {
    models[model].findMany.mockResolvedValue([]);
    const result = await load();
    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(FICTIONAL_NAMES);
  });

  it('scopes the property query to the signed-in organisation', async () => {
    models.property.findMany.mockResolvedValue([]);
    await getCrmProperties();
    expect(models.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organisationId: 'org-1' } }));
  });

  it('returns a real property unchanged and adds no invented rooms', async () => {
    const real = { id: 'property-real', organisationId: 'org-1', publicName: 'Orchard View', neighbourhood: 'Northside', serviceType: 'Supported accommodation', capacity: 4, publicVacancyState: 'Rooms available', confidential: false, rooms: [], service: null };
    models.property.findMany.mockResolvedValue([real]);
    await expect(getCrmProperties()).resolves.toEqual([real]);
  });

  it('returns null for a property outside the organisation rather than a stand-in record', async () => {
    models.property.findFirst.mockResolvedValue(null);
    await expect(getCrmProperty('someone-elses-property')).resolves.toBeNull();
  });
});

describe('a failed query is an error, never fictional operational data', () => {
  it.each(loaders)('$label: throws CrmDataUnavailableError and leaks nothing', async ({ model, load }) => {
    models[model].findMany.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'));
    const settled = await Promise.allSettled([load()]);
    expect(settled[0].status).toBe('rejected');
    const reason = (settled[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(CrmDataUnavailableError);
    expect(reason.message).toBe('CRM data is temporarily unavailable.');
    const serialised = JSON.stringify(reason, Object.getOwnPropertyNames(reason));
    expect(serialised).not.toMatch(FICTIONAL_NAMES);
    expect(serialised).not.toMatch(/SQLITE_BUSY|database is locked/);
  });

  it('property detail throws rather than becoming a 404 or a fabricated profile', async () => {
    models.property.findFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    const settled = await Promise.allSettled([getCrmProperty('property-1')]);
    expect(settled[0].status).toBe('rejected');
    const reason = (settled[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(CrmDataUnavailableError);
    expect(reason.message).not.toMatch(/ECONNREFUSED/);
  });
});

describe('fixtures cannot be re-enabled in production code', () => {
  const source = readFileSync(resolve(process.cwd(), 'src', 'lib', 'data.ts'), 'utf8');

  it('has no fixture helper and no environment switch', () => {
    expect(source).not.toMatch(/function fictional/);
    expect(source).not.toMatch(/process\.env/);
  });

  it('has no CRM client, referral, incident or task fixtures left', () => {
    expect(source).not.toContain('SN-C-001');
    expect(source).not.toContain('SN-2607-001');
    expect(source).not.toContain('Amelia Morgan');
    expect(source).not.toContain('INC-2607-018');
  });

  it('the CRM property loader never reaches a fallback or fixture', () => {
    const start = source.indexOf('export async function getCrmProperties');
    const end = source.indexOf('export async function getCrmProperty(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const loader = source.slice(start, end);
    expect(loader).not.toMatch(/fallback|fictional/);
    expect(loader).toContain('organisationId: user.organisationId');
  });

  it('the CRM properties page does not use the public marketing loader', () => {
    const page = readFileSync(resolve(process.cwd(), 'src', 'app', 'crm', 'properties', 'page.tsx'), 'utf8');
    expect(page).not.toContain('getPublicProperties');
    expect(page).toContain('getCrmProperties');
  });

  it('the CRM property detail page has no hardcoded operational records', () => {
    const page = readFileSync(resolve(process.cwd(), 'src', 'app', 'crm', 'properties', '[id]', 'page.tsx'), 'utf8');
    expect(page).not.toMatch(/Room 1|Restricted resident|Day \+ on-call|Void days|Review July/);
    expect(page).toContain('No rooms have been added to this property.');
  });

  it('the settings page does not merge public marketing defaults into CRM metrics', () => {
    const page = readFileSync(resolve(process.cwd(), 'src', 'app', 'crm', 'settings', 'page.tsx'), 'utf8');
    expect(page).not.toContain('fallbackSiteSettings');
    expect(page).toContain('NOT CONFIGURED');
  });
});

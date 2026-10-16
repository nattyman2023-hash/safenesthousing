import { describe, expect, it } from 'vitest';
import { serviceContentSchema, serviceCreateSchema, serviceUpdateSchema } from '@/lib/crm-validation';
import { SERVICE_SLUG_MAX_LENGTH, isValidServiceSlug, serviceSlugFromTitle } from '@/lib/service-slug';

/**
 * Service management rules.
 *
 * A production installation created the supported way (`npm run bootstrap:admin`) has zero Service
 * rows, and Service rows are load-bearing: both referral forms refuse a submission that does not name
 * a published service in the caller's organisation. Staff therefore have to be able to create,
 * publish and retire a service with no seed script, Prisma Studio, SQL, or developer — and the rules
 * below are what make that self-service safe. Slug generation is what lets someone create a service
 * without understanding URL rules, and the partial update schema is what lets the publish toggle
 * change publication without restating (or wiping) the service's content.
 */

/** Every field a Service row requires, so each test varies only the field under examination. */
const validService = {
  title: 'Domestic abuse refuge',
  summary: 'Emergency accommodation for women and children fleeing domestic abuse.',
  content: 'Safe self-contained emergency accommodation with a 24-hour staff presence.',
  audience: 'Women and children who need an emergency place to stay.',
  referralRoutes: 'Referrals arrive through the duty team and the 24-hour telephone line.',
  eligibility: 'Single women, and women with children, who need immediate safety.',
  supportModel: 'Key work, safety planning and housing options advice.',
  published: true
};

describe('service slug rules', () => {
  it('derives a URL-safe slug from a service name', () => {
    expect(serviceSlugFromTitle('Domestic Abuse Refuge')).toBe('domestic-abuse-refuge');
  });

  it('folds accents and drops punctuation rather than leaving it in the address', () => {
    expect(serviceSlugFromTitle("Séjour d'Urgence")).toBe('sejour-d-urgence');
  });

  it('collapses repeated separators and trims hyphens from both ends', () => {
    expect(serviceSlugFromTitle('  Rough   Sleeper -- Outreach  ')).toBe('rough-sleeper-outreach');
  });

  it('produces nothing usable from a name with no letters or numbers, which the caller must refuse', () => {
    expect(serviceSlugFromTitle('---')).toBe('');
    expect(isValidServiceSlug(serviceSlugFromTitle('---'))).toBe(false);
  });

  it('never returns a slug longer than the column allows', () => {
    expect(serviceSlugFromTitle('a'.repeat(400))).toHaveLength(SERVICE_SLUG_MAX_LENGTH);
  });

  it('refuses slugs that would not survive being pasted into a link', () => {
    expect(isValidServiceSlug('')).toBe(false);
    expect(isValidServiceSlug('Domestic-Abuse')).toBe(false);
    expect(isValidServiceSlug('domestic--abuse')).toBe(false);
    expect(isValidServiceSlug('-domestic-abuse')).toBe(false);
    expect(isValidServiceSlug('domestic-abuse-')).toBe(false);
    expect(isValidServiceSlug('domestic_abuse')).toBe(false);
    expect(isValidServiceSlug('domestic abuse')).toBe(false);
    expect(isValidServiceSlug('domestic-abuse-refuge')).toBe(true);
    expect(isValidServiceSlug('refuge-24')).toBe(true);
  });
});

describe('service creation validation', () => {
  it('accepts a complete service and leaves the slug for the endpoint to derive', () => {
    const result = serviceCreateSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBeUndefined();
      expect(result.data.displayOrder).toBeUndefined();
      expect(isValidServiceSlug(serviceSlugFromTitle(result.data.title))).toBe(true);
    }
  });

  it('treats an untouched slug or order field as "generate one", not as an empty value', () => {
    // The create form posts every named input, so an untouched field arrives as an empty string.
    const result = serviceCreateSchema.safeParse({ ...validService, slug: '   ', displayOrder: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBeUndefined();
      expect(result.data.displayOrder).toBeUndefined();
    }
  });

  it('normalises a deliberately supplied slug to lower case', () => {
    const result = serviceCreateSchema.safeParse({ ...validService, slug: 'Refuge-24' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe('refuge-24');
  });

  it('coerces the display order a number input posts as a string', () => {
    const result = serviceCreateSchema.safeParse({ ...validService, displayOrder: '12' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayOrder).toBe(12);
  });

  it('rejects a slug that could not be a public address', () => {
    expect(serviceCreateSchema.safeParse({ ...validService, slug: 'not a slug' }).success).toBe(false);
    expect(serviceCreateSchema.safeParse({ ...validService, slug: 'a' }).success).toBe(false);
    expect(serviceCreateSchema.safeParse({ ...validService, slug: 'x'.repeat(SERVICE_SLUG_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it('rejects a service missing content the schema stores as NOT NULL', () => {
    const incomplete: Record<string, unknown> = { ...validService };
    delete incomplete.supportModel;
    expect(serviceCreateSchema.safeParse(incomplete).success).toBe(false);
  });

  it('reads the publish checkbox the way a form posts it', () => {
    const on = serviceCreateSchema.safeParse({ ...validService, published: 'on' });
    const off = serviceCreateSchema.safeParse({ ...validService, published: 'off' });
    expect(on.success).toBe(true);
    expect(off.success).toBe(true);
    if (on.success) expect(on.data.published).toBe(true);
    if (off.success) expect(off.data.published).toBe(false);
  });
});

describe('service update validation', () => {
  it('accepts a publication change on its own, without any content', () => {
    const result = serviceUpdateSchema.safeParse({ published: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.published).toBe(false);
  });

  it('accepts a slug correction on its own', () => {
    const result = serviceUpdateSchema.safeParse({ slug: 'refuge-24' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe('refuge-24');
  });

  it('leaves an absent field absent, so a content save can never unpublish by omission', () => {
    const result = serviceUpdateSchema.safeParse({ title: 'Renamed refuge service' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Renamed refuge service');
      expect('published' in result.data).toBe(false);
    }
  });

  it('keeps the edit form schema on exactly the columns the form owns', () => {
    expect(Object.keys(serviceContentSchema.shape)).toEqual(['title', 'summary', 'content', 'audience', 'referralRoutes', 'eligibility', 'supportModel', 'published']);
  });
});
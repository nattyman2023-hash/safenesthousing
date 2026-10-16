/**
 * Service slug rules.
 *
 * `Service.slug` is a real column with a real constraint (`@@unique([organisationId, slug])` in
 * prisma/schema.prisma) and it is also the public URL segment for `/services/[slug]`. Staff therefore
 * have to end up with a valid, unique slug when they create a service, but nobody should have to
 * invent one: it is derived from the service name and only overridden deliberately.
 *
 * The pattern is deliberately narrow. A slug that ends up in a URL is copied into emails, referral
 * forms and printed documents, so it is lower-case ASCII alphanumerics joined by single hyphens with
 * no leading or trailing hyphen. Anything wider produces links that break when they are pasted.
 */

export const SERVICE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SERVICE_SLUG_MAX_LENGTH = 120;

/**
 * Derives a URL-safe slug from a service name: "Domestic Abuse Refuge" becomes "domestic-abuse-refuge".
 * Accents are folded rather than stripped wholesale so a Welsh or French service name still produces a
 * readable slug ("Séjour d'Urgence" becomes "sejour-d-urgence"). A name with nothing usable in it
 * produces an empty string, which the caller must reject rather than store.
 */
export function serviceSlugFromTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SERVICE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

/** True when a slug may be stored. Empty is never valid: the column is NOT NULL. */
export function isValidServiceSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SERVICE_SLUG_MAX_LENGTH && SERVICE_SLUG_PATTERN.test(slug);
}

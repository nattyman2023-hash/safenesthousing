import { expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './db';

/**
 * UI helpers for the acceptance suite.
 *
 * Everything here drives the real interface: the login form, the Add Service form, the per-service
 * content form, the publish and delete controls. There is no shortcut that writes a row directly,
 * because the thing under test is whether a staff member can do this without a developer.
 */

/** Waits until React owns the server-rendered form holding `selector`. Every client form renders its
 * submit control disabled until the shared useHydrated hook flips, so a click before this point is
 * handled by the browser and natively submitted. Copied from tests/e2e/hydration.ts to keep this
 * suite self-contained: the acceptance run must not depend on the development suite's fixtures. */
export async function waitForHydratedForm(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (target: string) => {
      const element = document.querySelector(target);
      if (!element) return false;
      const form = element.tagName === 'FORM' ? element : element.closest('form');
      if (!form) return false;
      return Object.keys(form).some((key) => key.startsWith('__reactProps'));
    },
    selector,
    { timeout: 30_000 }
  );
}

/** Sign in through the real login form. The acceptance database has one administrator and the suite
 * signs in a handful of times, so the 8-per-5-minutes rate limit is never close to being reached. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/staff/login');
  await waitForHydratedForm(page, '#password');
  await page.getByLabel('Work email').fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/crm\/dashboard/);
}

export type ServiceDraft = {
  title: string;
  summary?: string;
  content?: string;
  audience?: string;
  referralRoutes?: string;
  eligibility?: string;
  supportModel?: string;
  slug?: string;
  displayOrder?: number;
  publish?: boolean;
};

/** Fills in Settings → Services → Add Service and presses the button. Every field maps to a NOT NULL
 * Service column, so the defaults are real copy rather than placeholders. */
export async function addServiceThroughUi(page: Page, draft: ServiceDraft): Promise<void> {
  await page.goto('/crm/settings/services');
  await waitForHydratedForm(page, '#service-new-title');
  await page.locator('#service-new-title').fill(draft.title);
  if (draft.slug !== undefined) await page.locator('#service-new-slug').fill(draft.slug);
  await page.locator('#service-new-summary').fill(draft.summary ?? `Public summary for ${draft.title}, written by the acceptance run.`);
  await page.locator('#service-new-content').fill(draft.content ?? `What ${draft.title} provides day to day, written by the acceptance run.`);
  await page.locator('#service-new-audience').fill(draft.audience ?? `People who need ${draft.title}.`);
  await page.locator('#service-new-routes').fill(draft.referralRoutes ?? 'Referrals arrive through the duty team.');
  await page.locator('#service-new-eligibility').fill(draft.eligibility ?? 'No eligibility considerations apply.');
  await page.locator('#service-new-support').fill(draft.supportModel ?? 'Key work and housing options advice.');
  if (draft.displayOrder !== undefined) await page.locator('#service-new-order').fill(String(draft.displayOrder));
  const publishCheckbox = page.locator('#add-service input[name="published"]');
  if (draft.publish === false && await publishCheckbox.isChecked()) await publishCheckbox.uncheck();
  if (draft.publish === true && !(await publishCheckbox.isChecked())) await publishCheckbox.check();
  await page.locator('#add-service').getByRole('button', { name: 'Add Service' }).click();
}

/** Opens the "Edit service content" disclosure for one named service. Each service has its own
 * <details>, so the wrong-record protection under test is real: the form is scoped to one row. */
export async function openServiceEditor(page: Page, title: string): Promise<void> {
  await page.goto('/crm/settings/services');
  const disclosure = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Edit service content' }) }).locator('details').filter({ has: page.locator('summary', { hasText: title }) });
  await expect(disclosure).toHaveCount(1);
  await disclosure.locator('summary').click();
  await waitForHydratedForm(page, `#service-title-${await serviceIdOf(page, title)}`);
}

/** Reads the Service row's id from the publish control's aria-label scope: the content form's field
 * ids embed the id, so this resolves the form belonging to the named service. */
async function serviceIdOf(page: Page, title: string): Promise<string> {
  const ids = await page.locator('input[id^="service-title-"]').evaluateAll((nodes) => nodes.map((node) => node.id.replace('service-title-', '')));
  const titles = await page.locator('input[id^="service-title-"]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
  const index = titles.findIndex((value) => value === title);
  if (index < 0) throw new Error(`No service content form is rendered for "${title}". Found: ${titles.join(', ') || 'none'}`);
  return ids[index];
}

/** The serviceIds the internal referral intake currently offers, in menu order. */
export async function referralServiceOptions(page: Page): Promise<{ value: string; label: string }[]> {
  await page.goto('/crm/referrals/new');
  return page.locator('select[name="serviceId"] option').evaluateAll((nodes) => nodes
    .map((node) => ({ value: (node as HTMLOptionElement).value, label: (node as HTMLOptionElement).textContent?.trim() ?? '' }))
    .filter((option) => option.value !== ''));
}

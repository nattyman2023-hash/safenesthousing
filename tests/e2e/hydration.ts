import { type Page } from '@playwright/test';

/**
 * Waits until React owns the server-rendered form that holds `selector` (or the
 * element itself when a form selector is passed).
 *
 * Every client form in this app is server-rendered with its submit control
 * disabled until the shared useHydrated hook flips after hydration (see
 * src/lib/use-hydrated.ts), because a click in that window would be handled by
 * the browser and natively submitted. An automated run has to wait for the same
 * thing a person waits for, so this helper watches for React's ownership marker
 * on the form element instead of guessing with a fixed delay. React attaches
 * internal props (__reactProps$…) to every host node it owns, so their presence
 * means the form's onSubmit handler is live and clicks are safe.
 */
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
    { timeout: 15_000 }
  );
}

/**
 * Waits until React owns any element, not just a form. A control whose behaviour lives in an
 * onClick handler (a navigation drawer, a disclosure, a toggle) silently does nothing when it is
 * clicked before hydration, so a test that clicks one has to wait for the same thing a person does.
 */
export async function waitForReactOwnership(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (target: string) => {
      const element = document.querySelector(target);
      return !!element && Object.keys(element).some((key) => key.startsWith('__reactProps'));
    },
    selector,
    { timeout: 15_000 }
  );
}

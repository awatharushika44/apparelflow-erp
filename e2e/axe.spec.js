import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ACCOUNTS = [
  { name: 'supervisor', index: 0, email: 'supervisor@apparelflow.demo', password: 'Cutting@2026' },
  { name: 'verifier', index: 1, email: 'verifier@apparelflow.demo', password: 'Verify@2026' },
  { name: 'sewing', index: 2, email: 'sewing@apparelflow.demo', password: 'Sewing@2026' },
];

async function scan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`);
  expect(results.violations, `${label}\n${summary.join('\n')}`).toEqual([]);
}

async function openLanding(page) {
  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
}

// A role tile either opens the dialog (credentials prefilled) or signs in directly. Handle both.
async function signIn(page, account) {
  await openLanding(page);
  await page.locator('.ld-role-tile').nth(account.index).click();
  const dialog = page.getByRole('dialog');
  const signOut = page.getByRole('button', { name: 'Sign out' });
  await Promise.any([dialog.waitFor(), signOut.waitFor()]);
  if (await dialog.isVisible()) {
    await dialog.locator('input[type="email"]').fill(account.email);
    await dialog.locator('input[type="password"]').fill(account.password);
    await dialog.locator('.ld-submit').click();
  }
  await signOut.waitFor();
}

test('landing page has no violations', async ({ page }) => {
  await openLanding(page);
  await scan(page, 'landing');
});

test('sign-in dialog has no violations, empty and with errors', async ({ page }) => {
  await openLanding(page);
  await page.locator('.ld-role-tile').first().click();
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible({ timeout: 3000 }).catch(() => false))) return; // tile signed in directly
  await scan(page, 'dialog open');
  await dialog.locator('input[type="email"]').fill('');
  await dialog.locator('input[type="password"]').fill('');
  await dialog.locator('.ld-submit').click();
  await scan(page, 'dialog with errors');
});

for (const a of ACCOUNTS) {
  test(`${a.name} screen has no violations`, async ({ page }) => {
    await signIn(page, a);
    await scan(page, a.name);
  });
}
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const ACCOUNTS = [
  {
    name: 'supervisor',
    email: 'supervisor@apparelflow.demo',
    password: 'Cutting@2026',
  },
  {
    name: 'verifier',
    email: 'verifier@apparelflow.demo',
    password: 'Verify@2026',
  },
  {
    name: 'sewing',
    email: 'sewing@apparelflow.demo',
    password: 'Sewing@2026',
  },
];

async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.length} node(s)`,
  );

  expect(
    results.violations,
    `${label}\n${summary.join('\n')}`,
  ).toEqual([]);
}

test('login page has no violations', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await scan(page, 'login');
});

test('login page with validation errors showing', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await scan(page, 'login errors');
});

for (const a of ACCOUNTS) {
  test(`${a.name} screen has no violations`, async ({ page }) => {
    await page.goto(BASE);

    await page.getByLabel('Email').fill(a.email);
    await page.getByLabel('Password').fill(a.password);

    await page.getByRole('button', {
      name: 'Sign in',
      exact: true,
    }).click();

    await page.getByRole('button', { name: 'Sign out' }).waitFor();

    await scan(page, a.name);
  });
}
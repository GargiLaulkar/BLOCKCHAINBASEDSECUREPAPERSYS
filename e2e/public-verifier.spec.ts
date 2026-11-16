import { expect, test } from '@playwright/test';
import { installApiDefaults, leakEvent, publicExam } from './support';

test('public verifier searches by exam ID and redacts sensitive event values', async ({ page }) => {
  await installApiDefaults(page);
  await page.route('**/api/exams/17', (route) => route.fulfill({ status: 200, json: publicExam }));
  await page.route('**/api/events**', (route) => route.fulfill({
    status: 200,
    json: { events: [{ ...leakEvent, payloadJson: { seed: 'must-not-render', privateKey: 'never-render', ...leakEvent.payloadJson } }], nextCursor: null },
  }));
  await page.goto('/verify');
  await expect(page.getByRole('heading', { name: 'Verify an examination without a wallet' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search by exam ID or hash' }).fill('17');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Exam No. 17' })).toBeVisible();
  await expect(page.getByText('LeakReported')).toBeVisible();
  await expect(page.getByText('must-not-render')).toHaveCount(0);
  await expect(page.getByText('never-render')).toHaveCount(0);
  await expect(page.locator('.public-verifier__payload')).toContainText('[REDACTED]');
});

test('public verifier shows a not-found result and a recoverable API error', async ({ page }) => {
  await installApiDefaults(page);
  await page.route('**/api/exams/404', (route) => route.fulfill({ status: 404, json: { error: { message: 'Exam not found.' } } }));
  await page.goto('/verify');
  await page.getByRole('textbox', { name: 'Search by exam ID or hash' }).fill('404');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'No matching public exam found', exact: true })).toBeVisible();
  await page.route('**/api/exams/503', (route) => route.fulfill({ status: 503, json: { error: { message: 'Verifier service unavailable.' } } }));
  await page.getByRole('textbox', { name: 'Search by exam ID or hash' }).fill('503');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('alert')).toContainText('Verifier service unavailable');
});

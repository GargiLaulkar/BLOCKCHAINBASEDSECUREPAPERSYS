import { expect, test } from '@playwright/test';
import { installApiDefaults, installReadOnlyWallet, leakEvent, openAsRole } from './support';

test('Auditor filters indexed events and starts an all-results CSV download', async ({ page }) => {
  const calls: string[] = [];
  await installApiDefaults(page, 'AUDITOR');
  await installReadOnlyWallet(page);
  await page.route('**/api/events**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    return route.fulfill({ status: 200, json: { events: [leakEvent], nextCursor: null } });
  });
  await page.goto('/auditor/audit-logs');
  await expect(page.getByRole('heading', { name: 'Audit Log Explorer' })).toBeVisible();
  await page.getByLabel('Exam ID').fill('17');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('button', { name: 'LeakReported' })).toBeVisible();
  expect(calls.some((query) => query.includes('exam=17'))).toBeTruthy();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all filtered results (CSV)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^sigil-audit-logs-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByRole('status')).toContainText('CSV download started');
});

test('Auditor evidence PDF download starts and Decoy/Roster pages expose their actual empty states', async ({ page }) => {
  await installApiDefaults(page, 'AUDITOR');
  await installReadOnlyWallet(page);
  await page.route('**/api/events**', (route) => route.fulfill({ status: 200, json: { events: [leakEvent], nextCursor: null } }));
  await page.goto('/auditor/evidence-report');
  await expect(page.getByRole('heading', { name: 'Evidence PDF reports' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^sigil-evidence-exam-17-[a-f0-9]{8}\.pdf$/);
  await expect(page.getByRole('status')).toContainText('Evidence PDF download started');

  await page.goto('/auditor/decoys');
  await expect(page.getByRole('heading', { name: 'Decoy manager' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No indexed decoy registrations' })).toBeVisible();

  await page.goto('/auditor/roster-proof');
  await expect(page.getByRole('heading', { name: /roster proof/i })).toBeVisible();
});

test('Auditor Leak Tracer route loads behind its role guard', async ({ page }) => {
  await openAsRole(page, 'AUDITOR', '/auditor/tracer');
  await expect(page.getByRole('heading', { name: /leak tracer/i })).toBeVisible();
});

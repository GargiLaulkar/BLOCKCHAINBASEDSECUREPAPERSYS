import { expect, test } from '@playwright/test';
import { installApiDefaults, installReadOnlyWallet, leakEvent, openAsRole, publicExam } from './support';

const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

async function expectNoHorizontalPageOverflow(page: import('@playwright/test').Page) {
  const { documentWidth, viewportWidth } = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(documentWidth, `document width at ${viewportWidth}px`).toBeLessThanOrEqual(viewportWidth);
}

test('Public Verifier remains usable without horizontal page overflow at all target sizes', async ({ page }) => {
  await installApiDefaults(page);
  await page.route('**/api/exams/17', (route) => route.fulfill({ status: 200, json: publicExam }));
  await page.route('**/api/events**', (route) => route.fulfill({ status: 200, json: { events: [leakEvent], nextCursor: null } }));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/verify');
    await expect(page.getByRole('heading', { name: 'Verify an examination without a wallet' })).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Search by exam ID or hash' });
    await expect(search).toBeVisible();
    await search.fill('17');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { name: 'Exam No. 17' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  }

  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const style = getComputedStyle(active);
    return { name: active.getAttribute('aria-label') ?? active.textContent, outline: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focus?.outline).not.toBe('none');
  expect(focus?.width).not.toBe('0px');
});

test('all role dashboards fit target sizes and retain named navigation', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [role, label] of [
      ['AUTHORITY', 'Authority'], ['CENTRE', 'Centre'], ['HOLDER', 'Holder'], ['AUDITOR', 'Auditor'],
    ]) {
      await openAsRole(page, role, `/dashboard/${role.toLowerCase()}`);
      await expect(page.getByRole('heading', { name: `${label} dashboard` })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Dashboard quick actions' })).toBeVisible();
      await expectNoHorizontalPageOverflow(page);
    }
  }
});

test('Centre Paper Station and Holder Console remain readable at target sizes', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openAsRole(page, 'CENTRE', '/centre/station');
    await expect(page.getByRole('heading', { name: 'No centre assignments' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await openAsRole(page, 'HOLDER', '/holder/console');
    await expect(page.getByRole('heading', { name: 'No exams assigned' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  }
});

test('Auditor log table and event dialog support scrolling, keyboard focus and target sizes', async ({ page }) => {
  await installApiDefaults(page, 'AUDITOR');
  await installReadOnlyWallet(page);
  await page.route('**/api/events**', (route) => route.fulfill({ status: 200, json: { events: [leakEvent], nextCursor: null } }));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/auditor/audit-logs');
    await expect(page.getByRole('heading', { name: 'Audit Log Explorer' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Exam ID' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    const tableRegion = page.getByRole('region', { name: 'Indexed event results table' });
    await expect(tableRegion).toHaveAttribute('tabindex', '0');
    await expectNoHorizontalPageOverflow(page);
  }

  const eventButton = page.getByRole('button', { name: 'LeakReported' });
  await eventButton.click();
  const closeButton = page.getByRole('button', { name: 'Close' });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(eventButton).toBeFocused();
});

test('Auditor Leak Tracer remains visible and usable at target sizes', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openAsRole(page, 'AUDITOR', '/auditor/tracer');
    await expect(page.getByRole('heading', { name: 'Leak tracer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  }
});

test('Evidence, Decoy and Roster Auditor views fit all target sizes', async ({ page }) => {
  await installApiDefaults(page, 'AUDITOR');
  await installReadOnlyWallet(page);
  await page.route('**/api/events**', (route) => route.fulfill({ status: 200, json: { events: [leakEvent], nextCursor: null } }));
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/auditor/evidence-report');
    await expect(page.getByRole('heading', { name: 'Evidence PDF reports' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Indexed evidence reports table' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.goto('/auditor/decoys');
    await expect(page.getByRole('heading', { name: 'Decoy manager' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    await page.goto('/auditor/roster-proof');
    await expect(page.getByRole('heading', { name: 'Roster proof' })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  }
});

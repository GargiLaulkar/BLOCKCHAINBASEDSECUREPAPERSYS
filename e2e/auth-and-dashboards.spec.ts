import { expect, test } from '@playwright/test';
import { openAsRole, installApiDefaults, installReadOnlyWallet } from './support';

test('a protected dashboard requires an authenticated session', async ({ page }) => {
  await installApiDefaults(page);
  await installReadOnlyWallet(page);
  await page.goto('/dashboard/authority');
  await expect(page.getByRole('heading', { name: 'Sign in with Ethereum' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign-In With Ethereum' })).toBeVisible();
});

test('a Centre session is denied Auditor-only route access', async ({ page }) => {
  await openAsRole(page, 'CENTRE', '/auditor/audit-logs');
  await expect(page.getByRole('heading', { name: 'No authorized role assigned' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit Log Explorer' })).toHaveCount(0);
});

test('each supported role dashboard renders with deterministic empty data and navigation', async ({ page }) => {
  for (const [role, label] of [
    ['AUTHORITY', 'Authority'], ['CENTRE', 'Centre'], ['HOLDER', 'Holder'], ['AUDITOR', 'Auditor'],
  ]) {
    await openAsRole(page, role, `/dashboard/${role.toLowerCase()}`);
    await expect(page.getByRole('heading', { name: `${label} dashboard` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No examinations found' })).toBeVisible();
    if (role === 'AUDITOR') {
      await expect(page.getByRole('link', { name: 'Audit log explorer', exact: true })).toHaveAttribute('href', '/auditor/audit-logs');
    }
  }
});

test('Centre station and Holder console render honest empty assignment states', async ({ page }) => {
  await openAsRole(page, 'CENTRE', '/centre/station');
  await expect(page.getByRole('heading', { name: 'No centre assignments' })).toBeVisible();
  await expect(page.getByText(/managed local print agent are not available/i)).toHaveCount(0);

  await openAsRole(page, 'HOLDER', '/holder/console');
  await expect(page.getByRole('heading', { name: 'No exams assigned' })).toBeVisible();
});

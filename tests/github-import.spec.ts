import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockApi, mockedRequests } from './support/mockApi.ts';

// The page asks this server for the file; the server reads GitHub. Here the server's
// answer is mocked, so no test reaches GitHub.
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'ride-share-compose.yml');

test('a public GitHub repository link imports its compose file', async ({ page }) => {
  const text = await readFile(SAMPLE, 'utf8');
  await mockApi(page, {
    '/api/github/compose': {
      owner: 'octo', repo: 'ride-share', ref: 'main', sha: 'a'.repeat(40), path: 'docker-compose.yml',
      fileName: 'docker-compose.yml', text, htmlUrl: 'https://github.com/octo/ride-share/blob/aaaaaaa/docker-compose.yml',
    },
  });
  await page.goto('/app?import=compose');
  await page.getByLabel('Or import from a public GitHub repository').fill('https://github.com/octo/ride-share');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/from docker-compose\.yml in octo\/ride-share at aaaaaaa/)).toBeVisible();
  expect(await mockedRequests(page, '/api/github/compose')).toEqual([{ url: 'https://github.com/octo/ride-share' }]);
});

test('a link the server refuses shows its message and keeps the dialog open', async ({ page }) => {
  await mockApi(page, {
    '/api/github/compose': { error: 'Use a public GitHub repository link, such as https://github.com/owner/repo.', code: 'bad_url' },
  });
  // The mock always answers 200; a body without the file is treated as a refusal, like a 400.
  await page.goto('/app?import=compose');
  await page.getByLabel('Or import from a public GitHub repository').fill('https://gitlab.com/octo/shop');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use a public GitHub repository link');
  await expect(page.getByLabel('Or import from a public GitHub repository')).toHaveValue('https://gitlab.com/octo/shop');
});

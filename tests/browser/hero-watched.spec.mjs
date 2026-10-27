import { test, expect } from '@playwright/test';

const movie = (title, day) => ({
  title, stage: 'streaming', date: `Oct ${day}`, month: 'OCT', year: '2026',
  releaseDate: `2026-10-${day}`, genre: 'Horror', note: '', color: 'blood',
  platform: 'Shudder', availability: 'Subscription streaming',
});

test('featured title can be marked, restored after reload, and unmarked from watched', async ({ page }) => {
  await page.route('**/data/releases.json', route => route.fulfill({
    json: { releases: [movie('Featured fixture', 17), movie('Other fixture', 18)], updatedAt: '2026-10-27T12:00:00Z' },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Watch at home', exact: true }).click();
  const hero = page.locator('header[aria-label="Featured movie ticket"]');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Featured fixture');
  const mark = hero.getByRole('button', { name: 'Mark Featured fixture as watched', exact: true });
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  const color = await mark.evaluate(button => getComputedStyle(button).color);
  const luminance = channels => channels.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const foreground = luminance(color.match(/[\d.]+/g).slice(0, 3).map(Number));
  const paper = luminance([235, 225, 204]);
  expect((Math.max(foreground, paper) + 0.05) / (Math.min(foreground, paper) + 0.05)).toBeGreaterThanOrEqual(4.5);
  await mark.focus();
  await mark.press('Enter');
  await expect(hero.getByRole('button', { name: 'Unmark Featured fixture as watched', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Watched 1', exact: true }).click();
  await expect(page.getByText('Your watched movie is featured above.', { exact: true })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Featured fixture' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Watch at home', exact: true }).click();
  await page.getByRole('button', { name: 'Watched 1', exact: true }).click();
  await hero.getByRole('button', { name: 'Unmark Featured fixture as watched', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Watched 0', exact: true })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Mark Featured fixture as watched', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Nothing marked watched yet.', { exact: false })).toBeVisible();
});

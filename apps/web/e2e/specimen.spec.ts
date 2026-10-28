import { expect, test } from '@playwright/test';

test.describe('specimen sheet (phase 0)', () => {
  test('renders tokens, fonts and stamps without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Meridian' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Terra incognita/ })).toBeVisible();

    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family.replace(/"/g, '')),
    );
    for (const family of [
      'Fraunces Variable',
      'EB Garamond',
      'Instrument Sans Variable',
      'IBM Plex Mono',
    ]) {
      expect(loaded, `${family} should be loaded`).toContain(family);
    }

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(247, 241, 229)'); // paper-100 (atlas)
    expect(errors).toEqual([]);
  });

  test('switches to the Nocturne theme', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'Nocturne' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nocturne');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(20, 27, 34)'); // paper-100 (nocturne)
  });

  test('captures review screenshots for the Art Director', async ({ page }, info) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath('specimen-atlas.png'), fullPage: true });
    await page.getByRole('radio', { name: 'Nocturne' }).click();
    await page.screenshot({ path: info.outputPath('specimen-nocturne.png'), fullPage: true });
  });
});

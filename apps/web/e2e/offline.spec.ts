import { expect, test } from '@playwright/test';

/** Phase 3.1: once visited, the whole game plays offline (service worker precache). */
test.use({ locale: 'en-GB' });

test('installs, then starts and plays a leg with the network cut', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop', 'one browser is enough');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New expedition' })).toBeEnabled();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // Wait for the precache to complete (install → activate).
    while (!reg.active || reg.active.state !== 'activated')
      await new Promise((r) => setTimeout(r, 100));
  });
  const manifest = await page.request.get('/manifest.webmanifest');
  expect((await manifest.json()).display).toBe('standalone');

  await context.setOffline(true);
  await page.goto('/x/MER-0002');
  await expect(page.getByText(/Leg 1 \/ 6/)).toBeVisible();
  const iso3 = (await page.evaluate(() => window.__meridianTest!.answers()))[0]!;
  const name = await page.evaluate((c) => {
    const iso2 = (window as unknown as { __meridianIso2: Record<string, string> }).__meridianIso2[
      c
    ]!;
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) ?? c;
  }, iso3);
  await page.getByRole('button', { name: '/', exact: true }).click();
  await page.getByRole('combobox').fill(name);
  await page.getByRole('combobox').press('Enter');
  await page.getByRole('button', { name: 'Plant the camp' }).click();
  await page.mouse.click(5, 450);
  await expect(page.getByText(/Leg 2 \/ 6/)).toBeVisible();
  await context.setOffline(false);
});

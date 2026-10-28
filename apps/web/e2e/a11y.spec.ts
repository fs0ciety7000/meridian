import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** MVP criterion (development-plan §Phase 3): 0 critical or serious axe violation. */
test.use({ locale: 'en-GB' });

async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    blocking.map(
      (v) => `${label}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`,
    ),
  ).toEqual([]);
}

async function playAll(page: Page) {
  for (let leg = 1; leg <= 6; leg++) {
    await expect(page.getByText(new RegExp(`Leg ${leg} / 6`))).toBeVisible();
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
  }
}

test('launcher, expedition, summary, passport and about pass axe', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /New expedition/ })).toBeVisible();
  await audit(page, 'launcher');

  await page.goto('/x/MER-0002');
  await expect(page.getByText(/Leg 1 \/ 6/)).toBeVisible();
  await audit(page, 'expedition');

  await playAll(page);
  await expect(page.getByRole('heading', { name: 'Expedition complete' })).toBeVisible();
  await audit(page, 'summary');

  await page.goto('/passeport');
  await expect(page.getByRole('heading', { name: 'Passport' })).toBeVisible();
  await audit(page, 'passport');

  await page.goto('/a-propos');
  await expect(page.getByRole('heading', { name: 'About Meridian' })).toBeVisible();
  await audit(page, 'about');
});

test('a full leg is playable with the keyboard alone', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'keyboard flow on desktop');
  await page.goto('/x/MER-0002');
  await expect(page.getByText(/Leg 1 \/ 6/)).toBeVisible();
  for (let leg = 1; leg <= 2; leg++) {
    const iso3 = (await page.evaluate(() => window.__meridianTest!.answers()))[0]!;
    const name = await page.evaluate((c) => {
      const iso2 = (window as unknown as { __meridianIso2: Record<string, string> }).__meridianIso2[
        c
      ]!;
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) ?? c;
    }, iso3);
    await page.keyboard.press('/');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter'); // selects the country; focus moves to the map
    await expect(page.locator('[data-inset="bottom"]')).toContainText(name);
    await page.keyboard.press('Enter'); // the map confirms the provisional camp
    await expect(page.getByText(new RegExp(`Leg ${leg + 1} / 6`))).toBeVisible({ timeout: 8000 });
  }
});

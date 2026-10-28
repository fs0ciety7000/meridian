import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 gate (development-plan §Phase 1): planting must succeed at the first attempt,
 * with a finger, on the hardest places on Earth.
 */

const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__meridianLab?.engine);
  await page.waitForTimeout(300);
};

const project = (page: Page, lonLat: [number, number]) =>
  page.evaluate((ll) => window.__meridianLab!.engine!.project(ll)!, lonLat);

const flyTo = async (page: Page, lonLat: [number, number], k: number) => {
  await page.evaluate(
    ([ll, kk]) => window.__meridianLab!.engine!.flyToPoint(ll as [number, number], kk as number),
    [lonLat, k] as const,
  );
  await page.waitForTimeout(2200);
};

/** Brings a point to the centre of the screen at the current zoom (as a player would pan). */
const reveal = async (page: Page, lonLat: [number, number]) => {
  const k = await page.evaluate(() => window.__meridianLab!.engine!.camera.k);
  await flyTo(page, lonLat, k);
};

/** Touch tap on touch devices, mouse click otherwise. */
const tap = async (page: Page, x: number, y: number) => {
  if (test.info().project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

const campBar = (page: Page) => page.locator('section[aria-live]');
const plant = (page: Page) => page.getByRole('button', { name: 'Planter le camp' });

const expectPick = async (page: Page, name: RegExp) => {
  await expect(campBar(page)).toContainText(name);
  await expect(plant(page)).toBeEnabled();
  await plant(page).click();
  await expect(page.getByLabel('Distance parcourue')).not.toHaveText(/^0\s*km$/);
};

test.describe('planting at the first attempt (phase 1 gate)', () => {
  test('Malta from the world view, through its halo, with a few pixels of finger error', async ({
    page,
  }) => {
    await ready(page);
    await reveal(page, [14.42, 35.9]);
    const [x, y] = await project(page, [14.42, 35.9]);
    await tap(page, x + 4, y - 3);
    await expectPick(page, /Malte/);
  });

  test('Singapore from the world view', async ({ page }) => {
    await ready(page);
    await reveal(page, [103.82, 1.35]);
    const [x, y] = await project(page, [103.82, 1.35]);
    await tap(page, x - 3, y + 2);
    await expectPick(page, /Singapour/);
  });

  test('Tuvalu, an atoll in the middle of the Pacific', async ({ page }) => {
    await ready(page);
    await reveal(page, [179.2, -8.52]);
    const [x, y] = await project(page, [179.2, -8.52]);
    await tap(page, x, y);
    await expectPick(page, /Tuvalu/);
  });

  test('Lesotho, an enclave, resolves to Lesotho and not South Africa', async ({ page }) => {
    await ready(page);
    await flyTo(page, [28.2, -29.6], 6);
    const [x, y] = await project(page, [28.2, -29.6]);
    await tap(page, x, y);
    await expectPick(page, /Lesotho/);
    await expect(campBar(page)).not.toContainText(/Afrique du Sud/);
  });

  test('The Gambia, a sliver inside Senegal', async ({ page }) => {
    await ready(page);
    await flyTo(page, [-15.4, 13.45], 8);
    const [x, y] = await project(page, [-15.4, 13.45]);
    await tap(page, x, y);
    await expectPick(page, /Gambie/);
  });

  test('Cape Horn: a tap just offshore snaps to Chile', async ({ page }) => {
    await ready(page);
    // Southernmost Chilean land in the 50m layer (Cape Horn islet itself is too small for it).
    const tip: [number, number] = [-67.61, -55.892];
    await flyTo(page, tip, 10);
    const [x, y] = await project(page, tip);
    await tap(page, x, y + 8);
    await expectPick(page, /Chili/);
  });

  test('The Vatican with the loupe (long press)', async ({ page, context }) => {
    test.skip(!test.info().project.use.hasTouch, 'the loupe is a touch gesture');
    await ready(page);
    await flyTo(page, [12.45, 41.9], 30);
    const [x, y] = await project(page, [12.4533, 41.9033]);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px = x, py = y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }],
      });
    await touch('touchStart', x + 20, y + 16);
    await page.waitForTimeout(500);
    await expect(page.locator('.atlas-map__loupe')).toBeVisible();
    await touch('touchMove', x + 8, y + 6);
    await touch('touchMove');
    await touch('touchEnd');
    await expect(page.locator('.atlas-map__loupe')).toBeHidden();
    await expectPick(page, /Vatican/);
  });
});

test.describe('map behaviour', () => {
  test('a tap in the open ocean places nothing and explains why', async ({ page }) => {
    await ready(page);
    const [x, y] = await project(page, [-30, -5]);
    await tap(page, x, y);
    await expect(campBar(page)).toContainText(/En mer/);
    await expect(plant(page)).toBeDisabled();
  });

  test('Taiwan is not plantable under geo policy v1', async ({ page }) => {
    await ready(page);
    await flyTo(page, [121, 23.7], 8);
    const [x, y] = await project(page, [121, 23.7]);
    await tap(page, x, y);
    await expect(campBar(page)).toContainText(/non plantable/);
    await expect(plant(page)).toBeDisabled();
  });

  test('a route across the antimeridian (Fiji → Samoa) stays short', async ({ page }) => {
    await ready(page);
    for (const name of ['Fidji', 'Samoa']) {
      await page.getByRole('combobox').fill(name);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      await plant(page).click();
    }
    await page.waitForTimeout(1800);
    const lastLeg = page.locator('.atlas-route__leg').last();
    // In world units at scale 1: a correct leg is a few dozen px; a wrong one spans the world.
    const width = await lastLeg.evaluate((p) => (p as SVGPathElement).getBBox().width);
    const odometer = await page.getByLabel('Distance parcourue').innerText();
    const km = Number(odometer.replace(/\D/g, ''));
    expect(width).toBeLessThan(60);
    expect(km).toBeGreaterThan(17000); // Lisbon → Fiji ≈ 17 000 km, then ≈ 1 100 km to Samoa
    expect(km).toBeLessThan(20000);
  });

  test('keyboard only: search Bhutan, plant it, never touching the mouse', async ({ page }) => {
    await ready(page);
    await page.getByRole('combobox').focus();
    await page.keyboard.type('Bhoutan');
    await page.keyboard.press('Enter');
    await expect(campBar(page)).toContainText(/Bhoutan/);
    await expect(page.locator('.atlas-map')).toBeFocused();
    await page.keyboard.press('ArrowRight'); // nudge the camp east by 0.5°: still Bhutan
    await expect(campBar(page)).toContainText(/Bhoutan/);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Distance parcourue')).not.toHaveText(/^0\s*km$/);
    await expect(page.locator('.atlas-camp--planted')).toHaveCount(1);
  });

  test('zooming in switches to the 50m layer and updates the scale bar', async ({ page }) => {
    await ready(page);
    const before = await page.getByRole('img', { name: /Échelle/ }).getAttribute('aria-label');
    await flyTo(page, [10, 50], 6);
    await page.waitForFunction(() => window.__meridianLab!.engine!.camera.lod === '50m');
    await expect(page.getByRole('img', { name: /Échelle/ })).not.toHaveAttribute(
      'aria-label',
      before!,
    );
  });
});

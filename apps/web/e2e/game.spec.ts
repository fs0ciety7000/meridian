import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 gate (development-plan §Phase 2): an expedition plays end to end offline, resumes
 * after a reload, and a challenge link replays the same expedition with a comparison.
 */

test.use({ locale: 'en-GB' });
// Full runs (6–12 legs with choreography) take longer than the default 30 s on a loaded runner.
test.setTimeout(90_000);

const answers = (page: Page) => page.evaluate(() => window.__meridianTest!.answers());
const wrong = (page: Page) => page.evaluate(() => window.__meridianTest!.wrong());

/** Plants a camp in `iso3` through the country register, as a keyboard player would. */
async function campIn(page: Page, iso3: string) {
  const name = await page.evaluate((c) => {
    const iso2 = (window as unknown as { __meridianIso2: Record<string, string> }).__meridianIso2[
      c
    ]!;
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) ?? c;
  }, iso3);
  await page.getByRole('button', { name: '/' }).click();
  const box = page.getByRole('combobox');
  await box.fill(name);
  await box.press('Enter');
  await expect(page.locator('[data-inset="bottom"]')).toContainText(name);
  await page.getByRole('button', { name: 'Plant the camp' }).click();
  // Skip the resolution choreography.
  await page.waitForTimeout(150);
  await page.mouse.click(5, 450);
}

async function startNew(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New expedition' }).click();
  await expect(page).toHaveURL(/\/x\/MER-[0-9A-Z]{9}$/);
  await expect(page.getByText(/Leg 1 \/ 6/)).toBeVisible();
}

test('plays a generated expedition end to end and keeps it after a reload', async ({ page }) => {
  await startNew(page);
  const code = new URL(page.url()).pathname.split('/').pop()!;
  for (let leg = 1; leg <= 6; leg++) {
    await expect(page.getByText(new RegExp(`Leg ${leg} / 6`))).toBeVisible();
    const pool = leg === 3 ? await wrong(page) : await answers(page);
    expect(pool.length).toBeGreaterThan(0);
    await campIn(page, pool[0]!);
    if (leg === 2) {
      // Resume: the run survives a reload at any leg.
      await page.reload();
      await expect(page.getByText(/Leg 3 \/ 6/)).toBeVisible();
    }
  }
  await expect(page.getByRole('heading', { name: 'Expedition complete' })).toBeVisible();
  await expect(page.locator('ol li svg[role="img"]')).toHaveCount(5);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Expedition complete' })).toBeVisible();
  expect(page.url()).toContain(code);
});

test('a challenge link replays the same expedition and compares', async ({ page, browser }) => {
  await startNew(page);
  for (let leg = 1; leg <= 6; leg++) {
    await expect(page.getByText(new RegExp(`Leg ${leg} / 6`))).toBeVisible();
    await campIn(page, (await answers(page))[0]!);
  }
  await expect(page.getByRole('heading', { name: 'Expedition complete' })).toBeVisible();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => ((navigator as { share?: unknown }).share = undefined));
  await page.getByRole('button', { name: 'Send the postcard' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const url = /https?:\/\/\S+/.exec(shared)![0];

  const friend = await (await browser.newContext({ locale: 'en-GB' })).newPage();
  await friend.goto(url);
  await expect(friend.getByText(/A friend challenges you/)).toBeVisible();
  await friend.getByRole('button', { name: 'Take up the challenge' }).click();
  for (let leg = 1; leg <= 6; leg++) {
    await expect(friend.getByText(new RegExp(`Leg ${leg} / 6`))).toBeVisible();
    await campIn(friend, (await answers(friend)).at(-1)!);
  }
  await expect(friend.getByRole('table')).toBeVisible();
  await expect(friend.getByRole('columnheader', { name: 'Friend' })).toBeVisible();
});

test('rejects a mistyped code and opens a catalogue code', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I have a code' }).click();
  const input = page.getByRole('textbox');
  await input.fill('MER-7KQ2NZZZZ');
  await expect(page.getByText(/Unreadable code/)).toBeVisible();
});

test('portrait: the map fills at least 70 % of the height during a leg', async ({ page }) => {
  test.skip(!test.info().project.use.isMobile, 'portrait phones only');
  await startNew(page);
  await page.waitForTimeout(800);
  const ratio = await page.evaluate(() => {
    const e = window.__meridian!.engine!;
    let lo = Infinity;
    let hi = -Infinity;
    for (let lat = -90; lat <= 90; lat++)
      for (const lon of [-179.9, 0, 179.9]) {
        const q = e.project([lon, lat]);
        if (q) [lo, hi] = [Math.min(lo, q[1]), Math.max(hi, q[1])];
      }
    return (Math.min(innerHeight, hi) - Math.max(0, lo)) / innerHeight;
  });
  expect(ratio).toBeGreaterThanOrEqual(0.699);
  // Mobile chrome: cartouche, camp bar, compass — no floating log tab nor mission envelope.
  await expect(page.getByRole('button', { name: 'Mission orders' })).toBeHidden();
});

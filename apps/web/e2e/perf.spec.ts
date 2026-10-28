import { expect, test, type Page } from '@playwright/test';

/**
 * Frame budget during gestures (development-plan §Phase 1).
 *
 * Headless Chromium in CI has no GPU: canvas raster runs on the CPU, so CPU throttling
 * slows raster too, which a real phone does on its GPU. The budget is therefore checked as:
 *  1. main-thread (JS) cost of a gesture frame ≤ 4 ms with the CPU throttled ×4, and
 *  2. end-to-end p95 frame time ≤ 16.7 ms during real gestures with software raster
 *     (no GPU: a worst case for raster).
 * Real-device validation stays part of the phase 3 checklist.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'needs the Chrome DevTools Protocol');

async function openDetailedView(page: Page) {
  await page.goto('/lab/map');
  await page.waitForFunction(() => window.__meridianLab?.engine);
  // The detailed (50m) layer over Europe is the heaviest case.
  await page.evaluate(() => window.__meridianLab!.engine!.flyToPoint([10, 48], 4));
  await page.waitForFunction(() => window.__meridianLab!.engine!.camera.lod === '50m', null, {
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
}

test('a gesture frame costs ≤ 4 ms of main-thread work with the CPU throttled ×4', async ({
  page,
  context,
}, info) => {
  await openDetailedView(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ms = await page.evaluate(() => {
    const e = window.__meridianLab!.engine! as unknown as {
      interacting: boolean;
      draw: (fast: boolean) => void;
    };
    e.interacting = true;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) e.draw(true);
    e.interacting = false;
    return (performance.now() - t0) / 30;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`[${info.project.name}] gesture frame JS: ${ms.toFixed(2)} ms (CPU ×4)`);
  expect(ms).toBeLessThanOrEqual(4);
});

test('pan and zoom gestures keep p95 ≤ 16.7 ms with software raster', async ({ page }, info) => {
  await openDetailedView(page);

  // Frames are recorded only while a gesture is in progress.
  const record = (on: boolean) =>
    page.evaluate((on) => {
      const w = window as unknown as { __frames: number[]; __recording: boolean };
      w.__frames ??= [];
      w.__recording = on;
      if (!on) return;
      let last = performance.now();
      const tick = (now: number) => {
        if (!w.__recording) return;
        w.__frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, on);

  const box = (await page.locator('.atlas-map').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await record(true);
  for (let i = 0; i < 80; i++)
    await page.mouse.move(cx + Math.sin(i / 8) * 160, cy + Math.cos(i / 10) * 90);
  await record(false);
  await page.mouse.up();
  await page.waitForTimeout(1200);

  await record(true);
  for (let i = 0; i < 16; i++) await page.mouse.wheel(0, i < 8 ? -60 : 60);
  await record(false);

  const frames = await page.evaluate(() =>
    (window as unknown as { __frames: number[] }).__frames.filter((_, i) => i > 0),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const worst = sorted.at(-1) ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  await info.attach('frame-times.json', {
    body: JSON.stringify({ count: frames.length, median, p95, worst }),
    contentType: 'application/json',
  });
  console.log(
    `[${info.project.name}] frames=${frames.length} median=${median.toFixed(1)} p95=${p95.toFixed(1)} worst=${worst.toFixed(1)} ms`,
  );
  expect(frames.length).toBeGreaterThan(30);
  expect(p95).toBeLessThanOrEqual(16.7 + 1); // + 1 ms of rAF timestamp jitter
  expect(worst).toBeLessThanOrEqual(50);
});

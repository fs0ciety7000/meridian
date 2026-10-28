import { themeColors, tokens } from '@meridian/design-tokens';
import type { RarityTier, RunState } from '@meridian/engine';
import { geoEqualEarth, geoGraticule, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import paperUrl from '../../assets/textures/paper.webp';
import type { GeoData } from '../../map/geodata';
import { pointsBounds } from '../../map/projection';

/**
 * Share postcard (design-system §6.11): 1080 × 1350, always in the Atlas theme — an old
 * postcard recto with the route on an Equal Earth atlas, the rarest stamp as the postage
 * stamp, a round postmark (code + date of play), the distance and the six leg stamps.
 * No personal data.
 */
const W = 1080;
const H = 1350;
const C = themeColors('atlas');
const ORDER: RarityTier[] = ['known', 'trail', 'frontier', 'incognita'];

const font = (weight: number, size: number, family: string, italic = false) =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Stamp outline by tier: circle, rounded square, double octagon, rosette (§2.1). */
function stampShape(
  ctx: CanvasRenderingContext2D,
  tier: RarityTier,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  if (tier === 'known') ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (tier === 'trail') ctx.roundRect(cx - r, cy - r, 2 * r, 2 * r, r * 0.18);
  else {
    const n = tier === 'frontier' ? 8 : 32;
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * 2 * i) / n + (tier === 'frontier' ? Math.PI / 8 : 0);
      const rr = tier === 'incognita' && i % 2 ? r * 0.88 : r;
      ctx[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
  }
  ctx.stroke();
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  tier: RarityTier,
  code: string,
  cx: number,
  cy: number,
  r: number,
  rotation: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.strokeStyle = ctx.fillStyle = C[`rarity-${tier}`];
  ctx.lineWidth = Math.max(2, r * 0.06);
  stampShape(ctx, tier, 0, 0, r);
  if (tier === 'frontier' || tier === 'incognita') {
    ctx.lineWidth /= 2;
    stampShape(ctx, tier, 0, 0, r * 0.82);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(600, r * 0.52, tokens.font.map);
  ctx.fillText(code, 0, 0);
  ctx.restore();
}

export async function renderPostcard(
  run: RunState,
  geo: GeoData,
  opts: { locale: 'fr' | 'en'; title: string; distanceGroups: string[]; renownLabel: string },
): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper
  ctx.fillStyle = C['paper-100'];
  ctx.fillRect(0, 0, W, H);
  try {
    const paper = await loadImage(paperUrl);
    ctx.globalAlpha = 0.9;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(paper, 'repeat')!;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  } catch {
    /* plain paper */
  }
  // Double rule frame
  ctx.strokeStyle = C['ink-900'];
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(46, 46, W - 92, H - 92);

  // Atlas: Equal Earth rotated and fitted on the route
  const exp = run.expedition;
  const stops = [
    exp.start.lonLat as [number, number],
    ...run.legs.filter((l) => l.valid).map((l) => l.pick.lonLat as [number, number]),
  ];
  const lons = stops.map((p) => p[0]);
  const centre = (Math.min(...lons) + Math.max(...lons)) / 2;
  const [w, s, e, n] = pointsBounds(stops, centre);
  const mapBox = { x: 76, y: 210, w: W - 152, h: 760 };
  const projection = geoEqualEarth().rotate([-centre, 0]);
  const pad = 12;
  const east = e < w ? e + 360 : e;
  projection.fitExtent(
    [
      [mapBox.x + 40, mapBox.y + 40],
      [mapBox.x + mapBox.w - 40, mapBox.y + mapBox.h - 40],
    ],
    {
      type: 'MultiPoint',
      coordinates: [
        [w - pad, s - pad],
        [east + pad, n + pad],
        [w - pad, n + pad],
        [east + pad, s - pad],
      ],
    },
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);
  ctx.clip();
  const path = geoPath(projection, ctx);
  ctx.fillStyle = C['sea-100'];
  ctx.fillRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);
  ctx.beginPath();
  path(geoGraticule().step([15, 15])() as GeoPermissibleObjects);
  ctx.strokeStyle = C['sea-300'];
  ctx.lineWidth = 0.8;
  ctx.stroke();
  const layer = geo.layers['50m'] ?? geo.layers['110m'];
  const visited = new Map(run.legs.map((l) => [l.pick.iso3, l]));
  for (const u of [...layer.units, ...geo.micro.units]) {
    ctx.beginPath();
    path(u.geometry as GeoPermissibleObjects);
    const leg = u.entity ? visited.get(u.entity) : undefined;
    ctx.fillStyle = C['paper-200'];
    ctx.fill();
    if (leg?.valid) {
      ctx.fillStyle = `${C[`rarity-${leg.rarity?.tier ?? 'known'}`]}40`;
      ctx.fill();
    }
  }
  ctx.beginPath();
  path(layer.coast as GeoPermissibleObjects);
  ctx.strokeStyle = C['ink-900'];
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  path(layer.borders as GeoPermissibleObjects);
  ctx.strokeStyle = C['sepia-600'];
  ctx.lineWidth = 0.7;
  ctx.setLineDash([4, 2]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Meridian of the expedition
  ctx.beginPath();
  path({
    type: 'LineString',
    coordinates: Array.from({ length: 37 }, (_, i) => [exp.meridianLon, -90 + i * 5]),
  });
  ctx.strokeStyle = C['meridian-500'];
  ctx.lineWidth = 2;
  ctx.stroke();
  // Route (great circles) and camps
  ctx.beginPath();
  for (let i = 1; i < stops.length; i++)
    path({ type: 'LineString', coordinates: [stops[i - 1]!, stops[i]!] });
  ctx.strokeStyle = C['vermilion-600'];
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
  stops.forEach((p, i) => {
    const q = projection(p);
    if (!q) return;
    ctx.beginPath();
    ctx.arc(q[0], q[1], i ? 9 : 11, 0, Math.PI * 2);
    ctx.fillStyle = i ? C['vermilion-600'] : C['paper-100'];
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C['ink-900'];
    ctx.stroke();
  });
  ctx.restore();
  ctx.strokeStyle = C['ink-900'];
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);

  // Title
  ctx.fillStyle = C['ink-900'];
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(500, 22, tokens.font.map);
  ctx.letterSpacing = '6px';
  ctx.fillText('MERIDIAN', 80, 112);
  ctx.letterSpacing = '0px';
  ctx.font = font(500, 54, tokens.font.display);
  ctx.fillText(opts.title, 80, 172, 640);

  // Postage stamp: the rarest tier of the run
  const tiers = run.legs.filter((l) => l.valid && l.rarity).map((l) => l.rarity!.tier);
  const rarest = tiers.sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0];
  if (rarest) {
    const best = run.legs.find((l) => l.valid && l.rarity?.tier === rarest)!;
    ctx.fillStyle = C['paper-100'];
    ctx.fillRect(840, 70, 160, 120);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = C['ink-700'];
    ctx.strokeRect(840, 70, 160, 120);
    ctx.setLineDash([]);
    drawStamp(ctx, rarest, best.pick.iso3, 920, 130, 46, -0.12);
  }
  // Round postmark: code + date of play
  ctx.save();
  ctx.translate(790, 160);
  ctx.rotate(-0.2);
  ctx.strokeStyle = `${C['ink-900']}b3`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${C['ink-900']}b3`;
  ctx.textAlign = 'center';
  ctx.font = font(500, 15, tokens.font.mono);
  ctx.fillText(exp.code, 0, -4);
  const date = new Date(run.finishedAt ?? run.startedAt);
  ctx.fillText(
    date
      .toLocaleDateString(opts.locale === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      .toUpperCase(),
    0,
    16,
  );
  ctx.restore();

  // Distance and renown
  ctx.textAlign = 'left';
  ctx.fillStyle = C['ink-900'];
  // Monospaced figures grouped by threes with a narrow gap (a no-break space is a full digit).
  ctx.font = font(500, 96, tokens.font.mono);
  let x = 80;
  for (const group of [...opts.distanceGroups, 'km']) {
    if (group === 'km') x += 30;
    ctx.fillText(group, x, 1100);
    x += ctx.measureText(group).width + 18;
  }
  ctx.font = font(400, 30, tokens.font.display, true);
  ctx.fillStyle = C['ink-700'];
  ctx.fillText(opts.renownLabel, 82, 1150);

  // Six leg stamps
  exp.legs.forEach((_, i) => {
    const l = run.legs[i];
    const cx = 130 + i * 164;
    const cy = 1240;
    if (l?.valid && l.rarity)
      drawStamp(ctx, l.rarity.tier, l.pick.iso3, cx, cy, 52, (((i * 37) % 17) - 8) / 60);
    else {
      ctx.strokeStyle = C['paper-400'];
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (l) {
        ctx.fillStyle = C['vermilion-700'];
        ctx.font = font(500, 40, tokens.font.display);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', cx, cy);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      }
    }
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('postcard'))), 'image/png'),
  );
}

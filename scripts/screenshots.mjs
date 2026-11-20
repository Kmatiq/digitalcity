/**
 * Screenshot + console-error check via window.__stadsplattan hooks.
 * Usage: node scripts/screenshots.mjs [baseUrl] [--scale=1]
 * Views: desktop, Galaxy Fold closed (cover screen) and unfolded (approx. CSS px).
 * NOTE: the cloud browser renders with SwiftShader (~1 FPS); FPS here says nothing
 * about real devices.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${process.env.NODE_PATH ?? '/usr/local/lib/node_modules'}/playwright`));
}

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
const scale = Number((process.argv.find((a) => a.startsWith('--scale=')) ?? '--scale=1').slice(8));
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const scenesArg = (process.argv.find((a) => a.startsWith('--scenes=')) ?? '').slice(9);
const extra = (process.argv.find((a) => a.startsWith('--q=')) ?? '').slice(4);
mkdirSync('shots', { recursive: true });

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'fold-closed', width: 360, height: 860, touch: true },
  { name: 'fold-open', width: 720, height: 800, touch: true },
];

const SCENES = [
  { id: 'menu', query: '?headless&time=2026-06-15T09:30:00Z' },
  {
    id: 'explore',
    query: '?headless&mode=explore&time=2026-06-15T09:30:00Z',
    camera: [
      [420, 380, 520],
      [0, 0, 0],
    ],
  },
  {
    id: 'pick',
    query: '?headless&mode=explore&time=2026-06-15T09:30:00Z',
    camera: [
      [160, 170, 140],
      [-14, 12, -93],
    ],
    tapCenter: true,
  },
  {
    id: 'edge',
    query: '?headless&mode=explore&time=2026-06-15T15:30:00Z',
    camera: [
      [1250, 120, 1150],
      [820, -15, 760],
    ],
  },
];

async function waitIdle(page, timeoutMs) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(() => window.__stadsplattan?.getStats());
    if (s && s.loading === 0 && Object.values(s.layers).every((v) => v !== 'loading')) {
      if (++quiet >= 4) return s;
    } else quiet = 0;
    await page.waitForTimeout(1000);
  }
  return page.evaluate(() => window.__stadsplattan?.getStats());
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
for (const v of VIEWS) {
  if (only && !only.split(',').includes(v.name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: scale,
    hasTouch: v.touch,
    isMobile: v.touch,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${v.name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${v.name}] pageerror ${e.message}`));
  for (const s of SCENES) {
    if (scenesArg && !scenesArg.split(',').includes(s.id)) continue;
    await page.goto(base + s.query + (extra ? `&${extra}` : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stadsplattan?.ready(), null, { timeout: 180000 });
    if (s.camera) await page.evaluate((c) => window.__stadsplattan.setCamera(c[0], c[1]), s.camera);
    const stats = await waitIdle(page, 120000);
    await page.waitForTimeout(1500);
    if (s.tapCenter) {
      const x = Math.round(v.width / 2);
      const y = Math.round(v.height / 2);
      if (v.touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page
        .waitForSelector('.card', { timeout: 60000 })
        .catch(() => console.log('  no info card'));
      const card = await page.$eval('.card', (el) => el.textContent).catch(() => null);
      console.log('  card:', card);
    }
    const file = `shots/${v.name}-${s.id}.png`;
    await page.screenshot({ path: file, timeout: 240000 });
    console.log(file, JSON.stringify(stats));
    if (process.argv.includes('--inspect')) {
      const info = await page.evaluate(() => {
        const bg = window.__stadsplattan.engine.scene.getObjectByName('buildings');
        const out = { meshes: 0, neutral: 0, verts: 0, mats: {} };
        bg?.traverse((o) => {
          if (!o.isMesh) return;
          out.meshes++;
          const k = o.material.name || o.material.type;
          out.mats[k] = (out.mats[k] || 0) + 1;
          const c = o.geometry.attributes.color;
          if (!c) return;
          for (let i = 0; i < c.count; i += 5) {
            out.verts++;
            if (Math.abs(c.getX(i) - 0.578) < 0.01 && Math.abs(c.getZ(i) - 0.47) < 0.02)
              out.neutral++;
          }
        });
        return out;
      });
      console.log('  buildings:', JSON.stringify(info));
    }
  }
  await ctx.close();
}
await browser.close();
console.log(
  errors.length ? `CONSOLE ERRORS (${errors.length}):\n${errors.join('\n')}` : 'console errors: 0',
);

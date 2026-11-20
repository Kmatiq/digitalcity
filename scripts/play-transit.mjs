/**
 * E2E smoke test for Trafikledare: intro -> start -> incident -> crew -> reroute -> draw line.
 * Usage: NODE_PATH=$(npm root -g) node scripts/play-transit.mjs [--view=desktop|fold-closed|fold-open]
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.NODE_PATH}/playwright`);
const viewName = (process.argv.find((a) => a.startsWith('--view=')) ?? '--view=desktop').slice(7);
const VIEWS = {
  desktop: { width: 1280, height: 800, touch: false },
  'fold-closed': { width: 360, height: 860, touch: true },
  'fold-open': { width: 720, height: 800, touch: true },
};
const v = VIEWS[viewName];
mkdirSync('shots', { recursive: true });

const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await b.newContext({
  viewport: { width: v.width, height: v.height },
  hasTouch: v.touch,
  isMobile: v.touch,
});
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => {
  await p.screenshot({ path: `shots/${viewName}-game-${name}.png`, timeout: 240000 });
  console.log('shot', name);
};
const tap = async (sel) => {
  const el = await p.waitForSelector(sel, { timeout: 120000 });
  if (v.touch) await el.tap();
  else await el.click();
};

await p.goto(
  'http://localhost:5173/?headless&mode=transit_game&quality=medium&time=2026-06-15T09:30:00Z',
);
await p.waitForFunction(() => window.__stadsplattan?.ready(), null, { timeout: 180000 });
await p.waitForTimeout(15000);
await shot('1-intro');
await tap('.g-card .g-act.primary');
await p.waitForSelector('.g-chip', { timeout: 240000 });
console.log('incident:', await p.$eval('.g-chip', (e) => e.textContent));
await tap('.g-chip');
await p.waitForSelector('.g-panel', { timeout: 30000 });
await p.waitForTimeout(8000); // camera flies to the incident
await shot('2-incident');
await tap('.g-panel .g-act.primary');
const lineBtn = await p.$('.g-line:not(:disabled)');
if (lineBtn) await (v.touch ? lineBtn.tap() : lineBtn.click());
await tap('.g-panel .g-act:not(.primary)');
await p.waitForSelector('.g-draw', { timeout: 30000 });
const pts = [
  [0.3, 0.55],
  [0.5, 0.45],
  [0.7, 0.55],
];
for (const [fx, fy] of pts) {
  const x = Math.round(v.width * fx);
  const y = Math.round(v.height * fy);
  if (v.touch) await p.touchscreen.tap(x, y);
  else await p.mouse.click(x, y);
  await p.waitForTimeout(2500);
}
console.log('draw banner:', await p.$eval('.g-draw span', (e) => e.textContent));
await shot('3-draw');
await tap('.g-draw .primary');
await p.waitForTimeout(6000);
console.log('top:', await p.$eval('.g-top', (e) => e.textContent));
await tap('.g-chip');
await p.waitForTimeout(3000);
await shot('4-after');
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'console errors: 0');
await b.close();

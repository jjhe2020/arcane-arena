import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.ARENA_TEST_URL ?? 'http://localhost:4173';
const output = 'artifacts/battle-presentation';
const results = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  // A slow first texture must hold the reveal and every simulation clock,
  // then release normally once the actual atlas becomes usable.
  {
    // Route fixtures must reach Playwright rather than the production service worker.
    // Offline cache behavior is exercised separately by pwa-smoke.mjs.
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
    const errors = [], held = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.arena?.state);
    await page.locator('#seedInput').fill('743');
    await page.locator('[data-action=newGame]').click();
    await page.waitForFunction(() => window.arena.renderer.diagnostics().unitBodies.some(b => b.image?.endsWith('/idle.webp')));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/art/characters/*/idle.webp', async route => {
      held.push(route.request().url());
      await gate;
      await route.continue();
    });
    try {
      await page.evaluate(() => window.arena.begin());
      await page.waitForFunction(() => window.arena.renderer.diagnostics().view.blend === 1);
      await page.waitForTimeout(1500);
      assert(held.length > 0, 'Slow-loading fixture did not intercept an enemy atlas');
      const waiting = await page.evaluate(() => ({ intro: window.arena.renderer.diagnostics().intro, times: window.arena.battles.map(b => b.time) }));
      assert.equal(waiting.intro.ready, false, 'Entry completed while the enemy atlas was still unavailable');
      assert.equal(waiting.intro.enemyOpacity, 0, 'Enemy reveal advanced without the actual body texture');
      assert(waiting.times.every(t => t === 0), 'Battle advanced before the slow enemy texture appeared');
      release();
      await page.waitForFunction(() => window.arena.renderer.battleIntroReady && window.arena.battles.some(b => b.time > 0));
      assert.deepEqual(errors, []);
      results.push({ name: 'slow-enemy-atlas', status: 'passed', held, waiting, checks: ['unavailable enemy texture holds reveal and all clocks', 'entry and battle resume after texture loads'], errors });
      console.log('PASS slow enemy atlas');
    } finally { release(); await page.close(); }
  }
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const page = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1600, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.arena?.state);
    await page.locator('#seedInput').fill('743');
    await page.locator('[data-action=newGame]').click();
    await page.waitForFunction(() => window.arena.renderer.diagnostics().view.blend === 0);
    assert.equal(await page.evaluate(() => window.arena.renderer.diagnostics().intro.maskOpacity), .43);

    async function clickWorld(x, y) {
      const point = await page.evaluate(({ x, y }) => {
        const renderer = window.arena.renderer, p = renderer.project(x, y), box = renderer.canvas.getBoundingClientRect();
        return { x: p.x + box.left, y: p.y + box.top };
      }, { x, y });
      await page.mouse.click(point.x, point.y);
    }
    await clickWorld(4, -7);
    const placed = await page.evaluate(() => ({ ...window.arena.state.players[0].heroes[0] }));
    assert(Math.abs(placed.x - 4) < .01 && Math.abs(placed.y + 7) < .01, 'Legal formation click did not move hero');
    await clickWorld(4, .35);
    assert.deepEqual(await page.evaluate(() => window.arena.state.players[0].heroes[0]), placed, 'Shaded upper half accepted a formation position');
    await page.screenshot({ path: `${output}/${name}-formation.png` });

    // Sample rendered frames and real battle clocks together. No fixed delay
    // is used to infer that a phase completed, including on a slow CI renderer.
    const intro = await page.evaluate(async () => {
      const arena = window.arena, samples = [];
      arena.begin();
      const own = arena.battles.find(b => b.units.some(u => u.side === 0));
      const hero = own.units.find(u => u.side === 0);
      const initial = { x: hero.x, y: hero.y, plannedX: arena.state.players[0].heroes[0].x, plannedY: arena.state.players[0].heroes[0].y, rotation: own.initial.b.id === 0 ? Math.PI : 0 };
      while (!arena.renderer.battleIntroReady) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const diagnostics = arena.renderer.diagnostics();
        samples.push({ ...diagnostics.intro, blend: diagnostics.view.blend, times: arena.battles.map(b => b.time) });
      }
      document.querySelector('[data-action=pause]').click();
      return { initial, samples };
    });
    const sign = intro.initial.rotation ? -1 : 1;
    assert(Math.abs(sign * intro.initial.x - intro.initial.plannedX) < 1e-8);
    assert(Math.abs(sign * intro.initial.y - intro.initial.plannedY) < 1e-8);
    assert(intro.samples.some(s => s.blend > 0 && s.blend < 1), 'Camera skipped intermediate frames');
    assert(intro.samples.some(s => s.blend === 1 && s.maskOpacity > 0), 'Shade disappeared before zoom completed');
    assert(intro.samples.some(s => s.maskOpacity === 0 && s.enemyOpacity > 0 && s.enemyOpacity < 1), 'Enemy reveal did not follow shade removal');
    for (const sample of intro.samples.filter(s => !s.ready)) assert(sample.times.every(t => t === 0), 'Combat advanced during entry presentation');
    const before = await page.evaluate(() => JSON.stringify(window.arena.battles));
    const pair = await page.evaluate(() => window.arena.state.pairs.find(pair => pair.includes(0)));
    const sides = [];
    for (const side of pair) {
      await page.locator(`[data-player="${side}"]`).click();
      await page.waitForFunction(id => Math.abs(window.arena.renderer.diagnostics().view.rotation - (window.arena.battles.find(b => b.units.some(u => u.side === id)).initial.b.id === id ? Math.PI : 0)) < 1e-8, side);
      const geometry = await page.evaluate(id => {
        const renderer = window.arena.renderer, battle = window.arena.battles.find(b => b.units.some(u => u.side === id));
        const box = renderer.canvas.getBoundingClientRect();
        const own = battle.units.filter(u => u.side === id), enemy = battle.units.filter(u => u.side !== id);
        const meanY = units => units.reduce((sum, u) => sum + renderer.project(u.x, u.y).y, 0) / units.length;
        const roundTrips = battle.units.map(u => { const p = renderer.project(u.x, u.y), q = renderer.unproject(p.x + box.left, p.y + box.top); return Math.hypot(q.x - u.x, q.y - u.y); });
        return { side: id, ownY: meanY(own), enemyY: meanY(enemy), roundTrips };
      }, side);
      assert(geometry.ownY > geometry.enemyY, 'Viewed side was not on lower half');
      assert(geometry.roundTrips.every(error => error < 1e-8), 'Picking and rendering use different coordinate systems');
      assert.equal(await page.evaluate(() => JSON.stringify(window.arena.battles)), before, 'Changing viewed side mutated combat or replay state');
      sides.push(geometry);
    }
    await page.screenshot({ path: `${output}/${name}-spectate-b.png` });

    // Mode toggling must stay smooth in both directions and keep the frozen
    // battle intact; the intro is only played once when starting a round.
    await page.locator('[data-player="0"]').click();
    await page.locator('[data-action=plan]').click();
    await page.waitForFunction(() => { const b = window.arena.renderer.diagnostics().view.blend; return b > 0 && b < 1; });
    await page.waitForFunction(() => window.arena.renderer.diagnostics().view.blend === 0);
    await page.locator('[data-action=live]').click();
    await page.waitForFunction(() => { const b = window.arena.renderer.diagnostics().view.blend; return b > 0 && b < 1; });
    await page.waitForFunction(() => window.arena.renderer.diagnostics().view.blend === 1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.arena.battles)), before);
    await page.evaluate(() => window.arena.save());
    await page.reload();
    await page.waitForFunction(() => window.arena?.state);
    assert.equal(await page.evaluate(() => JSON.stringify(window.arena.battles)), before, 'Presentation changes broke paused replay restore');

    // Finish an actual seeded round through the UI, then inspect multiple
    // animation cycles while simulation time and the battle result stay fixed.
    await page.locator('[data-action=speed]').click();
    await page.locator('[data-action=speed]').click();
    await page.locator('[data-action=pause]').click();
    await page.waitForFunction(() => window.arena.state.phase === 'result', undefined, { timeout: 60000 });
    const winner = await page.evaluate(() => window.arena.battles.find(b => b.units.some(u => u.side === 0)).winner);
    assert.notEqual(winner, null, 'Seeded presentation fixture unexpectedly drew');
    await page.locator(`[data-player="${winner}"]`).click();
    await page.waitForFunction(() => window.arena.renderer.diagnostics().unitBodies.some(b => b.action === 'celebrate' && b.image?.includes('/celebrate')));
    const celebration = await page.evaluate(async () => {
      const arena = window.arena, body = () => arena.renderer.diagnostics().unitBodies.find(b => b.action === 'celebrate' && b.image?.includes('/celebrate'));
      const start = body(), samples = [], state = JSON.stringify(arena.battles);
      while (body().age - start.age < 5) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        samples.push(body());
      }
      return { samples, stateUnchanged: JSON.stringify(arena.battles) === state };
    });
    assert(celebration.stateUnchanged, 'Celebration modified battle result');
    assert(celebration.samples.every(s => s.loop === true && s.action === 'celebrate'));
    assert(celebration.samples.some((s, i, all) => i > 0 && s.frame < all[i - 1].frame), 'Celebration did not loop beyond the final frame');
    await page.screenshot({ path: `${output}/${name}-celebrate.png` });
    const completed = await page.evaluate(() => { window.arena.save(); return JSON.stringify(window.arena.battles); });
    await page.reload();
    await page.waitForFunction(() => window.arena?.renderer?.diagnostics().unitBodies.some(b => b.action === 'celebrate' && b.image?.includes('/celebrate')));
    assert.equal(await page.evaluate(() => JSON.stringify(window.arena.battles)), completed, 'Result restore changed completed battle');
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.arena.renderer.loadErrors), []);
    results.push({ name, status: 'passed', checks: ['formation shade and legal placement', 'unchanged formation and battle spawn', 'smooth zoom then shade removal then enemy reveal', 'all battle clocks frozen until entry completes', 'both participants appear below with inverse picking', 'view changes preserve replay state', 'smooth mode changes and paused restore', 'real round victory celebration loops for over two cycles'], intro, sides, celebrationFrames: celebration.samples.map(s => s.frame), errors });
    await page.close();
    console.log(`PASS battle presentation ${name}`);
  }
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ status: 'passed', results }, null, 2));
} catch (error) {
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ status: 'failed', results, message: String(error.stack ?? error) }, null, 2));
  throw error;
} finally { await browser.close(); }

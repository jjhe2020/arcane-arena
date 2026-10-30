import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const URL = process.env.ARENA_TEST_URL ?? 'http://localhost:5173', SAVE = 'arcane-arena.save.v1';
const output = 'artifacts/ui-integrity', results = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
async function run(name, test) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('**', () => {}); // One source revision per page; no HMR during fault injection.
  try {
    const evidence = await test(page);
    assert.deepEqual(errors, [], 'Unexpected browser runtime errors');
    await page.screenshot({ path: `${output}/${name}.png` });
    results.push({ name, status: 'passed', evidence, errors });
    console.log(`PASS ${name}`);
  } catch (error) {
    const ui = await page.evaluate(() => ({ phase: window.arena?.state?.phase,
      dialog: document.querySelector('#dialog')?.textContent,
      toast: document.querySelector('#toast')?.textContent,
      loading: document.querySelector('.game-loading')?.textContent,
      badge: document.querySelector('#saveStatus')?.textContent })).catch(() => ({}));
    await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
    results.push({ name, status: 'failed', error: String(error?.stack ?? error), ui, errors });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}
async function load(page) { await page.goto(URL); await page.waitForFunction(() => window.arena?.state); }
async function fresh(page, seed = 743) {
  await load(page); await page.locator('#seedInput').fill(String(seed)); await page.locator('[data-action=newGame]').click();
}
async function progressing(page) {
  await page.waitForFunction(() => window.arena.state.phase === 'battle' && window.arena.battles.some(b => b.time > .5));
  return page.evaluate(() => Math.max(...window.arena.battles.map(b => b.time)));
}
try {
  for (const mode of ['getItem', 'setItem']) await run(`storage-${mode}-denied`, async page => {
    await page.addInitScript(method => {
      window.__denyStorage = true;
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (window.__denyStorage) throw new DOMException(`Test ${method} denied`, 'SecurityError');
        return Reflect.apply(original, this, args);
      };
    }, mode);
    await fresh(page); assert.equal(await page.locator('.game-loading').count(), 0);
    assert.equal(await page.locator('#saveStatus').isVisible(), true);
    assert.match(await page.locator('.session-controls>small').innerText(), /未保存/);
    await page.locator('#ready').click(); const elapsed = await progressing(page);
    await page.locator('[data-action=pause]').click();
    await page.evaluate(() => { window.__denyStorage = false; });
    await page.locator('#saveStatus').click();
    assert.equal(await page.locator('#saveStatus').isHidden(), true);
    assert.doesNotMatch(await page.locator('.session-controls>small').innerText(), /未保存/);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
    assert.equal(JSON.parse(saved.state).phase, 'battle');
    assert(saved.battles.every(b => b.tickCount > 0));
    assert.match(await page.locator('#toast').innerText(), /已保存/);
    return { elapsed, savedBattleCount: saved.battles.length, retrySaved: true };
  });

  let validBattleSave;
  await run('valid-battle-save-baseline', async page => {
    await fresh(page); await page.locator('#ready').click(); await progressing(page);
    await page.locator('[data-action=pause]').click();
    validBattleSave = await page.evaluate(key => { window.arena.save(); return localStorage.getItem(key); }, SAVE);
    assert.equal(JSON.parse(validBattleSave).battles.length, 4);
    await page.reload(); await page.waitForFunction(() => window.arena?.state);
    assert.equal(await page.evaluate(() => window.arena.state.phase), 'battle');
    assert.equal(await page.locator('.recovery-notice').count(), 0);
    return { originalBytes: Buffer.byteLength(validBattleSave), restoredBattleCount: 4 };
  });
  const corruptions = {
    missing: data => data.battles.pop(),
    seed: data => data.battles[0].initial.seed++,
    participant: data => { data.battles[0].initial.a = structuredClone(data.battles[0].initial.b); },
  };
  for (const [kind, corrupt] of Object.entries(corruptions)) await run(`damaged-battle-${kind}`, async page => {
    assert(validBattleSave, 'Valid replay baseline was not produced');
    const data = JSON.parse(validBattleSave); corrupt(data); const raw = JSON.stringify(data);
    await page.addInitScript(({ key, raw }) => {
      if (!localStorage.getItem('ui-integrity-seeded')) {
        localStorage.setItem(key, raw); localStorage.setItem('ui-integrity-seeded', '1');
      }
    }, { key: SAVE, raw });
    await load(page); await page.locator('.recovery-notice').waitFor();
    assert.equal(await page.locator('#dialog').evaluate(d => d.open), true);
    assert.equal(await page.evaluate(() => window.arena.state.phase), 'prep');
    const saved = await page.evaluate(key => ({ current: localStorage.getItem(key), backup: localStorage.getItem(`${key}.previous`) }), SAVE);
    assert.equal(saved.current, raw); assert.equal(saved.backup, raw);
    const downloadPromise = page.waitForEvent('download'); await page.locator('[data-action=backupSave]').click();
    const downloaded = await downloadPromise, downloadPath = `${output}/${kind}-backup.json`;
    await downloaded.saveAs(downloadPath); assert.equal(await fs.readFile(downloadPath, 'utf8'), raw);
    await page.locator('[data-action=newGame]').click(); assert.equal(await page.locator('#ready').isEnabled(), true);
    await page.locator('#ready').click(); const elapsed = await progressing(page);
    assert.equal(await page.evaluate(key => localStorage.getItem(`${key}.previous`), SAVE), raw);
    await page.locator('[data-action=pause]').click();
    await page.reload(); await page.waitForFunction(() => window.arena?.state);
    assert.equal(await page.evaluate(() => window.arena.state.phase), 'battle');
    assert.equal(await page.locator('.recovery-notice').count(), 0);
    return { corruptedBytes: Buffer.byteLength(raw), backupExact: true, newBattleElapsed: elapsed, newSaveReloaded: true };
  });

  await run('live-role-snapshot', async page => {
    await fresh(page); await page.locator('#ready').click(); await page.locator('[data-action=pause]').click();
    const readInfo = () => page.evaluate(() => ({
      heading: document.querySelector('#infoContent .unit-heading').innerText,
      portrait: document.querySelector('#infoContent .portrait-img').style.backgroundImage,
      stats: document.querySelector('#infoContent .unit-stats').innerText,
      label: document.querySelector('#infoContent .tiny-label').textContent,
    }));
    const before = await readInfo(); assert.match(before.heading, /近战肉盾/); assert.equal(before.label, '本轮实战快照');
    await page.locator('#infoContent [data-action=reselect]').click(); await page.locator('[data-role=mage]').click();
    await page.locator('#dialogFooter [data-action=close]').click();
    const live = await readInfo(); assert.deepEqual(live, before);
    const roles = await page.evaluate(() => ({ planned: window.arena.state.players[0].heroes[0].role,
      live: window.arena.battles.flatMap(b => b.units).find(u => u.side === 0 && !u.summoned).role }));
    assert.deepEqual(roles, { planned: 'mage', live: 'tank' });
    await page.locator('[data-action=plan]').click(); const planned = await readInfo();
    assert.match(planned.heading, /远程法师/); assert.equal(planned.label, '下轮计划');
    assert.notEqual(planned.portrait, before.portrait); assert.notEqual(planned.stats, before.stats);
    await page.locator('[data-action=live]').click(); assert.deepEqual(await readInfo(), before);
    return { roles, liveHeading: before.heading, plannedHeading: planned.heading, correctPortraitAndStats: true };
  });

  await run('granted-skill-details-and-cooldown', async page => {
    await load(page);
    const parent = 'dragon_knight_elder_dragon_form', child = 'dragon_knight_fireball';
    let seed;
    for(let n=1;n<=64;n++){
      const candidate=Math.imul(n,0x9e3779b9)>>>0;
      await page.locator('#seedInput').fill(String(candidate));await page.locator('[data-action=newGame]').click();
      if(await page.evaluate(id=>window.arena.state.matchSkillIds.includes(id),parent)){seed=candidate;break;}
      await page.locator('.session-controls [data-action=menu]').click();
    }
    if(seed===undefined)throw new Error('No public new-game seed contains the required parent');
    // Fund this test fixture, then acquire all six points through actual public
    // purchases and weighted rerolls; no granted slot or cooldown is fabricated.
    const acquired = await page.evaluate(id => {
      const state = window.arena.state, p = state.players[0]; p.gold = 3000;
      let deployments = 0, deployedInstance;
      // Dispatch the existing UI handlers. Importing game.ts separately can
      // create another Vite module identity and therefore another catalog WeakMap.
      for (let n = 0; n < 2; n++) document.querySelector('#shopUpgrade').click();
      for (let attempts = 0; attempts < 1000 && (p.heroes[0].skills.find(s => s?.id === id)?.points ?? 0) < 6; attempts++) {
        const index = p.shop.indexOf(id);
        document.querySelector(index >= 0 ? `[data-buy="${index}"]` : '#reroll').click();
        const reserveIndex = p.reserve.findIndex(skill => skill?.id === id);
        if (reserveIndex >= 0) {
          const stack = p.reserve[reserveIndex], gold = p.gold;
          if (p.heroes[0].skills.some(Boolean) || stack.points !== 1) throw new Error('First parent purchase must enter reserve before any automatic equipment');
          document.querySelector(`[data-reserve="${reserveIndex}"]`).click();
          document.querySelector('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
          if (p.reserve[reserveIndex] !== null || p.heroes[0].skills[0]?.instanceId !== stack.instanceId || p.heroes[0].skills[0]?.points !== stack.points || p.gold !== gold) throw new Error('Actual reserve-to-hero UI deployment must be free and preserve the instance');
          deployments++; deployedInstance = stack.instanceId;
        }
      }
      // Legal formation positions put the real combatants inside Fireball range.
      for (const player of state.players) for (const hero of player.heroes) { hero.x = 0; hero.y = -2; }
      if (!window.arena.save()) throw new Error('Funded test fixture failed normal game serialization');
      const owned = p.heroes[0].skills.find(s => s?.id === id);
      if (deployments !== 1 || owned?.instanceId !== deployedInstance) throw new Error('Repeated purchases must upgrade the single deployed instance in place');
      return { points: owned?.points, deployments, instanceId: deployedInstance };
    }, parent);
    assert.equal(acquired.points, 6); assert.equal(acquired.deployments, 1);
    await page.locator('#infoContent [data-action=reselect]').click(); await page.locator('[data-role=mage]').click();
    await page.locator('#dialogFooter [data-action=close]').click();
    await page.locator('[data-action=plan]').click(); await page.locator('#ready').click();
    await page.waitForFunction(id => window.arena.battles.some(b => b.events.some(e => e.type === 'cast' && e.skill === id && b.units.find(u => u.id === e.source)?.side === 0)), child);
    await page.locator('[data-action=pause]').click();
    const slot = page.locator(`#infoContent .equipped-list [data-detail="${child}"]`);
    assert.equal(await slot.count(), 1); assert.equal(await slot.locator('.skill-letter').count(), 1);
    assert.doesNotMatch(await slot.getAttribute('aria-label'), /undefined/);
    const cooldown = await page.evaluate(id => {
      const b = window.arena.battles.find(b => b.units.some(u => u.side === 0)), u = b.units.find(u => u.side === 0 && !u.summoned);
      return u.cooldowns[u.skills.findIndex(s => s?.id === id)] - b.time;
    }, child);
    const displayed = parseFloat(await slot.locator('.skill-cooldown').innerText());
    assert(cooldown > 0); assert(Math.abs(displayed - cooldown) <= (cooldown >= 10 ? 1 : .06));
    await slot.click(); assert.equal(await page.locator('#dialog').evaluate(d => d.open), true);
    assert((await page.locator('#dialogTitle').innerText()).length > 0);
    assert.match(await page.locator('#dialogBody').innerText(), /升级授予效果/);
    assert.match(await page.locator('#dialogFooter').innerText(), /由技能升级授予/);
    return { parent, points: acquired.points, deployments: acquired.deployments, instanceId: acquired.instanceId, child, actualCooldown: cooldown, displayedCooldown: displayed,
      dialogTitle: await page.locator('#dialogTitle').innerText(), fallbackIcon: true };
  });
} finally {
  await browser.close();
  const failed = results.filter(r => r.status === 'failed');
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ status: failed.length ? 'failed' : 'passed',
    baseUrl: URL, timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`${results.length - failed.length}/${results.length} UI integrity cases passed`);
  if (failed.length) process.exitCode = 1;
}

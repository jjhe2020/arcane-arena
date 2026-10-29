import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.ARENA_TEST_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true }), reports = [];
const fixtureNote = 'Actual createBattle/stepBattle with catalog definitions: HP 12000, mana 4000, base moveSpeed 0 and nextAttack 100 preserve subjects for observation. Duel/Axes use Gaben; Ink Swell uses Super (one charge). No fabricated statuses, hits, zones, metadata or preview timing. Rendering uses frozen real snapshots and loads actual desktop/mobile atlases. Touch emulation is not physical-device performance evidence.';
const scenarios = [
  { scenario: 'duel', mobile: false }, { scenario: 'ink-tendril', mobile: false }, { scenario: 'ink-burst', mobile: false },
  { scenario: 'duel', mobile: true }, { scenario: 'axes-melee', mobile: true },
];
let currentPage, current;
await fs.mkdir('artifacts', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const page = currentPage = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1600, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const errors = [], webglWarnings = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.type() === 'warning' && /WebGL|GPU|GL_/i.test(message.text()) && webglWarnings.length < 20) webglWarnings.push(message.text());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
    await page.addInitScript(() => { window.qaContextLosses = 0; document.addEventListener('webglcontextlost', () => window.qaContextLosses++, true); });
    await page.routeWebSocket('**', () => {});
    await page.goto(url); await page.waitForFunction(() => window.arena?.state);
    await page.locator('[data-action=close]').last().click();
    if (mobile) await page.locator('.mobile-nav [data-action=cinema]').tap();
    for (const item of scenarios.filter(item => item.mobile === mobile)) {
      current = item;
      const fixture = await page.evaluate(async scenario => {
        const { createBattle, stepBattle } = await import('/src/combat.ts');
        const { activeVisualWorldEffects } = await import('/src/combat/visual-state.ts');
        const arena = window.arena, ink = scenario.startsWith('ink');
        const skill = ink ? 'custom_grimstroke_ink_swell' : scenario === 'duel' ? 'custom_legion_commander_duel' : 'custom_troll_warlord_berserkers_rage';
        const points = ink ? 6 : 9;
        const player = id => ({ id, name: `QA ${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, shop: Array(12).fill(null), reserve: Array(4).fill(null),
          heroes: [0, 1].map(index => ({ id: `h${index}`, name: `QA ${id}-${index}`, role: 'mage', skin: index ? 'male' : 'female',
            x: index && !(ink && !id) ? 11 : 0,
            y: index ? ink && !id ? -.8 : -10 : ink && !id ? -4 : -1,
            skills: !id && !index ? [{ id: skill, points }, null, null, null] : [null, null, null, null] })) });
        const battle = createBattle(player(0), player(1), 771, arena.definitions, undefined, 12);
        for (const unit of battle.units) { unit.hp = unit.maxHp = 12000; unit.mana = unit.maxMana = 4000; unit.moveSpeed = 0; unit.nextAttack = 100; }
        const caster = battle.units[0];
        const tickTimes = () => [...new Set(battle.events.filter(event => event.type === 'hit' && event.skill === skill && event.amount > 0).map(event => event.time))];
        const links = () => battle.units.flatMap(unit => unit.statuses.filter(status => status.kind === 'visualLink' && status.skill === skill && status.data?.layer === 'tendril' && status.until > battle.time).map(status => ({ unit, status })));
        const available = () => {
          if (scenario === 'duel') return caster.statuses.some(status => status.kind === 'duel' && status.data?.externalReduction > 0 && status.until > battle.time);
          if (scenario === 'ink-tendril') return links().length > 0 && tickTimes().length >= 2;
          if (scenario === 'ink-burst') return activeVisualWorldEffects(battle).some(effect => effect.skill === skill && effect.layer === 'burst');
          return (battle.zones ?? []).some(zone => zone.skill === 'troll_warlord_whirling_axes_melee' && zone.layer === 'axe_melee' && zone.until > battle.time);
        };
        for (let i = 0; i < 360 && !available() && !battle.finished; i++) stepBattle(battle, 1 / 30, arena.definitions);
        if (!available()) throw Error(`No real ${scenario} occurrence: time=${battle.time}, finished=${battle.finished}`);
        stepBattle(battle, scenario === 'ink-tendril' ? 1 / 30 : .15, arena.definitions);
        if (!available()) throw Error(`${scenario} expired before its snapshot`);
        const expected = [], evidence = {};
        const clip = layer => arena.renderer.resolveClip(arena.assets.skills[skill].layers[layer]).image;
        if (scenario === 'duel') {
          const status = caster.statuses.find(status => status.kind === 'duel'), target = battle.units.find(unit => unit.id === status.data.targetId);
          const reciprocal = target.statuses.find(status => status.kind === 'duel' && status.data?.targetId === caster.id);
          if (!(status.data.externalReduction > 0 && reciprocal?.data?.externalReduction > 0)) throw Error('Isolation lacks actual two-party reduction');
          const pair = [caster.id, target.id].sort().join('|');
          for (const layer of ['arena', 'isolation']) expected.push({ key: `duel:${pair}:${layer}`, image: clip(layer), x: (caster.x + target.x) / 2, y: (caster.y + target.y) / 2 });
          evidence.pair = [caster.id, target.id]; evidence.reductions = [status.data.externalReduction, reciprocal.data.externalReduction];
        } else if (scenario === 'ink-tendril') {
          for (const { unit: target, status } of links()) {
            const source = battle.units.find(unit => unit.id === status.source);
            if (status.data.beneficiaryId !== source.id || source.side === target.side) throw Error('Ink tendril endpoints are not beneficiary-to-enemy');
            expected.push({ key: `link:${source.id}:${target.id}:${skill}`, image: clip('tendril'), x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 });
          }
          evidence.tickTimes = tickTimes();
          if (Math.abs(evidence.tickTimes[1] - evidence.tickTimes[0] - .2) > 1e-6) throw Error('Ink tendrils did not follow the actual 0.2-second damage ticks');
          evidence.enemyIds = battle.units.filter(unit => unit.side !== caster.side).map(unit => unit.id);
        } else if (scenario === 'ink-burst') {
          const effect = activeVisualWorldEffects(battle).find(effect => effect.skill === skill && effect.layer === 'burst');
          expected.push({ key: `world:${effect.id}:burst`, image: clip('burst'), x: effect.x, y: effect.y });
          evidence.worldEffect = effect;
          evidence.detonationHits = battle.events.filter(event => event.type === 'hit' && event.skill === skill && Math.abs(event.time - effect.createdAt) < 1e-6);
          evidence.enemyIds = battle.units.filter(unit => unit.side !== caster.side).map(unit => unit.id);
          if (!evidence.detonationHits.length) throw Error('Burst was not accompanied by its real detonation');
        } else {
          for (const zone of battle.zones.filter(zone => zone.skill === 'troll_warlord_whirling_axes_melee' && zone.layer === 'axe_melee' && zone.until > battle.time)) {
            if (zone.visualSkill !== skill) throw Error('Axes child lost its real parent art provenance');
            expected.push({ key: `z:${zone.id}:axe_melee`, image: clip('axe_melee'), x: zone.x, y: zone.y });
          }
          evidence.zones = battle.zones.filter(zone => zone.layer === 'axe_melee');
          evidence.childCasts = battle.events.filter(event => event.type === 'cast' && event.skill === 'troll_warlord_whirling_axes_melee');
          evidence.childHits = battle.events.filter(event => event.type === 'hit' && event.skill === 'troll_warlord_whirling_axes_melee');
          if (!evidence.childCasts.length || !evidence.childHits.length) throw Error('Melee Axes were not actually cast and damaging');
        }
        if (!expected.length) throw Error(`No concrete expectation for ${scenario}`);
        if (!window.qaFinishingDraw) window.qaFinishingDraw = arena.renderer.draw.bind(arena.renderer);
        window.qaFinishingBattle = battle; window.qaFinishingExpected = expected;
        arena.renderer.mode = 'spectate'; arena.renderer.layout();
        arena.renderer.draw = (_heroes, _enemy, _battle, _side, dt) => window.qaFinishingDraw([], [], window.qaFinishingBattle, 0, dt);
        return { skill, points, time: battle.time, expected, evidence, snapshot: JSON.stringify(battle) };
      }, item.scenario);
      await page.waitForFunction(() => window.qaFinishingExpected.every(item => {
        const visual = window.arena.renderer.persistentFx.get(item.key);
        return visual?.clip?.image === item.image && visual.mesh.visible && visual.mesh.material.map?.image;
      }), undefined, { timeout: 10000 });
      const actual = await page.evaluate(() => {
        const renderer = window.arena.renderer;
        return { diagnostics: renderer.diagnostics(), effects: [...renderer.persistentFx].map(([key, visual]) => ({ key, image: visual.clip?.image,
          x: visual.group.position.x, y: visual.group.position.y, angle: visual.group.rotation.z, width: visual.mesh.scale.x, height: visual.mesh.scale.y,
          visible: visual.group.visible && visual.mesh.visible })), snapshot: JSON.stringify(window.qaFinishingBattle), contextLosses: window.qaContextLosses,
          contextLost: document.querySelector('#world').getContext('webgl2')?.isContextLost() ?? true };
      });
      assert.equal(actual.snapshot, fixture.snapshot, 'Renderer mutated the real frozen battle');
      for (const expected of fixture.expected) {
        assert(actual.diagnostics.persistentEffectKeys.includes(expected.key), `Missing renderer key ${expected.key}`);
        const effect = actual.effects.find(effect => effect.key === expected.key);
        assert.equal(effect.image, expected.image); assert(effect.visible);
        assert([effect.x, effect.y, effect.width, effect.height, effect.angle].every(Number.isFinite));
        assert(effect.width > 0 && effect.height > 0);
        assert(Math.abs(effect.x - expected.x) < 1e-6 && Math.abs(effect.y - expected.y) < 1e-6, 'Rendered location differs from the true effect center');
      }
      if (item.scenario === 'duel') assert.equal(actual.effects.filter(effect => effect.key.startsWith('duel:')).length, 2, 'Duel must draw one arena and one isolation');
      if (item.scenario.startsWith('ink')) assert(!actual.effects.some(effect => effect.image.endsWith('/coat.webp') && fixture.evidence.enemyIds.some(id => effect.key.startsWith(`s:${id}:`))), 'Ink Swell painted an ally coat on an enemy');
      if (mobile) assert(fixture.expected.every(effect => effect.image.includes('/art/mobile/')), 'Phone FX used a desktop atlas');
      assert.deepEqual(errors, []); assert.deepEqual(actual.diagnostics.loadErrors, []); assert.equal(actual.contextLosses, 0); assert.equal(actual.contextLost, false);
      await page.screenshot({ path: `artifacts/r4-visual-finishing-${item.scenario}${mobile ? '-mobile' : ''}.png` });
      const { snapshot: _fixtureSnapshot, ...fixtureReport } = fixture, { snapshot: _actualSnapshot, ...actualReport } = actual;
      reports.push({ ...item, fixture: fixtureReport, ...actualReport, errors: [...errors], webglWarnings: [...webglWarnings] });
    }
    await page.close(); currentPage = undefined;
  }
  await fs.writeFile('artifacts/visual-finishing-smoke.json', JSON.stringify({ status: 'passed', url, fixtureNote, reports }, null, 2));
  console.log(reports.map(report => ({ scenario: report.scenario, mobile: report.mobile, expectedEffects: report.fixture.expected.length, drawCalls: report.diagnostics.drawCalls })));
} catch (error) {
  if (currentPage) await currentPage.screenshot({ path: 'artifacts/visual-finishing-failure.png' }).catch(() => {});
  const diagnostic = await currentPage?.evaluate(() => ({ renderer: window.arena?.renderer.diagnostics(), expected: window.qaFinishingExpected, time: window.qaFinishingBattle?.time })).catch(() => undefined);
  await fs.writeFile('artifacts/visual-finishing-smoke.json', JSON.stringify({ status: 'failed', url, fixtureNote, current, message: String(error), diagnostic, reports }, null, 2));
  throw error;
} finally { await browser.close(); }

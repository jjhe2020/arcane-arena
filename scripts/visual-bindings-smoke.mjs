import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.ARENA_TEST_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const reports = [];
const fixtureNote = 'Actual createBattle/stepBattle casts and collisions; fixture HP 12000, mana 4000, moveSpeed 0 and disarm on all original heroes keep subjects alive and stationary. No fabricated hit, visual metadata, preview timing or preview path. Frozen snapshots are rendered after simulation; desktop Chromium touch emulation is not phone FPS evidence.';
const scenarios = ['mana-drain', 'dissimilate', 'soulbind', 'plasma-out', 'plasma-return', 'ravage-out', 'ravage-return', 'freezing-empty', 'lich-spire', 'ghostship'];
const mobileScenarios = new Set(['dissimilate', 'plasma-out', 'plasma-return', 'ravage-out', 'ravage-return', 'ghostship']);
let current, currentPage;
await fs.mkdir('artifacts', { recursive: true });

try {
  for (const mobile of [false, true]) {
    const page = currentPage = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1600, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const errors = [], webglWarnings = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.type() === 'warning' && /WebGL|GPU|GL_/i.test(message.text()) && webglWarnings.length < 20) webglWarnings.push(message.text());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
    await page.addInitScript(() => { window.qaContextLosses = 0; document.addEventListener('webglcontextlost', () => window.qaContextLosses++, true); });
    await page.routeWebSocket('**', () => {});
    await page.goto(url);
    await page.waitForFunction(() => window.arena?.state);
    await page.locator('[data-action=close]').last().click();
    for (const scenario of scenarios.filter(name => !mobile || mobileScenarios.has(name))) {
      current = { scenario, mobile };
      const fixture = await page.evaluate(async scenario => {
        const { createBattle, stepBattle } = await import('/src/combat.ts');
        const { activeVisualProjectiles, activeVisualWorldEffects, visualProjectilePosition } = await import('/src/combat/visual-state.ts');
        const { actorEmitter } = await import('/src/animation.ts');
        const arena = window.arena;
        const skill = {
          'mana-drain': 'custom_lion_mana_drain', dissimilate: 'custom_void_spirit_dissimilate', soulbind: 'custom_grimstroke_soul_bind',
          'plasma-out': 'razor_plasma_field', 'plasma-return': 'razor_plasma_field', 'ravage-out': 'custom_tidehunter_ravage', 'ravage-return': 'custom_tidehunter_ravage',
          'freezing-empty': 'custom_crystal_maiden_freezing_field', 'lich-spire': 'custom_lich_chain_frost', ghostship: 'kunkka_ghostship',
        }[scenario];
        const points = scenario === 'freezing-empty' ? 3 : scenario === 'lich-spire' ? 6 : 9;
        const player = id => ({ id, name: `Visual ${id}`, hp: 100, gold: 0, shopLevel: 5, locked: false, shop: Array(12).fill(null), reserve: Array(4).fill(null),
          heroes: Array.from({ length: id === 0 ? 2 : 3 }, (_, index) => ({ id: `p${id}-h${index}`, name: `测试${id}-${index}`, role: 'mage', skin: index % 2 ? 'male' : 'female',
            x: id === 0 ? index * 10 : (index - 1) * 2, y: id === 0 && index ? -10 : -2,
            skills: id === 0 && index === 0 ? [{ id: skill, points }, null, null, null] : [null, null, null, null] })) });
        const battle = createBattle(player(0), player(1), 1781, arena.definitions, undefined, 12);
        for (const unit of battle.units) { unit.hp = unit.maxHp = 12000; unit.mana = unit.maxMana = 4000; unit.moveSpeed = 0; unit.statuses.push({ kind: 'disarm', until: 120 }); }
        const caster = battle.units.find(unit => unit.side === 0 && unit.skills.some(stack => stack?.id === skill));
        let selectedEffectId;
        const available = () => {
          if (scenario === 'mana-drain') return battle.units.some(unit => unit.statuses.some(status => status.kind === 'visualLink' && status.skill === skill && status.until > battle.time));
          if (scenario === 'dissimilate') return caster.statuses.some(status => status.kind === 'visualForm' && status.data?.form === 'dissimilate' && status.until > battle.time + .2);
          if (scenario === 'soulbind') return battle.units.some(unit => unit.statuses.some(status => status.kind === 'soulbind' && String(status.data?.group).split(',').length === 3));
          if (scenario === 'lich-spire') return battle.units.some(unit => unit.summoned && unit.visualBody === 'spire');
          if (scenario === 'ghostship') return activeVisualProjectiles(battle).some(projectile => projectile.layer === 'ghostship_sail' && battle.time - projectile.createdAt > .4);
          if (scenario === 'freezing-empty') {
            const effect = activeVisualWorldEffects(battle).find(effect => effect.skill === skill && !battle.events.some(event => event.type === 'hit' && event.skill === skill && Math.abs(event.time - effect.createdAt) < 1e-7));
            if (effect) selectedEffectId = effect.id;
            return !!effect;
          }
          const phase = scenario.endsWith('-return') ? 'inward' : 'outward';
          return activeVisualWorldEffects(battle).some(effect => effect.skill === skill && effect.phase === phase && effect.progress > .25 && effect.progress < .75 && effect.radius > .1);
        };
        for (let tick = 0; tick < 300 && !available() && !battle.finished; tick++) stepBattle(battle, 1 / 30, arena.definitions);
        if (!available()) throw Error(`Actual simulation did not produce ${scenario}; time=${battle.time}, finished=${battle.finished}`);
        if (['mana-drain', 'dissimilate', 'soulbind', 'lich-spire', 'freezing-empty'].includes(scenario)) stepBattle(battle, .15, arena.definitions);
        const expected = [], expectedBodies = [];
        const clip = (layer, artSkill = skill) => arena.renderer.resolveClip(arena.assets.skills[artSkill].layers[layer]).image;
        if (scenario === 'mana-drain') {
          for (const target of battle.units) for (const status of target.statuses.filter(status => status.kind === 'visualLink' && status.skill === skill && status.until > battle.time)) {
            const source = battle.units.find(unit => unit.id === status.source), start = actorEmitter(arena.assets, source, battle.time);
            expected.push({ key: `link:${source.id}:${target.id}:${skill}`, image: clip('beam'), x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 });
          }
        } else if (scenario === 'dissimilate') {
          const status = caster.statuses.find(status => status.kind === 'visualForm' && status.data?.form === 'dissimilate');
          if (!status) throw Error('Dissimilate expired before snapshot');
          const portals = JSON.parse(status.data.portals);
          portals.forEach((position, index) => expected.push({ key: `portal:${caster.id}:${index}`, image: clip('portal'), ...position }));
        } else if (scenario === 'soulbind') {
          const status = battle.units.flatMap(unit => unit.statuses).find(status => status.kind === 'soulbind' && status.skill === skill);
          const anchor = battle.units.find(unit => unit.id === status.data.anchorId), group = status.data.group.split(',');
          for (const id of group.filter(id => id !== anchor.id)) {
            const target = battle.units.find(unit => unit.id === id), pair = [anchor.id, target.id].sort().join(':');
            expected.push({ key: `bind:${status.source}:${status.data.token}:${pair}`, image: clip('ink_link'), x: (anchor.x + target.x) / 2, y: (anchor.y + target.y) / 2 });
          }
          if (expected.length !== 2) throw Error('Gaben Soulbind did not create the actual three-member anchored star');
        } else if (scenario === 'lich-spire') {
          const spire = battle.units.find(unit => unit.summoned && unit.visualBody === 'spire');
          expectedBodies.push({ id: spire.id, image: clip('spire'), x: spire.x, y: spire.y });
        } else if (scenario === 'ghostship') {
          for (const projectile of activeVisualProjectiles(battle).filter(projectile => projectile.layer === 'ghostship_sail')) expected.push({ key: `motion:${projectile.id}:${projectile.layer}`, image: clip(projectile.layer), ...visualProjectilePosition(projectile, battle.time) });
        } else {
          const phase = scenario.endsWith('-return') ? 'inward' : 'outward';
          const effects = activeVisualWorldEffects(battle).filter(effect => scenario === 'freezing-empty' ? effect.id === selectedEffectId : effect.skill === skill && effect.phase === phase);
          for (const effect of effects) expected.push({ key: `world:${effect.id}:${effect.layer}`, image: clip(effect.layer), x: effect.x, y: effect.y, radius: effect.radius, progress: effect.progress });
          if (scenario === 'freezing-empty' && !effects.length) throw Error('Actual empty explosion expired before snapshot');
        }
        if (!expected.length && !expectedBodies.length) throw Error(`No actual binding expectation for ${scenario}`);
        if (!window.qaOriginalDraw) window.qaOriginalDraw = arena.renderer.draw.bind(arena.renderer);
        window.qaBindingBattle = battle; window.qaBindingExpected = { expected, expectedBodies };
        arena.renderer.mode = 'spectate'; arena.renderer.layout();
        arena.renderer.draw = (_heroes, _enemy, _battle, _side, dt) => window.qaOriginalDraw([], [], window.qaBindingBattle, 0, dt);
        return { skill, points, time: battle.time, expected, expectedBodies, emptyExplosionId: selectedEffectId,
          actualMetadata: scenario === 'ghostship' ? activeVisualProjectiles(battle) : activeVisualWorldEffects(battle), actualCastCount: battle.events.filter(event => event.type === 'cast' && event.skill === skill).length,
          snapshot: JSON.stringify(battle) };
      }, scenario);
      // Read real Three.js mesh state as well as the public key diagnostics. This
      // is QA-only inspection; it does not inject visuals or mutate the scene.
      await page.waitForFunction(() => {
        const renderer = window.arena.renderer, { expected, expectedBodies } = window.qaBindingExpected;
        return expected.every(item => { const visual = renderer.persistentFx.get(item.key); return visual?.clip?.image === item.image && visual.mesh.visible && visual.mesh.material.map?.image; })
          && expectedBodies.every(item => { const visual = renderer.visuals.get(item.id); return visual?.clip?.image === item.image && visual.group.visible && visual.mesh.visible; });
      }, undefined, { timeout: 10000 });
      const actual = await page.evaluate(() => {
        const renderer = window.arena.renderer;
        const detail = ([key, visual]) => ({ key, image: visual.clip?.image, x: visual.group.position.x, y: visual.group.position.y, angle: visual.group.rotation.z,
          width: visual.mesh.scale.x, height: visual.mesh.scale.y, visible: visual.group.visible && visual.mesh.visible });
        return { diagnostics: renderer.diagnostics(), effects: [...renderer.persistentFx].map(detail), bodies: [...renderer.visuals].map(detail),
          snapshot: JSON.stringify(window.qaBindingBattle), contextLosses: window.qaContextLosses, contextLost: document.querySelector('#world').getContext('webgl2')?.isContextLost() ?? true };
      });
      assert.equal(actual.snapshot, fixture.snapshot, `${scenario}: rendering changed the frozen simulation snapshot`);
      for (const expected of fixture.expected) {
        assert(actual.diagnostics.persistentEffectKeys.includes(expected.key), `${scenario}: missing ${expected.key}`);
        const effect = actual.effects.find(effect => effect.key === expected.key);
        assert.equal(effect.image, expected.image); assert(effect.visible);
        assert([effect.x, effect.y, effect.width, effect.height, effect.angle].every(Number.isFinite));
        assert(effect.width > 0 && effect.height > 0);
        assert(Math.abs(effect.x - expected.x) < 1e-6 && Math.abs(effect.y - expected.y) < 1e-6, `${scenario}: displayed center differs from actual simulation coordinates`);
      }
      for (const expected of fixture.expectedBodies) {
        const body = actual.bodies.find(body => body.key === expected.id);
        assert.equal(body?.image, expected.image); assert(body.visible);
        assert([body.x, body.y, body.width, body.height].every(Number.isFinite));
        assert(Math.abs(body.x - expected.x) < 1e-6 && Math.abs(body.y - expected.y) < 1e-6);
      }
      if (scenario === 'soulbind') assert.equal(actual.effects.filter(effect => effect.key.startsWith('bind:')).length, 2, 'Soulbind must draw the real anchored star once per edge');
      if (mobile) assert([...fixture.expected, ...fixture.expectedBodies].every(item => item.image.includes('/art/mobile/')), 'Phone loaded desktop FX/body atlas');
      assert.deepEqual(errors, []); assert.deepEqual(actual.diagnostics.loadErrors, []); assert.equal(actual.contextLosses, 0); assert.equal(actual.contextLost, false);
      await page.screenshot({ path: `artifacts/r4-visual-bindings-${scenario}${mobile ? '-mobile' : ''}.png` });
      const { snapshot: _fixtureSnapshot, ...fixtureReport } = fixture;
      const { snapshot: _actualSnapshot, ...actualReport } = actual;
      reports.push({ ...current, fixture: fixtureReport, ...actualReport, errors: [...errors], webglWarnings: [...webglWarnings] });
    }
    await page.close(); currentPage = undefined;
  }
  await fs.writeFile('artifacts/visual-bindings-smoke.json', JSON.stringify({ status: 'passed', url, fixtureNote, reports }, null, 2));
  console.log(reports.map(report => ({ scenario: report.scenario, mobile: report.mobile, expectedEffects: report.fixture.expected.length, expectedBodies: report.fixture.expectedBodies.length, drawCalls: report.diagnostics.drawCalls })));
} catch (error) {
  if (currentPage) await currentPage.screenshot({ path: 'artifacts/visual-bindings-failure.png' }).catch(() => {});
  const diagnostic = await currentPage?.evaluate(() => ({ renderer: window.arena?.renderer.diagnostics(), expected: window.qaBindingExpected, time: window.qaBindingBattle?.time })).catch(() => undefined);
  await fs.writeFile('artifacts/visual-bindings-smoke.json', JSON.stringify({ status: 'failed', url, fixtureNote, current, message: String(error), diagnostic, reports }, null, 2));
  throw error;
} finally { await browser.close(); }

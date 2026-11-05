import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const browser = await chromium.launch({headless:true});
await mkdir('artifacts/r14-gameplay', {recursive:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.arenaAudioDurations = [];
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function(when) {
      window.arenaAudioDurations.push(Math.round((when - this.context.currentTime) * 100));
      return stop.call(this, when);
    };
  });
  await page.goto(process.env.ARENA_TEST_URL ?? 'http://localhost:4173');
  await page.waitForFunction(() => window.arena);
  assert.equal(await page.locator('#godSelect option').count(), 11);
  await page.locator('#godSelect').selectOption('centaur');
  assert.match(await page.locator('#godPreview').textContent(), /反弹/);
  await page.locator('#seedInput').fill('743');
  await page.screenshot({path:'artifacts/r14-gameplay/god-selection.png'});
  await page.locator('[data-action=newGame]').click();
  const gods = await page.evaluate(() => window.arena.state.players.map(p => p.god?.id));
  assert.equal(gods[0], 'centaur');
  assert.ok(gods.slice(1).every(Boolean) && new Set(gods.slice(1)).size > 1);

  await page.locator('[data-hero="0"]').click();
  const options = page.locator('[data-enchant-option]');
  const grades = await options.locator('[data-grade]').evaluateAll(elements => elements.map(element => element.dataset.grade));
  assert.equal(grades.length, 3);
  assert.equal(new Set(grades).size, 3);
  await options.first().click();
  const original = await page.evaluate(() => window.arena.state.players[0].heroes[0].enchantmentId);
  await page.locator('[data-action=enchantHero]').click();
  await page.locator('[data-enchant-redraw="0"]').click();
  assert.equal(await options.count(), 4);
  assert.equal(await options.evaluateAll((elements, current) => elements.some(element => element.dataset.enchantOption === current), original), false);
  assert.equal(await page.evaluate(() => window.arena.state.players[0].gold), 4);
  await page.screenshot({path:'artifacts/r14-gameplay/enchantment-redraw.png'});
  await options.first().click();

  await page.locator('[data-buy="0"]').click({button:'right'});
  const sample = page.locator('[data-skill-audio]');
  await sample.click();
  assert.ok(await page.evaluate(() => window.arenaAudioDurations.length > 0), 'Skill preview did not schedule audio');
  await page.locator('#dialogFooter [data-action=close]').click();
  await page.locator('[data-action=settings]').click();
  await page.locator('[data-action=audio]').click();
  assert.equal(await page.locator('[data-action=audio]').getAttribute('aria-pressed'), 'false');
  await page.locator('#dialogFooter [data-action=close]').click();
  const mutedCount = await page.evaluate(() => window.arenaAudioDurations.length);
  await page.locator('[data-buy="0"]').click({button:'right'});
  await sample.click();
  assert.equal(await page.evaluate(() => window.arenaAudioDurations.length), mutedCount);
  await page.locator('#dialogFooter [data-action=close]').click();
  await page.locator('[data-action=settings]').click();
  await page.locator('[data-action=audio]').click();
  await page.locator('#dialogFooter [data-action=close]').click();

  await page.locator('[data-buy="0"]').click();
  await page.locator('[data-reserve="0"]').click();
  await page.locator('[data-team-hero="0"][data-slot="0"]').click();
  await page.evaluate(() => {
    // Give the player a predictable victory while using the live combat and settlement paths.
    const players = window.arena.state.players;
    players[0].heroes[0].persistentAttackBonus = 9000;
    for (const player of players) Object.assign(player.heroes[0], {x:0,y:-1});
  });
  await page.locator('#ready').click();
  assert.equal(await page.evaluate(() => window.arena.state.players[0].shopCarryDiscount), 1);
  await page.evaluate(() => {
    // Other boards still resolve through combat, but one hit is enough to finish them.
    for (const battle of window.arena.battles) {
      if (!battle.units.some(unit => unit.side === 0)) for (const unit of battle.units) unit.hp = 1;
    }
  });
  await page.locator('[data-action=speed]').click();
  await page.locator('[data-action=speed]').click();
  const impact = page.locator('.round-impact b').first();
  try { await impact.waitFor({timeout:60000}); }
  catch (error) {
    console.error(await page.evaluate(() => ({phase:window.arena.state.phase, history:window.arena.state.history.map(r => [r.a,r.b,r.winner]), battles:window.arena.battles.map(b => [b.time,b.finished,b.winner]), toast:document.querySelector('#toast').textContent})), errors);
    throw error;
  }
  const label = await impact.textContent();
  const settlement = await page.evaluate(() => {
    const state = window.arena.state;
    const report = state.history.find(r => r.a === 0 || r.b === 0);
    const opponent = state.players[report.a === 0 ? report.b : report.a];
    return {winner:report.winner, label:`${opponent.name} −${state.battlePlayers[opponent.id].hp - opponent.hp} HP`, audio:window.arenaAudioDurations};
  });
  assert.equal(settlement.winner, 0);
  assert.equal(label, settlement.label);
  assert.ok(settlement.audio.some(length => length >= 40), 'Settlement did not schedule the impact cue');
  await page.waitForTimeout(420);
  await page.screenshot({path:'artifacts/r14-gameplay/settlement.png'});
  assert.deepEqual(errors, []);
  const result = {status:'passed',gods,arrivalGrades:grades,redrawCount:4,settlement:label,audioNotes:settlement.audio.length};
  await writeFile('artifacts/r14-gameplay/report.json', JSON.stringify(result,null,2));
  console.log(result);
} finally { await browser.close(); }

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.ARENA_TEST_URL ?? 'http://127.0.0.1:5173';
const output = 'artifacts/shop-menu-smoke';
const difficulties = Array.from({ length: 16 }, (_, index) => ((10 + index) / 10).toFixed(1));
const results = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 844, height: 390 } : { width: 1600, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**', () => {});
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.arena?.state);
      const icons=await page.evaluate(async()=>{
        const manifest=await(await fetch('/data/ultimate-icons.json')).json(),entries=Object.entries(manifest.icons);
        for(const[id,icon]of entries){const image=new Image();image.src=icon.framed;await image.decode();if(image.naturalWidth!==128||image.naturalHeight!==128)throw Error('Invalid framed icon '+id);}
        const ultimates=window.arena.definitions.filter(d=>d.ultimate);if(ultimates.some(d=>!manifest.icons[d.id]))throw Error('Unframed main ultimate');return{standalone:entries.length,main:ultimates.length};
      });
      assert.equal(await page.locator('[data-hero-level="1"]').count(),1);
      const select = page.locator('#difficultySelect');
      assert.deepEqual(await select.locator('option').evaluateAll(options => options.map(option => option.value)), difficulties);
      const selected = [];
      for (const difficulty of mobile ? ['1.0', '2.5'] : difficulties) {
        await select.selectOption(difficulty);
        await page.locator('#seedInput').fill('743');
        await page.locator('[data-action=newGame]').click();
        assert.equal(await page.evaluate(() => window.arena.state.difficulty), Number(difficulty));
        selected.push(difficulty);
        await page.locator('.session-controls [data-action=menu]').click();
        assert.equal(await select.inputValue(), difficulty);
      }
      const menuBounds = await select.boundingBox();
      assert(menuBounds && menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= (mobile ? 844 : 1600));
      await page.screenshot({ path: `${output}/${name}-difficulty.png` });
      await page.locator('#dialogFooter [data-action=close]').click();
      await page.reload();
      await page.waitForFunction(() => window.arena?.state);
      await page.locator('.session-controls [data-action=menu]').click();
      assert.equal(await select.inputValue(), '2.5', 'Restored match difficulty should remain selected');
      await page.locator('#dialogFooter [data-action=close]').click();
      assert.equal(await page.locator('.shop-inspect').count(), 0);
      assert.equal(await page.locator('#shopGrid .shop-card button').count(), 12, 'Each offer has only its purchase button');
      assert.equal(await page.locator('#shopGrid .owned-skill').count(), 0);
      await page.locator('[data-action=deck]:visible').last().click();
      await page.locator('[data-action=deckScope]').click();
      assert.equal(await page.locator('#deckGrid .deck-entry img[src*="/art/icons/ultimate/"]').count(),icons.main);
      await page.locator('#dialogFooter [data-action=close]').click();

      // Fund actual purchase/reroll/move actions only. No offers or skill inventories are injected.
      await page.evaluate(() => { window.arena.state.players[0].gold = 5000; });
      const id = await page.evaluate(() => window.arena.state.players[0].shop[0]);
      assert(id);
      await page.locator('[data-buy="0"]').click();
      assert.equal(await page.evaluate(() => window.arena.state.players[0].reserve[0]?.id), id, 'New purchases enter reserve');
      assert.equal(await page.evaluate(() => window.arena.state.players[0].heroes[0].skills.every(skill => skill === null)), true);
      if (mobile) await page.locator('[data-action=mobileInfo]').click();
      await page.locator('[data-reserve="0"]').click();
      if (mobile) await page.locator('[data-action=closeMobileInfo]').click();
      await page.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
      assert.equal(await page.evaluate(() => window.arena.state.players[0].heroes[0].skills[0]?.id), id);
      const search = await page.evaluate(id => {
        const player = window.arena.state.players[0];
        for (let attempts = 0; attempts < 1500; attempts++) {
          if (player.shop.includes(id)) return { attempts, index: player.shop.indexOf(id) };
          document.querySelector('#reroll').click();
        }
        throw Error('Deterministic rerolls did not return the purchased skill');
      }, id);
      const offer = page.locator(`[data-buy="${search.index}"]`), card = offer.locator('..');
      await offer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.equal(await card.getAttribute('data-owned'), 'true');
      assert.match(await offer.getAttribute('aria-label'), /已拥有同名技能/);
      const border = await card.evaluate(element => ({ color: getComputedStyle(element).borderColor, overlay: getComputedStyle(element, '::after').borderColor }));
      assert.equal(border.color, 'rgb(255, 220, 87)');
      assert.equal(border.overlay, 'rgb(255, 220, 87)');
      const beforeDetails = await page.evaluate(() => ({ gold: window.arena.state.players[0].gold, inventory: JSON.stringify(window.arena.state.players[0].heroes.map(hero => hero.skills)) }));
      if (mobile) {
        const box = await offer.boundingBox(); assert(box);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
        try { await page.locator('#dialog[open]').waitFor(); }
        finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      } else await offer.click({ button: 'right' });
      await page.locator('#dialog[open]').waitFor();
      assert.equal(await page.evaluate(() => window.arena.state.players[0].gold), beforeDetails.gold);
      assert.equal(await page.evaluate(() => JSON.stringify(window.arena.state.players[0].heroes.map(hero => hero.skills))), beforeDetails.inventory);
      await page.waitForTimeout(750); // Long-press purchase suppression also protects the following tap.
      await page.locator('#dialogFooter [data-action=close]').click();
      await page.screenshot({ path: `${output}/${name}-owned-hero.png` });

      await page.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
      if (mobile) await page.locator('[data-action=mobileInfo]').click();
      await page.locator('[data-reserve="0"]').click();
      assert.equal(await page.evaluate(() => window.arena.state.players[0].reserve[0]?.id), id);
      assert.equal(await page.evaluate(() => window.arena.state.players[0].heroes[0].skills[0]), null);
      assert.equal(await card.getAttribute('data-owned'), 'true', 'Reserve-only ownership must retain the offer highlight');
      await page.screenshot({ path: `${output}/${name}-owned-reserve.png` });
      if (mobile) await page.locator('[data-action=closeMobileInfo]').click();
      await page.locator('[data-player="1"]').click();
      assert.equal(await card.getAttribute('data-owned'), 'true', 'Scouting another player must retain local inventory highlighting');
      if (mobile) await page.locator('[data-action=mobileInfo]').click();
      await page.locator('[data-reserve="0"]').click();
      await page.locator('#sell').click();
      assert.equal(await card.getAttribute('data-owned'), null, 'Selling the last owned copy removes its offer highlight');
      assert.equal(await page.locator('#shopGrid .shop-inspect').count(), 0);
      if(mobile&&await page.locator('[data-action=closeMobileInfo]').isVisible())await page.locator('[data-action=closeMobileInfo]').click();
      await page.locator('[data-player="0"]').click();
      await page.locator('#shopUpgrade').click();await page.locator('#shopUpgrade').click();
      const ultimateOffer=await page.evaluate(()=>{const p=window.arena.state.players[0],ids=new Set(window.arena.definitions.filter(d=>d.ultimate).map(d=>d.id));for(let i=0;i<300;i++){const index=p.shop.findIndex(id=>id&&ids.has(id));if(index>=0)return{index,id:p.shop[index]};document.querySelector('#reroll').click();}throw Error('No genuine level-three ultimate offer');});
      const ultimateURL=`/art/icons/ultimate/${ultimateOffer.id}.svg`;
      assert.equal(await page.locator(`[data-buy="${ultimateOffer.index}"] img`).getAttribute('src'),ultimateURL);
      await page.locator(`[data-buy="${ultimateOffer.index}"]`).click();
      if(mobile)await page.locator('[data-action=mobileInfo]').click();
      await page.locator('[data-reserve="0"]').click();if(mobile)await page.locator('[data-action=closeMobileInfo]').click();
      await page.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
      assert.equal(await page.locator('#teamRoster [data-slot="0"] img').getAttribute('src'),ultimateURL);
      if(mobile)await page.locator('[data-action=mobileInfo]').click();
      await page.locator(`#infoContent [data-detail="${ultimateOffer.id}"]`).click();
      assert.equal(await page.locator('.detail-hero img').getAttribute('src'),ultimateURL);
      await page.screenshot({path:`${output}/${name}-ultimate-detail.png`});await page.locator('#dialogFooter [data-action=close]').click();
      if(mobile)await page.locator('[data-action=closeMobileInfo]').click();
      // Full storage is created by real shop transactions,not injected stacks.
      await page.evaluate(()=>{const p=window.arena.state.players[0];for(let guard=0;guard<600&&p.reserve.some(s=>s===null);guard++){const owned=new Set([...p.heroes.flatMap(h=>h.skills),...p.reserve].filter(Boolean).map(s=>s.id)),index=p.shop.findIndex(id=>id&&!owned.has(id));document.querySelector(index>=0?`[data-buy="${index}"]`:'#reroll').click();}if(p.reserve.some(s=>s===null))throw Error('Could not fill reserve with genuine buys');});
      const uniqueIndex=await page.evaluate(()=>{const p=window.arena.state.players[0];for(let guard=0;guard<300;guard++){const owned=new Set([...p.heroes.flatMap(h=>h.skills),...p.reserve].filter(Boolean).map(s=>s.id)),index=p.shop.findIndex(id=>id&&!owned.has(id));if(index>=0)return index;document.querySelector('#reroll').click();}throw Error('No new skill offer');});
      const beforeRejected=await page.evaluate(()=>JSON.stringify(window.arena.state));await page.locator(`[data-buy="${uniqueIndex}"]`).click();
      assert.equal(await page.evaluate(()=>JSON.stringify(window.arena.state)),beforeRejected);assert.match(await page.locator('#toast').textContent(),/暂存区已满/);
      const duplicate=await page.evaluate(()=>{const p=window.arena.state.players[0];for(let guard=0;guard<300;guard++){const owned=[...p.heroes.flatMap(h=>h.skills),...p.reserve].filter(Boolean),index=p.shop.findIndex(id=>id&&owned.some(s=>s.id===id&&s.points<9));if(index>=0){const stack=owned.find(s=>s.id===p.shop[index]);return{index,id:stack.id,instance:stack.instanceId,points:stack.points,gold:p.gold};}document.querySelector('#reroll').click();}throw Error('No genuine owned duplicate offer');});
      await page.locator(`[data-buy="${duplicate.index}"]`).click();
      const upgraded=await page.evaluate(id=>{const p=window.arena.state.players[0];return{stack:[...p.heroes.flatMap(h=>h.skills),...p.reserve].find(s=>s?.id===id),full:p.reserve.every(Boolean),gold:p.gold};},duplicate.id);
      assert.equal(upgraded.stack.instanceId,duplicate.instance);assert.equal(upgraded.stack.points,duplicate.points+1);assert(upgraded.full);assert.equal(upgraded.gold,duplicate.gold-3);
      await page.screenshot({path:`${output}/${name}-full-reserve.png`});
      await page.locator('#ready').click();await page.waitForFunction(()=>window.arena.state.phase==='battle');await page.locator('.session-controls [data-action=pause]').click();
      if(mobile)await page.locator('[data-action=mobileInfo]').click();
      assert.equal(await page.locator('#infoContent [data-hero-level]').getAttribute('data-hero-level'),'1');
      assert.equal(await page.evaluate(()=>window.arena.state.planningRound),2);
      assert((await page.locator('.hero-roster-level').allTextContents()).every(text=>text==='Lv 2'));
      const units=await page.evaluate(()=>JSON.stringify(window.arena.battles.map(b=>b.units)));
      await page.screenshot({path:`${output}/${name}-level-current.png`});
      if(mobile)await page.locator('[data-action=closeMobileInfo]').click();await page.locator('[data-action=plan]').click();
      if(mobile)await page.locator('[data-action=mobileInfo]').click();
      assert.equal(await page.locator('#infoContent [data-hero-level]').getAttribute('data-hero-level'),'2');
      assert.equal(await page.evaluate(()=>JSON.stringify(window.arena.battles.map(b=>b.units))),units);
      await page.screenshot({path:`${output}/${name}-level-next.png`});
      const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(bounds.width <= bounds.viewport + 1, 'UI must not overflow horizontally');
      assert.deepEqual(errors, []);
      results.push({ name, status: 'passed', selectedDifficulties: selected, restoredDifficulty: '2.5',icons,ultimate:ultimateOffer.id,ownedSkill: id, rerolls: search.attempts, detailsInput: mobile ? 'real-touch-long-press' : 'right-click', highlight: ['hero', 'reserve-only', 'while-scouting', 'removed-after-sale'],fullReserve:['new-skill-rejected-atomically','duplicate-upgraded-in-place'],levels:{current:1,next:2,currentBattleUnchanged:true}, border, bounds, errors });
      console.log(`PASS ${name}`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
      results.push({ name, status: 'failed', error: String(error?.stack ?? error), errors });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  const report = { status: results.length === 2 && results.every(result => result.status === 'passed') ? 'passed' : 'failed', actualURL: url, browserClosed: true, fixture: 'Only initial gold is funded. All skill acquisition, duplicate offers, moves and sales use the existing UI/game handlers.', results };
  await fs.writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}

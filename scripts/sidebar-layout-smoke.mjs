import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.ARENA_TEST_URL ?? 'http://localhost:4173';
const output = process.env.ARENA_SIDEBAR_OUTPUT ?? 'artifacts/sidebar-layout';
const results = [], errors = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.arena?.state);
  await page.locator('#seedInput').fill('743');
  await page.locator('[data-action=newGame]').click();

  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1280, 650], [1280, 500], [844, 390], [740, 360]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(180);
    const layout = await page.evaluate(() => {
      const ranking = document.querySelector('.ranking'), players = document.querySelector('#players');
      const controls = document.querySelector('.session-controls'), help = controls.querySelector('.quick-help');
      const bounds = element => element.getBoundingClientRect().toJSON();
      const helpVisible = getComputedStyle(help).display !== 'none';
      const lastRow = players.lastElementChild;
      players.scrollTop = players.scrollHeight;
      const lastRowBounds = bounds(lastRow);
      const buttons = [...controls.querySelectorAll('button')].map(button => {
        const rect = bounds(button), center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { action: button.dataset.action, rect, reachable: center === button || button.contains(center) };
      });
      const range = document.createRange();
      range.selectNodeContents(help);
      const text = [...range.getClientRects()].filter(rect => rect.width && rect.height).map(rect => rect.toJSON());
      return { ranking: bounds(ranking), players: bounds(players), controls: bounds(controls), dock: bounds(document.querySelector('.dock')), helpVisible, text, buttons, lastRow: lastRowBounds, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    const label = `${width}x${height}`;
    assert(layout.controls.top >= layout.players.bottom - 1, `${label}: controls overlap ranking rows`);
    assert(layout.controls.top - layout.players.bottom <= 16, `${label}: unused space separates ranking and controls`);
    assert(layout.controls.bottom <= layout.ranking.bottom - 1, `${label}: controls overflow sidebar`);
    assert(layout.controls.bottom < layout.dock.top, `${label}: controls overlap roster`);
    assert(layout.lastRow.top >= layout.players.top - 1 && layout.lastRow.bottom <= layout.players.bottom + 1, `${label}: eighth ranking row cannot be scrolled into view`);
    assert(layout.documentWidth <= layout.viewportWidth + 1, `${label}: horizontal page overflow`);
    for (const button of layout.buttons) {
      assert(button.reachable, `${label}: ${button.action} control is covered`);
      assert(button.rect.left >= layout.ranking.left && button.rect.right <= layout.ranking.right, `${label}: ${button.action} overflows sidebar horizontally`);
    }
    if (layout.helpVisible) for (const rect of layout.text) {
      assert(rect.top >= layout.controls.top && rect.bottom <= layout.controls.bottom + 1, `${label}: help text overflows control section`);
      assert(rect.right <= layout.ranking.right, `${label}: help text overflows sidebar horizontally`);
    }
    await page.locator('.session-controls [data-action=menu]').click();
    await page.locator('#dialog[open]').waitFor();
    await page.locator('.dialog-close').click();
    await page.screenshot({ path: `${output}/${label}.png` });
    results.push({ viewport: label, status: 'passed', layout });
    console.log(`PASS sidebar ${label}`);
  }
  assert.deepEqual(errors, [], 'Unexpected browser runtime errors');
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ status: 'passed', results, errors }, null, 2));
} catch (error) {
  await fs.writeFile(`${output}/report.json`, JSON.stringify({ status: 'failed', results, errors, message: String(error.stack ?? error) }, null, 2));
  throw error;
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium, expect} from '@playwright/test';

const origin = new URL(process.env.ARENA_TEST_URL ?? 'http://localhost:4173');
const output = 'artifacts/skill-lab';
const catalog = JSON.parse(await fs.readFile('dist/data/skills.json', 'utf8'));
const pageSize = 10;
const levels = [3, 6, 9];
const pageCount = Math.ceil(catalog.length / pageSize);
const results = [], errors = [];
const browser = await chromium.launch({headless:true});
await fs.mkdir(output, {recursive:true});

const labURL = number => new URL(`/skill-lab.html?page=${number}`, origin).href;
const pageOf = skill => Math.floor(catalog.findIndex(item => item.id === skill) / pageSize) + 1;
const skillCase = (page, skill, points) => page.locator(`.skill-group[data-skill="${skill}"] .skill-case[data-points="${points}"]`);
const time = async page => Number(await page.locator('#labTime').getAttribute('data-time'));

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin.origin && response.status() >= 400 && url.pathname !== '/favicon.ico') {
      errors.push(`HTTP ${response.status()} ${url.pathname}`);
    }
  });
  page.on('console', message => {
    if (message.type() === 'warning' && /too many active WebGL contexts|WebGL context lost/i.test(message.text())) errors.push(message.text());
  });
}

async function assertLabPage(page, number) {
  await page.locator('#labSkills[data-ready="true"]').waitFor({timeout:30000});
  const groups = await page.locator('#labSkills .skill-group').evaluateAll(items => items.map(group => ({
    skill:group.dataset.skill,
    cases:[...group.querySelectorAll('.skill-case')].map(card => ({
      points:Number(card.dataset.points),
      canvas:card.querySelectorAll('canvas').length,
      rows:[...card.querySelectorAll('.damage-row')].map(row => ({
        dummy:Number(row.dataset.dummy),
        skill:row.querySelectorAll('[data-skill-damage]').length,
        basic:row.querySelectorAll('[data-basic-damage]').length,
      })),
    })),
  })));
  assert.deepEqual(groups, catalog.slice((number - 1) * pageSize, number * pageSize).map(skill => ({
    skill:skill.id,
    cases:levels.map(points => ({points,canvas:1,rows:[1, 2, 3].map(dummy => ({dummy,skill:1,basic:1}))})),
  })), `Page ${number} must match the release catalog and have three complete cases per skill`);
  assert.equal(await page.locator('#labPage').inputValue(), String(number));
  assert.equal(await page.locator('#labPage option').count(), pageCount);
}

async function openLabPage(page, number) {
  const response = await page.goto(labURL(number), {waitUntil:'domcontentloaded'});
  assert.equal(response?.status(), 200, `Lab page ${number} did not load`);
  await assertLabPage(page, number);
  return response;
}

async function damage(card, metric = 'skill') {
  const values = await card.locator(`[data-${metric}-damage]`).allTextContents();
  assert.equal(values.length, 3);
  return values.map(value => {
    const match = value.replaceAll(',', '').match(/\d+(?:\.\d+)?/);
    assert(match, `Expected numeric damage, received ${value}`);
    return Number(match[0]);
  });
}

async function waitForDamage(page, skill, points, dummy = 1) {
  await page.waitForFunction(({skill,points,dummy}) => {
    const output = document.querySelector(`.skill-group[data-skill="${skill}"] .skill-case[data-points="${points}"] .damage-row[data-dummy="${dummy}"] [data-skill-damage]`);
    return Number(output?.textContent.replaceAll(',', '').match(/\d+(?:\.\d+)?/)?.[0]) > 0;
  }, {skill,points,dummy}, {timeout:30000});
}

async function captureCanvas(card, filename) {
  const canvas = card.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  let proof;
  await expect.poll(async () => {
    proof = await canvas.evaluate(element => {
      const {width,height} = element;
      const pixels = element.getContext('2d')?.getImageData(0, 0, width, height).data ?? [];
      const colors = new Set();
      for (let index = 0; index < pixels.length; index += 4) colors.add(pixels[index] << 16 | pixels[index + 1] << 8 | pixels[index + 2]);
      return {width,height,colors:colors.size};
    });
    return proof.width >= 100 && proof.height >= 60 && proof.colors > 100;
  }, {message:'Arena canvas must contain painted game art',timeout:15000}).toBe(true);
  await canvas.screenshot({path:`${output}/${filename}`});
  return proof;
}

try {
  assert.equal(catalog.length, 230);
  assert.equal(pageCount, 23);
  assert.equal(new Set(catalog.map(skill => skill.id)).size, catalog.length);
  const context = await browser.newContext({viewport:{width:1600,height:1000}});
  const page = await context.newPage();
  watch(page);
  await page.goto(origin.href);
  const entry = page.locator('#labEntry');
  await entry.waitFor({timeout:30000});
  const supportsWorker = await page.evaluate(() => isSecureContext && 'serviceWorker' in navigator);
  if (supportsWorker) await page.waitForFunction(() => navigator.serviceWorker.controller, undefined, {timeout:30000});
  assert.equal(new URL(await entry.getAttribute('href'), origin).pathname, '/skill-lab.html');
  await entry.click();
  await assertLabPage(page, 1);

  const next = page.locator('#labNext');
  assert.equal(new URL(await next.getAttribute('href'), origin).searchParams.get('page'), '2');
  const [nextResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === labURL(2) && response.request().isNavigationRequest()),
    next.click(),
  ]);
  await assertLabPage(page, 2);
  if (supportsWorker) assert.equal(nextResponse.fromServiceWorker(), true, 'The active worker must serve the paginated lab HTML');
  await page.locator('#labPrevious').click();
  await assertLabPage(page, 1);
  results.push({name:'menu-and-pagination',workerNavigation:supportsWorker});

  const clock = page.locator('#labTime');
  await page.waitForFunction(() => Number(document.querySelector('#labTime').dataset.time) > .4);
  await page.locator('#labPlay').click();
  const pausedAt = await time(page);
  await page.waitForTimeout(250);
  assert.equal(await time(page), pausedAt, 'Pause must freeze the shared simulation time');
  assert.deepEqual(await page.locator('#labSpeed option').evaluateAll(options => options.map(option => option.value)), ['0.5', '1', '2']);
  await page.locator('#labSpeed').selectOption('2');
  await page.locator('#labReplay').click();
  await page.waitForFunction(paused => Number(document.querySelector('#labTime').dataset.time) < paused, pausedAt);
  const replayAt = await time(page);
  await page.waitForFunction(start => Number(document.querySelector('#labTime').dataset.time) > start + .25, replayAt);
  assert(await clock.isVisible());
  const firstCard = skillCase(page, catalog[0].id, 3);
  const sideBySide = await firstCard.evaluate(card => {
    const canvas = card.querySelector('canvas').getBoundingClientRect();
    const rows = [...card.querySelectorAll('.damage-row')].map(row => row.getBoundingClientRect());
    return rows.every(row => row.left >= canvas.right - 3);
  });
  assert(sideBySide, 'The three damage readouts must sit to the right of the scene on desktop');
  results.push({name:'playback-and-desktop-layout',pausedAt,canvas:await captureCanvas(firstCard, 'arena-desktop.png')});

  const acid = 'custom_alchemist_acid_spray';
  await waitForDamage(page, acid, 3);
  const acidCard = skillCase(page, acid, 3);
  assert.match(await acidCard.locator('.case-state').innerText(), /瞄准 ①/);
  const acidHits = await damage(acidCard);
  assert(acidHits[0] > 0 && acidHits.every(amount => amount === acidHits[0]), 'The point-target spray should cover all three dummies around the nearest point');
  await page.screenshot({path:`${output}/page-desktop.png`});
  results.push({name:'point-target-area',rank3:acidHits});

  const missile = 'custom_vengefulspirit_magic_missile';
  const quill = 'custom_bristleback_quill_spray';
  const warpath = 'bristleback_warpath';
  const steal = 'custom_rubick_spell_steal';
  for (let number = 3; number <= pageCount; number++) {
    await openLabPage(page, number);
    if (number === pageOf(missile)) {
      const rank3 = skillCase(page, missile, 3), rank6 = skillCase(page, missile, 6), rank9 = skillCase(page, missile, 9);
      await rank9.scrollIntoViewIfNeeded();
      await page.locator('#labReplay').click();
      await waitForDamage(page, missile, 9, 3);
      const actual3 = await damage(rank3), actual6 = await damage(rank6), actual9 = await damage(rank9);
      assert.deepEqual(actual3, [270, 0, 0], 'Rank 3 Magic Missile must hit only the nearest dummy with 25% magic resistance');
      assert.deepEqual(actual6, [345, 0, 0], 'Rank 6 Magic Missile retains nearest-only targeting');
      assert.deepEqual(actual9, [345, 345, 345], 'Rank 9 Magic Missile natively bounces across the triangle');
      const atlas = await page.waitForFunction(skill => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname.endsWith(`/${skill}/projectile.webp`))?.name, missile, {timeout:10000});
      results.push({name:'single-target-and-native-bounce',rank3:actual3,rank6:actual6,rank9:actual9,projectileAtlas:new URL(await atlas.jsonValue()).pathname,canvas:await captureCanvas(rank9, 'magic-missile-rank-9.png')});
    }
    if (number === pageOf(quill)) {
      await waitForDamage(page, quill, 3);
      const actual = await damage(skillCase(page, quill, 3));
      assert.deepEqual(actual, [65.4, 0, 0], 'A rank 3 Quill Spray at its range edge must hit just the nearest dummy at 5 armor');
      results.push({name:'self-centered-area-edge',rank3:actual});
    }
    if (number === pageOf(steal)) {
      await page.waitForFunction(() => Number(document.querySelector('#labTime').dataset.time) >= 1.2);
      assert.deepEqual(await damage(skillCase(page, steal, 3)), [0, 0, 0], 'Skill-less dummies must not produce Spell Steal damage');
    }
    if (number === pageOf(warpath)) {
      await page.waitForFunction(() => Number(document.querySelector('#labTime').dataset.time) >= 2.5);
      const card = skillCase(page, warpath, 3);
      assert.deepEqual(await damage(card), [0, 0, 0], 'Warpath alone has no second skill to trigger it');
      const basic = await damage(card, 'basic');
      assert(basic[0] > 0 && basic.slice(1).every(amount => amount === 0), 'Ordinary attacks must be tracked separately against the nearest dummy');
      results.push({name:'conditional-skills-and-basic-damage',warpathBasic:basic});
    }
  }
  const lastNext = page.locator('#labNext');
  assert(!(await lastNext.count()) || !(await lastNext.getAttribute('href')), 'The last catalog page must not link to a page 24');
  results.push({name:'catalog-coverage',pages:pageCount,skills:catalog.length,cases:catalog.length * levels.length});

  await page.setViewportSize({width:390,height:844});
  await openLabPage(page, 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The lab must not scroll horizontally on a narrow screen');
  await captureCanvas(skillCase(page, acid, 3), 'arena-mobile-detail.png');
  await page.screenshot({path:`${output}/arena-mobile.png`});
  results.push({name:'narrow-screen-layout',width:390});

  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/report.json`, JSON.stringify({status:'passed',results,errors}, null, 2) + '\n');
  console.log(JSON.stringify({status:'passed',results}, null, 2));
} catch (error) {
  await fs.writeFile(`${output}/report.json`, JSON.stringify({status:'failed',results,errors,error:String(error)}, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
}

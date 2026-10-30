import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

// Keep the production server in the loop, but inject one real network failure.
// Playwright page.route does not intercept requests initiated by a service worker.
const upstream = new URL(process.env.ARENA_TEST_URL ?? 'http://localhost:4173');
const output = 'artifacts/pwa-smoke';
const results = [], errors = [], fetchedPaths = new Set(), requestCounts = new Map();
let failingPath = '', failResource = false, failedRequests = 0;
let updateVersion = '', transformedWorkers = 0;
const agent = new http.Agent({keepAlive:true, maxSockets:16});
const proxy = http.createServer((request, response) => {
  const target = new URL(request.url, upstream);
  fetchedPaths.add(target.pathname);
  requestCounts.set(target.pathname, (requestCounts.get(target.pathname) ?? 0) + 1);
  if (failResource && target.pathname === failingPath) {
    failedRequests++;
    response.writeHead(503, {'Content-Type':'text/plain', 'Cache-Control':'no-store'}).end('Intentional offline-download fixture');
    return;
  }
  const transform = Boolean(updateVersion && ['/sw.js', '/offline-assets.json'].includes(target.pathname));
  const headers = {...request.headers, host:upstream.host};
  if (transform) {
    headers['accept-encoding'] = 'identity';
    delete headers['if-none-match'];
    delete headers['if-modified-since'];
  }
  const forwarded = http.request(target, {method:request.method, agent, headers}, remote => {
    if (transform && remote.statusCode === 200) {
      const chunks = [];
      remote.on('data', chunk => chunks.push(chunk));
      remote.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace(/"version"\s*:\s*"[^"]+"/, `"version":"${updateVersion}"`);
        const rewritten = {...remote.headers, 'content-length':Buffer.byteLength(body), 'cache-control':'no-store'};
        delete rewritten.etag;
        delete rewritten['content-encoding'];
        if (target.pathname === '/sw.js') transformedWorkers++;
        response.writeHead(remote.statusCode, rewritten).end(body);
      });
    } else {
      response.writeHead(remote.statusCode, remote.headers);
      remote.pipe(response);
    }
  });
  forwarded.on('error', error => {
    if (!response.headersSent) response.writeHead(502);
    response.end(String(error));
  });
  request.pipe(forwarded);
});
await new Promise((resolve, reject) => {proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve);});
const origin = `http://127.0.0.1:${proxy.address().port}`;
await fs.mkdir(output, {recursive:true});
const profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'arcane-arena-pwa-'));
let browser, offlineContext, diagnosticPage;
const progress = [];
const startedAt = Date.now();

async function diagnostics(page) {
  if (!page || page.isClosed()) return {pageClosed:true};
  let timer;
  try {
    return await Promise.race([
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker?.getRegistration();
        const worker = navigator.serviceWorker?.controller ?? registration?.active;
        const workerStatus = worker ? await new Promise(resolve => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => {channel.port1.close(); resolve({timeout:true});}, 2000);
          channel.port1.onmessage = event => {clearTimeout(timer); channel.port1.close(); resolve(event.data);};
          worker.postMessage({type:'OFFLINE_STATUS'}, [channel.port2]);
        }) : undefined;
        const cacheCounts = [];
        for (const name of await caches.keys()) cacheCounts.push({name, entries:(await (await caches.open(name)).keys()).length});
        const bar = document.querySelector('#offlineProgress');
        return {
          state:document.documentElement.dataset.offlineState,
          status:document.querySelector('#offlineStatus')?.textContent,
          size:document.querySelector('#offlineSize')?.textContent,
          completed:bar?.value, total:bar?.max,
          storage:await navigator.storage?.estimate(), persisted:await navigator.storage?.persisted(),
          online:navigator.onLine, workerStatus, cacheCounts,
          controller:worker?.scriptURL, workerState:worker?.state,
        };
      }),
      new Promise(resolve => {timer = setTimeout(() => resolve({diagnosticsTimeout:true}), 10000);}),
    ]);
  } catch (error) {return {diagnosticsError:String(error)};}
  finally {clearTimeout(timer);}
}

async function waitOffline(page, expected, phase, timeout) {
  const deadline = Date.now() + timeout;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({state:document.documentElement.dataset.offlineState, status:document.querySelector('#offlineStatus')?.textContent}));
    if (state.state === expected) return;
    if (state.state === 'error' && expected !== 'error') throw Error(`${phase} failed: ${state.status}`);
    if (Date.now() - lastLog >= 15000) {
      const snapshot = {phase, elapsedSeconds:Math.round((Date.now() - startedAt) / 1000), ...await diagnostics(page)};
      progress.push(snapshot);
      console.log(`[PWA progress] ${JSON.stringify(snapshot)}`);
      lastLog = Date.now();
    }
    await page.waitForTimeout(300);
  }
  throw Error(`${phase} timed out waiting for ${expected}: ${JSON.stringify(await diagnostics(page))}`);
}

async function startGame(page, seed = '743') {
  await page.waitForFunction(() => window.arena?.state);
  if (await page.locator('#seedInput').isVisible()) {
    await page.locator('#seedInput').fill(seed);
    await page.locator('[data-action=newGame]').click();
  }
}

async function withinViewport(locator) {
  assert(await locator.isVisible(), 'Control is hidden');
  assert(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
  }), 'Control is outside the viewport');
}

try {
  const response = await fetch(new URL('/offline-assets.json', origin));
  assert(response.ok, 'Production offline asset inventory is missing');
  const inventory = await response.json();
  assert.equal(typeof inventory.version, 'string');
  assert(inventory.version.length > 0);
  assert(Array.isArray(inventory.files) && inventory.files.length > 1000, 'Offline inventory is incomplete');
  assert.equal(new Set(inventory.files.map(file => file.url)).size, inventory.files.length, 'Duplicate cache URLs');
  assert.equal(inventory.totalBytes, inventory.files.reduce((total, file) => total + file.bytes, 0));
  assert(inventory.files.some(file => file.url.startsWith('/art/mobile/')), 'Mobile atlases are missing');
  assert(inventory.files.some(file => file.url.startsWith('/art/skills/')), 'Desktop skill atlases are missing');
  assert(inventory.files.some(file => file.url.startsWith('/assets/') && file.url.endsWith('.js')), 'Production scripts are missing');
  for (const file of inventory.files) {
    assert(file.url.startsWith('/') && !file.url.startsWith('//') && !file.url.includes('..'), `Unsafe runtime URL ${file.url}`);
    assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
  }
  results.push({name:'runtime-inventory', status:'passed', version:inventory.version, files:inventory.files.length, bytes:inventory.totalBytes});

  // Installed games use a disk-backed profile. Chromium's private contexts
  // enforce a RAM-based cache quota that can be below this full runtime on CI.
  // Keep the complete resource test; do not bypass quota with browser flags.
  const context = offlineContext = await chromium.launchPersistentContext(profileDirectory, {headless:true, viewport:{width:844, height:390}, hasTouch:true, isMobile:true});
  const page = diagnosticPage = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await startGame(page);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, {timeout:30000});
  const initialStorage = await diagnostics(page);
  console.log(`[PWA profile] ${JSON.stringify({storageProfile:'persistent', ...initialStorage})}`);

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) throw Error('No web app manifest link');
    const response = await fetch(link.href);
    if (!response.ok) throw Error('Manifest request failed');
    return response.json();
  });
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.orientation, 'landscape');
  assert(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert(manifest.icons.some(icon => icon.sizes === '512x512'));
  for (const icon of manifest.icons) {
    const iconResponse = await fetch(new URL(icon.src, origin));
    assert(iconResponse.ok, `Unreachable install icon ${icon.src}`);
    const data = Buffer.from(await iconResponse.arrayBuffer());
    assert(data.length > 0);
    if (icon.type === 'image/png') {
      assert.equal(data.readUInt32BE(0), 0x89504e47, 'Install icon is not a PNG');
      const [width, height] = icon.sizes.split('x').map(Number);
      assert.equal(data.readUInt32BE(16), width);
      assert.equal(data.readUInt32BE(20), height);
    }
  }
  results.push({name:'install-manifest-and-worker', status:'passed', display:manifest.display, orientation:manifest.orientation, icons:manifest.icons.length});

  // Download failure must be reported honestly and the same session can resume.
  failingPath = inventory.files.find(file => file.url.startsWith('/art/skills/') && file.url.endsWith('.webp')).url;
  failResource = true;
  const offlineButton = page.locator('[data-action=offline]:visible').first();
  await withinViewport(offlineButton);
  await offlineButton.tap();
  await page.locator('#offlineDialog[open]').waitFor();
  await page.locator('#offlineDialog [data-action=downloadOffline]').click();
  await waitOffline(page, 'error', 'intentional-download-failure', 120000);
  assert(failedRequests > 0, 'Failure fixture was never requested by the service worker');
  assert.notEqual(await page.locator('html').getAttribute('data-offline-state'), 'ready');
  assert((await page.locator('#offlineStatus').innerText()).trim().length > 0, 'Failure has no user-facing status');
  const partialPaths = await page.evaluate(async version => {
    const cache = await caches.open(`arcane-arena-${version}`);
    return (await cache.keys()).map(request => new URL(request.url).pathname).filter(url => url.startsWith('/art/characters/') && url.endsWith('.webp'));
  }, inventory.version);
  const partialCounts = partialPaths.map(url => ({url, count:requestCounts.get(url) ?? 0}));
  await page.screenshot({path:`${output}/download-error-mobile.png`});
  results.push({name:'failed-download-is-not-ready', status:'passed', failedPath:failingPath, failedRequests});

  failResource = false;
  await page.locator('#offlineDialog [data-action=downloadOffline]').click();
  await waitOffline(page, 'ready', 'complete-download-resume', 600000);
  const coverage = await page.evaluate(async inventory => {
    const cache = await caches.open(`arcane-arena-${inventory.version}`);
    const cached = new Set((await cache.keys()).map(request => new URL(request.url).pathname));
    const missing = inventory.files.filter(file => !cached.has(file.url)).map(file => file.url);
    const ready = await cache.match(new URL('__offline_ready__', location.origin + '/'));
    return {missing, ready:!!ready, cached:cached.size};
  }, inventory);
  assert.deepEqual(coverage.missing, [], 'The ready state was shown with runtime resources missing');
  assert(coverage.ready, 'The complete-install cache marker is missing');
  assert(partialCounts.length > 0, 'Failure fixture did not leave any completed character atlas to resume');
  for (const file of partialCounts) assert.equal(requestCounts.get(file.url) ?? 0, file.count, `Resume downloaded an already cached atlas again: ${file.url}`);
  await page.screenshot({path:`${output}/download-ready-mobile.png`});
  results.push({name:'complete-download-and-resume', status:'passed', cached:coverage.cached, files:inventory.files.length, reusedAtlases:partialCounts.length});

  // Start with a fresh renderer and no HTTP cache. The whole game and an unseen
  // skill atlas must work with the browser network disabled, not just a cached tab.
  await page.locator('#offlineDialog').evaluate(dialog => dialog.close());
  await page.locator('[data-action=pause]').tap();
  await page.evaluate(() => window.arena.save());
  const saved = await page.evaluate(() => JSON.stringify(window.arena.state));
  const savedStorage = await page.evaluate(() => localStorage.getItem('arcane-arena.save.v1'));
  await context.setOffline(true);
  const coldPage = diagnosticPage = await context.newPage();
  coldPage.on('pageerror', error => errors.push(error.message));
  await coldPage.goto(origin + '/?offline-cold-start=1');
  await coldPage.waitForFunction(() => window.arena?.state);
  assert.equal(await coldPage.evaluate(() => JSON.stringify(window.arena.state)), saved, 'Offline cold start changed the saved game');
  assert.equal(await coldPage.evaluate(() => localStorage.getItem('arcane-arena.save.v1')), savedStorage, 'Offline cold start replaced the save');
  await coldPage.waitForFunction(() => document.documentElement.dataset.offlineState === 'ready');
  const unseen = inventory.files.find(file => file.url.startsWith('/art/mobile/skills/') && file.url.endsWith('.webp'));
  const expectedBytes = await fs.readFile(`dist${unseen.url}`);
  const unseenDigest = await coldPage.evaluate(async url => {
    const response = await fetch(url);
    if (!response.ok) throw Error('Unseen offline atlas request failed');
    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return {bytes:buffer.byteLength, sha256:[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')};
  }, unseen.url);
  assert.equal(unseenDigest.bytes, unseen.bytes);
  assert.equal(unseenDigest.sha256, createHash('sha256').update(expectedBytes).digest('hex'));
  await coldPage.locator('#ready').tap();
  await coldPage.waitForFunction(() => window.arena.state.phase === 'battle' && window.arena.renderer.battleIntroReady && window.arena.battles.some(battle => battle.time >= .5), null, {timeout:45000});
  await coldPage.locator('[data-action=pause]').tap();
  await coldPage.waitForFunction(() => window.arena.renderer.diagnostics().gpuTextures > 0);
  assert.deepEqual(await coldPage.evaluate(() => window.arena.renderer.diagnostics().loadErrors), []);
  await coldPage.screenshot({path:`${output}/offline-battle-mobile.png`});
  results.push({name:'network-disabled-cold-start-and-battle', status:'passed', savedGameUnchanged:true, freshAtlas:unseen.url, atlasSHA256:unseenDigest.sha256});

  await coldPage.locator('[data-action=menu]').tap();
  await coldPage.locator('#seedInput').fill('313');
  await coldPage.locator('[data-action=newGame]').click();
  assert.equal(await coldPage.evaluate(() => window.arena.state.seed), 313, 'Offline new-game seed was ignored');
  await coldPage.locator('[data-buy="0"]').tap();
  const purchasedOffline = await coldPage.evaluate(() => window.arena.state.players[0].reserve[0]?.id);
  assert(purchasedOffline, 'Offline skill purchase did not populate the reserve');
  await coldPage.locator('[data-action=mobileInfo]').tap();
  await coldPage.locator('[data-reserve="0"]').tap();
  await coldPage.locator('[data-action=closeMobileInfo]').tap();
  await coldPage.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').tap();
  assert.equal(await coldPage.evaluate(() => window.arena.state.players[0].heroes[0].skills[0]?.id), purchasedOffline);
  await coldPage.locator('#ready').tap();
  await coldPage.waitForFunction(() => window.arena.state.phase === 'battle' && window.arena.renderer.battleIntroReady && window.arena.battles.some(battle => battle.time >= .5), null, {timeout:45000});
  await coldPage.locator('[data-action=pause]').tap();
  assert.deepEqual(await coldPage.evaluate(() => window.arena.renderer.diagnostics().loadErrors), []);
  await coldPage.screenshot({path:`${output}/offline-new-game-mobile.png`});
  results.push({name:'network-disabled-new-game-and-skill-purchase', status:'passed', seed:313, equippedSkill:purchasedOffline, realBattleAdvanced:true});
  await context.setOffline(false);

  // Change only the served worker's build identity, rather than mutating dist.
  // The update must wait for a user action, and a shell-only new cache must
  // never inherit the complete old version's ready badge.
  const beforeUpdate = await coldPage.evaluate(async () => {
    window.arena.save();
    const unrelated = await caches.open('pwa-smoke-unrelated');
    await unrelated.put('/unrelated-marker', new Response('preserve'));
    return {state:JSON.stringify(window.arena.state), save:localStorage.getItem('arcane-arena.save.v1')};
  });
  updateVersion = `${inventory.version}-update-fixture`;
  await coldPage.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await coldPage.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed', null, {timeout:60000});
  assert(transformedWorkers > 0, 'Update fixture did not serve a changed worker');
  assert.equal(await coldPage.evaluate(() => JSON.stringify(window.arena.state)), beforeUpdate.state, 'Waiting update changed the current game');
  assert.equal(await coldPage.locator('html').getAttribute('data-offline-state'), 'ready', 'Waiting update interrupted the complete active build');
  await coldPage.locator('[data-action=offline]:visible').first().tap();
  const updateButton = coldPage.locator('#offlineDialog [data-action=updatePwa]');
  await updateButton.waitFor({state:'visible'});
  await updateButton.click();
  await coldPage.waitForFunction(() => window.arena?.state && document.documentElement.dataset.offlineState === 'idle', null, {timeout:45000});
  assert.equal(await coldPage.evaluate(() => JSON.stringify(window.arena.state)), beforeUpdate.state, 'Explicit application update changed a compatible saved game');
  assert.equal(await coldPage.evaluate(() => localStorage.getItem('arcane-arena.save.v1')), beforeUpdate.save, 'Application update replaced localStorage');
  assert.equal(await coldPage.evaluate(async () => (await (await caches.open('pwa-smoke-unrelated')).match('/unrelated-marker'))?.text()), 'preserve', 'Application update deleted another app cache');
  const newCacheReady = await coldPage.evaluate(async version => !!await (await caches.open(`arcane-arena-${version}`)).match(new URL('__offline_ready__', location.origin + '/')), updateVersion);
  assert.equal(newCacheReady, false, 'The new shell-only cache inherited an offline-ready marker');
  results.push({name:'explicit-safe-update', status:'passed', oldVersion:inventory.version, newVersion:updateVersion, waitingPreservesCurrentGame:true, newVersionRequiresDownload:true, unrelatedCachePreserved:true, savedGameUnchanged:true});
  updateVersion = '';
  await context.close();
  offlineContext = undefined;

  browser = await chromium.launch({headless:true});

  // Desktop Chromium provides a real Fullscreen API in headless mode. Keep the
  // full document in fullscreen so dialogs, shop and portrait guidance survive.
  {
    const page = await browser.newPage({viewport:{width:1600, height:900}});
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await startGame(page);
    const button = page.locator('.rail-global-tools [data-action=fullscreen]');
    await withinViewport(button);
    const before = await page.evaluate(() => JSON.stringify(window.arena.state));
    await button.click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert(await page.locator('#arenaShop').isVisible(), 'Fullscreen hid the build controls');
    await page.locator('[data-action=settings]').click();
    assert(await page.locator('#dialog[open]').isVisible(), 'Settings are missing from the fullscreen document');
    await page.locator('#dialog .dialog-close').click();
    await page.screenshot({path:`${output}/fullscreen-desktop.png`});
    await button.click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => JSON.stringify(window.arena.state)), before, 'Fullscreen toggle changed the game');
    results.push({name:'native-fullscreen-enter-and-exit', status:'passed', allGameControlsPresent:true, stateUnchanged:true});
    await page.close();
  }

  {
    const page = await browser.newPage({viewport:{width:844, height:390}, hasTouch:true, isMobile:true});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Fixture denied fullscreen', 'NotAllowedError'));
    });
    await page.goto(origin);
    await startGame(page);
    const button = page.locator('.mobile-nav [data-action=fullscreen]');
    await withinViewport(button);
    await button.tap();
    await page.locator('#fullscreenHelp[open]').waitFor();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    assert((await page.locator('#fullscreenHelp').innerText()).trim().length > 10);
    await page.waitForTimeout(400); // Let Chromium's transient touch highlight fade.
    await page.screenshot({path:`${output}/fullscreen-denied-mobile.png`});
    results.push({name:'denied-fullscreen-guidance', status:'passed', fullscreen:false});
    await page.close();
  }

  {
    const page = await browser.newPage({viewport:{width:390, height:844}, hasTouch:true, isMobile:true, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {configurable:true, value:undefined});
      Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', {configurable:true, value:undefined});
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.arena?.state);
    const button = page.locator('.orientation [data-action=fullscreen]');
    await withinViewport(button);
    await button.tap();
    await page.locator('#fullscreenHelp[open]').waitFor();
    assert.match(await page.locator('#fullscreenHelp').innerText(), /Safari.*分享.*添加到主屏幕/);
    await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/portrait-install-guidance.png`});
    await page.locator('#fullscreenHelp button').click();
    const portraitOfflineButton = page.locator('.orientation [data-action=offline]');
    await withinViewport(portraitOfflineButton);
    await portraitOfflineButton.tap();
    await page.locator('#offlineDialog[open]').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/portrait-offline-panel.png`});
    results.push({name:'portrait-no-api-install-guidance', status:'passed', viewport:'390x844', initialMenuOpen:true});
    await page.close();
  }

  assert.deepEqual(errors, [], 'Browser JavaScript errors occurred');
  const report = {status:'passed', generatedAt:new Date().toISOString(), elapsedSeconds:(Date.now() - startedAt) / 1000, storageProfile:'persistent', initialStorage, progress, inventory:{version:inventory.version, files:inventory.files.length, bytes:inventory.totalBytes}, results, errors};
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const failureDiagnostics = await diagnostics(diagnosticPage);
  console.error(`[PWA failure] ${JSON.stringify(failureDiagnostics)}`);
  if (diagnosticPage && !diagnosticPage.isClosed()) await diagnosticPage.screenshot({path:`${output}/failure.png`}).catch(() => {});
  await fs.writeFile(`${output}/report.json`, JSON.stringify({status:'failed', storageProfile:'persistent', elapsedSeconds:(Date.now() - startedAt) / 1000, results, progress, errors, diagnostics:failureDiagnostics, network:{uniquePaths:fetchedPaths.size, failedRequests, recentPaths:[...requestCounts].slice(-12)}, message:String(error), stack:error.stack}, null, 2));
  throw error;
} finally {
  failResource = false;
  await offlineContext?.close();
  await browser?.close();
  agent.destroy();
  proxy.closeAllConnections();
  await new Promise(resolve => proxy.close(resolve));
  const resolvedProfile = await fs.realpath(profileDirectory);
  const resolvedTemp = await fs.realpath(os.tmpdir());
  assert.equal(path.dirname(resolvedProfile), resolvedTemp, 'Temporary profile escaped the system temp directory');
  assert(path.basename(resolvedProfile).startsWith('arcane-arena-pwa-'), 'Unexpected temporary profile name');
  await fs.rm(resolvedProfile, {recursive:true, force:true, maxRetries:3});
}

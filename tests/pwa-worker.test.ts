import {createHash, webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe, expect, it} from 'vitest';

const origin = 'http://localhost:4173';
const bodies = new Map([
  ['/index.html', '<html>game</html>'], ['/assets/app.js', '/* app */'],
  ['/data/assets.json', '{"characters":{}}'], ['/art/mobile/a.webp', 'mobile-image'],
  ['/art/desktop/b.webp', 'desktop-image']
]);
const files = [...bodies].map(([url, body]) => ({
  url, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex')
}));
const manifest = {version: 'test-build', totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
  shell: ['/index.html', '/assets/app.js', '/data/assets.json']};
const workerSource = readFileSync(new URL('../scripts/pwa-worker.js', import.meta.url), 'utf8')
  .replace('/* OFFLINE_MANIFEST */', JSON.stringify(manifest));

function worker() {
  const handlers = new Map<string, (event: any) => unknown>();
  const messages: any[] = [], requests: string[] = [];
  const stores = new Map<string, Map<string, Response>>();
  const unavailable = new Set<string>();
  const overrides = new Map<string, {body: string; type?: string}>();
  let quotaFailure = false;
  const normalize = (request: string | {url: string}) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async keys() { return [...store.keys()].map(url => new Request(url)); },
        async match(request: string | {url: string}) { return store.get(normalize(request))?.clone(); },
        async put(request: string | {url: string}, response: Response) {
          if (quotaFailure) throw new DOMException('storage full', 'QuotaExceededError');
          store.set(normalize(request), response.clone());
        },
        async delete(request: string | {url: string}) { return store.delete(normalize(request)); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); }
  };
  const self = {
    registration: {scope: origin + '/'}, location: {origin},
    clients: {async matchAll() { return [{postMessage(message: unknown) { messages.push(message); }}]; }, async claim() {}},
    addEventListener(type: string, handler: (event: any) => unknown) { handlers.set(type, handler); },
    async skipWaiting() {}
  };
  vm.runInNewContext(workerSource, {
    self, caches, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout, crypto: webcrypto,
    fetch: async (request: string | {url: string}) => {
      const pathname = new URL(normalize(request)).pathname;
      requests.push(pathname);
      if (unavailable.has(pathname)) throw new TypeError('network disconnected');
      if (pathname === '/offline-assets.json') return Response.json(manifest);
      const override = overrides.get(pathname), body = override?.body ?? bodies.get(pathname);
      return new Response(body ?? 'Not found', {status: body === undefined ? 404 : 200, headers: {
        'Content-Type': override?.type ?? (pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.json') ? 'application/json' :
          pathname.endsWith('.js') ? 'text/javascript' : 'image/webp')
      }});
    }
  });
  async function dispatch(type: string, event: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(type)!({...event, waitUntil(promise: Promise<unknown>) { waits.push(promise); },
      respondWith(promise: Promise<Response>) { response = promise; }});
    await Promise.all(waits);
    return response ? await response : undefined;
  }
  async function status() {
    let result: any;
    await dispatch('message', {data: {type: 'OFFLINE_STATUS'}, ports: [{postMessage(message: any) { result = message; }}]});
    return result;
  }
  const download = () => dispatch('message', {data: {type: 'DOWNLOAD_OFFLINE'}});
  return {dispatch, download, status, messages, requests, stores, unavailable, overrides,
    setQuotaFailure(value: boolean) { quotaFailure = value; }};
}

describe('PWA offline readiness and resumable resources', () => {
  it('caches only the shell during install and requires every lazy texture before readiness', async () => {
    const sw = worker();
    await sw.dispatch('install');
    expect((await sw.status()).state).toBe('idle');
    expect(sw.requests).not.toContain('/art/desktop/b.webp');
    await sw.download();
    expect(await sw.status()).toMatchObject({state: 'ready', completed: files.length, bytes: manifest.totalBytes});
    expect(sw.requests.filter(path => path === '/index.html')).toHaveLength(1);
    expect(sw.requests).toContain('/art/mobile/a.webp');
    expect(sw.requests).toContain('/art/desktop/b.webp');
  });
  it('resumes interrupted downloads and never reports readiness after a missing resource or quota failure', async () => {
    const sw = worker();
    await sw.dispatch('install');
    sw.unavailable.add('/art/mobile/a.webp');
    await sw.download();
    expect((await sw.status()).state).toBe('error');
    const successful = sw.requests.filter(path => path === '/art/desktop/b.webp').length;
    sw.unavailable.clear();
    await sw.download();
    expect((await sw.status()).state).toBe('ready');
    expect(sw.requests.filter(path => path === '/art/desktop/b.webp')).toHaveLength(successful);

    const full = worker();
    full.setQuotaFailure(true);
    await full.download();
    expect((await full.status()).state).toBe('error');
    expect(full.messages.at(-1).error).toContain('空间');
  });
  it('rechecks actual resources after eviction and repairs them on the next download', async () => {
    const sw = worker();
    await sw.download();
    expect((await sw.status()).state).toBe('ready');
    const cache = sw.stores.get('arcane-arena-test-build')!;
    cache.delete(origin + '/art/mobile/a.webp');
    expect(await sw.status()).toMatchObject({state: 'idle', completed: files.length - 1});
    const previous = sw.requests.length;
    await sw.download();
    expect((await sw.status()).state).toBe('ready');
    expect(sw.requests.slice(previous)).toEqual(['/art/mobile/a.webp']);
  });
  it('serves the cached shell for an offline navigation and ignores unrelated origins', async () => {
    const sw = worker();
    await sw.download();
    sw.unavailable.add('/');
    const response = await sw.dispatch('fetch', {request: {url: origin + '/?from=homescreen', method: 'GET', mode: 'navigate'}});
    expect(await response!.text()).toBe(bodies.get('/index.html'));
    expect(await sw.dispatch('fetch', {request: {url: 'https://other.example/', method: 'GET', mode: 'navigate'}})).toBeUndefined();
  });
  it('rejects mismatched build bytes and never caches an HTML fallback as a lazy texture', async () => {
    const sw = worker();
    await sw.dispatch('install');
    sw.overrides.set('/art/mobile/a.webp', {body: 'changed-data'});
    await sw.download();
    expect((await sw.status()).state).toBe('error');
    const cache = sw.stores.get('arcane-arena-test-build')!;
    expect(cache.has(origin + '/art/mobile/a.webp')).toBe(false);

    sw.overrides.clear();
    const fallback = worker();
    await fallback.dispatch('install');
    fallback.overrides.set('/art/mobile/a.webp', {body: '<html>fallback</html>', type: 'text/html'});
    await fallback.dispatch('fetch', {request: {url: origin + '/art/mobile/a.webp', method: 'GET', mode: 'cors'}}).catch(() => {});
    expect(fallback.stores.get('arcane-arena-test-build')!.has(origin + '/art/mobile/a.webp')).toBe(false);
    fallback.overrides.clear();
    await fallback.download();
    expect((await fallback.status()).state).toBe('ready');
  });
  it('cleans superseded game caches on activation while preserving immutable chunks and other apps', async () => {
    const sw = worker();
    const oldCache = new Map([
      [origin + '/assets/old-hash.js', new Response('old app module')],
      [origin + '/art/mobile/old.webp', new Response('large old texture')],
      [origin + '/__offline_ready__', new Response('old-build')]
    ]);
    const unrelated = new Map([[origin + '/other-app', new Response('unrelated')]]);
    sw.stores.set('arcane-arena-old-build', oldCache);
    sw.stores.set('unrelated-app-cache', unrelated);
    await sw.dispatch('install');
    // Installing an update must not disturb the active game's offline resources.
    expect(sw.stores.has('arcane-arena-old-build')).toBe(true);
    await sw.dispatch('activate');
    expect(sw.stores.has('arcane-arena-old-build')).toBe(false);
    expect(sw.stores.get('unrelated-app-cache')).toBe(unrelated);
    const current = sw.stores.get('arcane-arena-test-build')!;
    expect(await current.get(origin + '/assets/old-hash.js')!.text()).toBe('old app module');
    expect(current.has(origin + '/art/mobile/old.webp')).toBe(false);
    expect(current.has(origin + '/__offline_ready__')).toBe(false);
    expect((await sw.status()).state).toBe('idle');
  });
});

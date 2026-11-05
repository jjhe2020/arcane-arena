import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

const root = fileURLToPath(new URL('../', import.meta.url));
const maxPairs = 100_000_000;
const manifestVersion = 2;

function usage() {
  console.log(`npm run balance:run -- run [--pairs 10000] [--seed 20261105] [--round 15] [--workers 4] [--out output/balance]
npm run balance:run -- pause  [--out output/balance]
npm run balance:run -- resume [--out output/balance]
npm run balance:run -- status [--out output/balance]
npm run balance:run -- report [--out output/balance]
每个阵容对打两场并交换出场方向。暂停等待本批写盘，Ctrl+C 退出也会保留结果。`);
}

function argumentsFor(args) {
  const command = args[0]?.startsWith('--') || !args[0] ? 'run' : args.shift();
  const allowed = command === 'run' ? ['out', 'pairs', 'seed', 'round', 'workers'] : ['out'];
  const flags = {};
  while (args.length) {
    const key = args.shift();
    const value = args.shift();
    if (!key?.startsWith('--') || !allowed.includes(key.slice(2)) || !value || value.startsWith('--') || Object.hasOwn(flags, key.slice(2))) {
      throw new Error(`无效的实验参数：${key}`);
    }
    flags[key.slice(2)] = value;
  }
  return { command, flags };
}

function numberFlag(value, fallback, min, max, flag) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`--${flag} 必须是 ${min} 到 ${max} 的整数`);
  }
  return n;
}

async function readOptional(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}

async function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flush: true });
  await rename(temp, file);
}

async function bundleSource(entry) {
  const { build } = await import('vite');
  const bundle = await build({
    root, configFile: false, publicDir: false, logLevel: 'error',
    build: {
      ssr: resolve(root, 'scripts', entry), target: 'node22', write: false, minify: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const chunks = bundle.output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1) throw new Error('无法打包离线战斗实验入口');
  return chunks[0].code;
}

function simulationDigest(source, catalog) {
  return createHash('sha256').update(source).update('\0').update(catalog).digest('hex');
}

async function createSnapshot(out) {
  const [source, catalog] = await Promise.all([
    bundleSource('balance-design.ts'),
    readFile(join(root, 'public', 'data', 'skills.json')),
  ]);
  const digest = simulationDigest(source, catalog);
  const snapshot = basename(await mkdtemp(join(out, '.engine-')));
  const { bundle, definitions } = snapshotFiles(out, snapshot);
  await Promise.all([writeFile(bundle, source, { flush: true }), writeFile(definitions, catalog, { flush: true })]);
  const { SIMULATION_REVISION: simulationRevision } = await import(pathToFileURL(bundle).href);
  return { snapshot, digest, simulationRevision };
}

function snapshotFiles(out, snapshot) {
  const directory = join(out, snapshot);
  return { bundle: join(directory, 'simulation.mjs'), definitions: join(directory, 'skills.json') };
}

async function loadSnapshot(out, manifest) {
  const { bundle, definitions } = snapshotFiles(out, manifest.snapshot);
  const [source, catalog] = await Promise.all([readFile(bundle), readFile(definitions)]);
  if (simulationDigest(source, catalog) !== manifest.digest) throw new Error('实验战斗快照校验失败');
  return { bundle, definitions, catalog };
}

function runFiles(out) {
  return {
    out,
    manifest: join(out, 'run.json'),
    data: join(out, 'results.bin'),
    pause: join(out, 'pause.flag'),
    lock: join(out, 'run.lock'),
  };
}

async function readManifest(files) {
  const raw = await readOptional(files.manifest);
  if (!raw) return undefined;
  const manifest = JSON.parse(raw.toString('utf8'));
  const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (manifest?.version !== manifestVersion || !integer(manifest.seed, 0, 0xffffffff) ||
      !integer(manifest.round, 9, 10001) || !integer(manifest.targetPairs, 1, maxPairs) ||
      !/^[a-f0-9]{64}$/.test(manifest.digest) || !/^\.engine-[A-Za-z0-9]{6}$/.test(manifest.snapshot) ||
      typeof manifest.simulationRevision !== 'string') {
    throw new Error('实验记录格式不兼容');
  }
  return manifest;
}

async function readResults(files) {
  const values = await readOptional(files.data) ?? Buffer.alloc(0);
  if (values.length > maxPairs || values.some(code => code > 8)) throw new Error('战斗记录损坏或超出长度上限');
  return values;
}

async function lockRun(file) {
  let handle;
  try {
    handle = await open(file, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`实验目录已锁定：${file}。请先用 status 检查进程。`);
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
  } finally {
    await handle.close();
  }
}

async function run(files, flags) {
  const workerCount = numberFlag(flags.workers, Math.min(4, availableParallelism()), 1, availableParallelism(), 'workers');
  await mkdir(files.out, { recursive: true });
  await lockRun(files.lock);
  const workers = [];
  let journal;
  let stopping = false;
  let workerError;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const old = await readManifest(files);
    const seed = numberFlag(flags.seed, old?.seed ?? 20261105, 0, 0xffffffff, 'seed');
    const round = numberFlag(flags.round, old?.round ?? 15, 9, 10001, 'round');
    const targetPairs = numberFlag(flags.pairs, old?.targetPairs ?? 10_000, 1, maxPairs, 'pairs');
    if (old && (old.seed !== seed || old.round !== round)) throw new Error('已有实验的种子和回合固定。请用 --out 新建实验。');
    let completed = (await readResults(files)).length;
    if (!old && completed) throw new Error('战斗记录缺少对应的 run.json，无法安全续跑');
    if (completed > targetPairs) throw new Error(`已完成 ${completed} 对，--pairs 不能低于现有进度`);
    const snapshot = old ?? await createSnapshot(files.out);
    const manifest = { ...snapshot, version: manifestVersion, seed, round, targetPairs };
    const { bundle, definitions } = await loadSnapshot(files.out, manifest);
    await writeJson(files.manifest, manifest);
    journal = await open(files.data, 'a');
    if (completed === targetPairs) {
      console.log(`已完成 ${completed}/${targetPairs} 对。`);
      return true;
    }
    let paused = false;
    let lastStatus = 0;
    let lastSync = 0;
    const initial = completed;
    const started = Date.now();
    const count = Math.min(workerCount, targetPairs - completed);
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: { bundle, definitions, seed, round } });
      worker.on('error', error => {
        workerError = error;
        stop();
      });
      workers.push(worker);
    }
    console.log(`实验 PID ${process.pid}，${workers.length} 个工作线程，回合 ${round}，已完成 ${completed}/${targetPairs} 对。`);
    while (!stopping && completed < targetPairs) {
      if (await readOptional(files.pause)) {
        if (!paused) {
          await journal.sync();
          paused = true;
          console.log(`已暂停，保存 ${completed}/${targetPairs} 对。`);
        }
        await delay(750);
        continue;
      }
      if (paused) console.log('已恢复实验。');
      paused = false;
      const active = workers.slice(0, Math.min(workers.length, targetPairs - completed));
      const values = await Promise.all(active.map(async (worker, slot) => {
        const result = once(worker, 'message');
        worker.postMessage(completed + slot);
        const [code] = await result;
        return code;
      }));
      await journal.writeFile(Buffer.from(values));
      completed += values.length;
      const now = Date.now();
      if (now - lastSync >= 10_000) {
        await journal.sync();
        lastSync = now;
      }
      if (now - lastStatus >= 15_000) {
        const rate = (completed - initial) / ((now - started) / 1000);
        console.log(`${completed}/${targetPairs} 对，${rate.toFixed(2)} 对/秒。`);
        lastStatus = now;
      }
    }
    if (workerError) throw workerError;
    console.log(`${completed === targetPairs ? '实验完成' : '实验已退出'}，保存 ${completed}/${targetPairs} 对。`);
    return completed === targetPairs;
  } finally {
    await Promise.allSettled(workers.map(worker => worker.terminate()));
    try {
      if (journal) {
        try { await journal.sync(); } finally { await journal.close(); }
      }
    } finally {
      await rm(files.lock, { force: true });
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
}

async function status(files) {
  const manifest = await readManifest(files);
  const completed = (await readResults(files)).length;
  const paused = !!await readOptional(files.pause);
  const pid = Number((await readOptional(files.lock))?.toString('utf8'));
  let running = false;
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      running = true;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  console.log(JSON.stringify({ completed, battles: completed * 2, targetPairs: manifest?.targetPairs ?? null, pauseRequested: paused, pid: pid || null, running }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args[0] === 'help') return usage();
  const { command, flags } = argumentsFor(args);
  const files = runFiles(resolve(flags.out ?? join(root, 'output', 'balance')));
  if (command === 'run' && !await run(files, flags)) return;
  if (command === 'status') return status(files);
  if (command === 'pause' || command === 'resume') {
    if (!await readManifest(files)) throw new Error('目录中还没有可控制的实验');
    if (command === 'pause') {
      await writeFile(files.pause, '');
      console.log('已请求暂停。运行进程将在当前批次结束后保存。');
    } else {
      await rm(files.pause, { force: true });
      console.log('已解除暂停。若运行进程已退出，重复原 run 命令即可从已保存记录继续。');
    }
    return;
  }
  if (command === 'report' || command === 'run') {
    const { report } = await import('./balance-report.mjs');
    return report(files, { readManifest, readResults, loadSnapshot, bundleSource, writeJson });
  }
  throw new Error(`未知的实验命令：${command}。使用 --help 查看帮助。`);
}

if (isMainThread) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} else {
  const { bundle, definitions, seed, round } = workerData;
  const { createSamplingDesign, simulateMatch } = await import(pathToFileURL(bundle).href);
  const design = createSamplingDesign(JSON.parse(await readFile(definitions, 'utf8')), seed);
  parentPort.on('message', index => {
    try {
      parentPort.postMessage(simulateMatch(design, index, round));
    } catch (error) {
      throw new Error(`第 ${index} 对阵容战斗失败：${error instanceof Error ? error.stack : error}`);
    }
  });
}

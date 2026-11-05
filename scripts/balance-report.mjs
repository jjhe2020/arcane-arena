import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function report(files, { readManifest, readResults, loadSnapshot, bundleSource, writeJson }) {
  const [manifest, results] = await Promise.all([readManifest(files), readResults(files)]);
  if (!manifest || !results.length) throw new Error('实验至少需要完成一对阵容后才能生成报告');
  const directory = await mkdtemp(join(files.out, '.report-'));
  const analysisFile = join(directory, 'analysis.mjs');
  try {
    const { bundle, catalog } = await loadSnapshot(files.out, manifest);
    await writeFile(analysisFile, await bundleSource('balance-analysis.ts'));
    const [{createSamplingDesign}, {analyzeBalance}] = await Promise.all([
      import(pathToFileURL(bundle).href),
      import(pathToFileURL(analysisFile).href),
    ]);
    const design = createSamplingDesign(JSON.parse(catalog.toString('utf8')), manifest.seed);
    const analysis = analyzeBalance(design, results);
    const path = join(files.out, 'report.json');
    await writeJson(path, {
      run: manifest,
      complete: results.length === manifest.targetPairs,
      methodology: {
        skillLevels: 'winRate 为实际胜局占比。winScore 将平局计 0.5，effect 以 0.5 为基准。',
        sameHeroPairs: '两项技能同装在一个英雄，effect 为实际胜分减去单技能等级加法模型预测胜分。',
        sameTeamPairs: '两项技能同队，包含同英雄配装。effect 同上。',
        opposedPairs: '两项技能分属敌我，effect 为第一项所在队伍超出单技能等级预测的胜分。',
        uncertainty: '95% 区间为阵容对聚类的近似区间；flagged 还需满足最少样本、实际效应及多重筛选门槛。结果用于提出复测假设。',
      },
      ...analysis,
    });
    console.log(`${results.length} 对 / ${results.length * 2} 场的报告已写入 ${path}`);
  } finally {
    await rm(analysisFile, { force: true });
    await rmdir(directory);
  }
}

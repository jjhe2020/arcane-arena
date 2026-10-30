import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function validateReleaseTag(root, tag) {
  const {version, releaseRevision} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(version, /^\d+\.\d+\.\d+$/, 'package.json version must be a stable three-part version');
  const source = await fs.readFile(path.join(root, 'src/simulation-version.ts'), 'utf8');
  const simulationRevision = source.match(/export\s+const\s+SIMULATION_REVISION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  assert.ok(simulationRevision, 'SIMULATION_REVISION was not found');
  // UI and offline releases must not invalidate compatible saves and battle replays.
  const revision = releaseRevision ?? simulationRevision.split('-').at(-1);
  assert.match(revision, /^r\d+$/, 'releaseRevision must be r<number> (legacy fallback: SIMULATION_REVISION suffix)');
  const expectedTags = [`v${version}`, `v${version}-${revision}`];
  assert.ok(expectedTags.includes(tag), `Invalid release tag ${JSON.stringify(tag)}; expected ${expectedTags.join(' or ')}`);
  const notesFile = `docs/${revision}-validation.md`;
  await fs.access(path.join(root, notesFile));
  return {tag, version, revision, simulationRevision, prerelease: tag.includes('-'), notesFile};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await validateReleaseTag(root, process.argv[2] ?? process.env.GITHUB_REF_NAME);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(JSON.stringify(result));
}

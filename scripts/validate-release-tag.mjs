import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const {version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/, 'package.json version must be a stable three-part version');
const source = await fs.readFile(path.join(root, 'src/simulation-version.ts'), 'utf8');
const simulationRevision = source.match(/export\s+const\s+SIMULATION_REVISION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
assert.ok(simulationRevision, 'SIMULATION_REVISION was not found');
const revision = simulationRevision.split('-').at(-1);
assert.match(revision, /^r\d+$/, 'SIMULATION_REVISION must end in r<number>');
const expectedTags = [`v${version}`, `v${version}-${revision}`];
assert.ok(expectedTags.includes(tag), `Invalid release tag ${JSON.stringify(tag)}; expected ${expectedTags.join(' or ')}`);
const notesFile = `docs/${revision}-validation.md`;
await fs.access(path.join(root, notesFile));
const result = {tag, version, revision, simulationRevision, prerelease: tag.includes('-'), notesFile};
if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
}
console.log(JSON.stringify(result));

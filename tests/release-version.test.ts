import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
// @ts-expect-error The release CLI intentionally stays dependency-free JavaScript.
import {validateReleaseTag} from '../scripts/validate-release-tag.mjs';

const output = path.resolve('output');
let fixture: string;
async function metadata(releaseRevision?: string) {
  await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({version: '0.1.1', releaseRevision}));
}
beforeEach(async () => {
  await fs.mkdir(output, {recursive: true});
  fixture = await fs.mkdtemp(path.join(output, 'release-version-'));
  await Promise.all(['src', 'docs'].map(directory => fs.mkdir(path.join(fixture, directory))));
  await fs.writeFile(path.join(fixture, 'src/simulation-version.ts'), "export const SIMULATION_REVISION='arena-compatible-r10';\n");
  await Promise.all(['r10', 'r11'].map(revision => fs.writeFile(path.join(fixture, `docs/${revision}-validation.md`), revision)));
});
afterEach(async () => {
  if (path.dirname(path.resolve(fixture)) !== output || !path.basename(fixture).startsWith('release-version-')) {
    throw Error('Refusing to remove release fixture outside the task output directory');
  }
  await fs.rm(fixture, {recursive: true, force: true});
});

describe('release revision and compatible battle saves', () => {
  it('releases a UI revision independently of the unchanged simulation signature', async () => {
    await metadata('r11');
    expect(await validateReleaseTag(fixture, 'v0.1.1-r11')).toEqual({
      tag: 'v0.1.1-r11', version: '0.1.1', revision: 'r11', simulationRevision: 'arena-compatible-r10',
      prerelease: true, notesFile: 'docs/r11-validation.md'
    });
    await expect(validateReleaseTag(fixture, 'v0.1.1-r10')).rejects.toThrow('Invalid release tag');
    expect((await validateReleaseTag(fixture, 'v0.1.1')).prerelease).toBe(false);
  });
  it('retains simulation-suffix validation for legacy package metadata', async () => {
    await metadata();
    expect((await validateReleaseTag(fixture, 'v0.1.1-r10')).revision).toBe('r10');
  });
  it('rejects a malformed explicit revision and missing validation notes', async () => {
    await metadata('../r11');
    await expect(validateReleaseTag(fixture, 'v0.1.1-r11')).rejects.toThrow('releaseRevision');
    await metadata('r12');
    await expect(validateReleaseTag(fixture, 'v0.1.1-r12')).rejects.toThrow('ENOENT');
  });
});

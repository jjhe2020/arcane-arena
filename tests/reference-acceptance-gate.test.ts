import {describe,it,expect} from 'vitest';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
// @ts-expect-error The audit CLI intentionally stays dependency-free JavaScript.
import {evaluateRequirement,referenceFingerprint,referenceTestFiles} from '../scripts/reference-acceptance.mjs';
describe('reference acceptance evidence gate',()=>{
 const sources=[{id:'wiki',url:'https://liquipedia.net/dota2/Zeus',observation:'Unique victims and delayed jumps.',versionContext:'Historical KV comparison'}];
 const q={id:'Q',status:'passed',sourceIds:['wiki'],testEvidence:[{file:'tests/reference-example.test.ts',test:'checks the actual jump'}]};
 const proof={tests:[{file:'tests/reference-example.test.ts',title:'checks the actual jump',status:'passed'}]};
 it('does not count stale passing tests as current original-reference verification',()=>{expect(evaluateRequirement(q,sources,proof,false).referenceVerified).toBe(false);});
 it('requires a real named passing test and a versioned source for each claim',()=>{
  expect(evaluateRequirement(q,sources,proof,true).referenceVerified).toBe(true);
  expect(evaluateRequirement({...q,sourceIds:[]},sources,proof,true).referenceVerified).toBe(false);
  expect(evaluateRequirement({...q,testEvidence:[{file:'tests/reference-example.test.ts',test:'not actually executed'}]},sources,proof,true).referenceVerified).toBe(false);
 });
 it('executes every evidence-bound test file even when its name lacks the reference prefix',async()=>{
  const output=resolve('output');await mkdir(output,{recursive:true});const fixture=await mkdtemp(join(output,'reference-files-'));
  try{
   for(const directory of ['tests','src','references/dota-wiki/acceptance'])await mkdir(join(fixture,directory),{recursive:true});
   for(const file of ['tests/reference-example.test.ts','tests/combat-advanced.test.ts','src/visual.test.ts'])await writeFile(join(fixture,file),'');
   const ledger=join(fixture,'references/dota-wiki/acceptance/group.json');
   await writeFile(ledger,JSON.stringify({engineRequirements:[{testEvidence:[{file:'src/visual.test.ts',test:'engine'}]}],skills:[{requirements:[{testEvidence:[{file:'tests/combat-advanced.test.ts',test:'actual combination'},{file:'tests/reference-example.test.ts',test:'duplicate'}]}]}]}));
   expect(await referenceTestFiles(fixture)).toEqual(['src/visual.test.ts','tests/combat-advanced.test.ts','tests/reference-example.test.ts']);
   await writeFile(ledger,JSON.stringify({engineRequirements:[{testEvidence:[{file:'tests/../../outside.test.ts',test:'invalid'}]}]}));
   await expect(referenceTestFiles(fixture)).rejects.toThrow('Invalid reference test path');
  }finally{
   if(dirname(resolve(fixture))!==output||!basename(fixture).startsWith('reference-files-'))throw Error('Refusing to remove a reference file fixture outside the task output directory');
   await rm(fixture,{recursive:true,force:true});
  }
 });
 it('invalidates proof when the consumed catalog or configuration compiler changes',async()=>{
  const output=resolve('output');await mkdir(output,{recursive:true});const fixture=await mkdtemp(join(output,'reference-fingerprint-'));
  try{
   for(const directory of ['src','tests','config','references/dota-wiki/acceptance','scripts','public/data'])await mkdir(join(fixture,directory),{recursive:true});
   const catalog=join(fixture,'public/data/skills.json'),compiler=join(fixture,'scripts/config-compiler.mjs');
   await writeFile(catalog,'[]\n');await writeFile(compiler,'export const coefficient=1;\n');const before=await referenceFingerprint(fixture);
   await writeFile(catalog,'[{"id":"changed"}]\n');expect(await referenceFingerprint(fixture)).not.toBe(before);
   await writeFile(catalog,'[]\n');expect(await referenceFingerprint(fixture)).toBe(before);
   await writeFile(compiler,'export const coefficient=2;\n');expect(await referenceFingerprint(fixture)).not.toBe(before);
  }finally{
   if(dirname(resolve(fixture))!==output||!basename(fixture).startsWith('reference-fingerprint-'))throw Error('Refusing to remove a fingerprint fixture outside the task output directory');
   await rm(fixture,{recursive:true,force:true});
  }
 });
});

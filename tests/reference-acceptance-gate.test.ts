import {describe,it,expect} from 'vitest';
// @ts-expect-error The audit CLI intentionally stays dependency-free JavaScript.
import {evaluateRequirement} from '../scripts/reference-acceptance.mjs';
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
});

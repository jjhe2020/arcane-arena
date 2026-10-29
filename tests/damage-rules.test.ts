import {describe,it,expect} from 'vitest';
import {independentFraction,selectCritical} from '../src/combat/damage-rules';
describe('reference damage combination rules',()=>{
 it('combines independent evasion and resistance without summing to immunity',()=>{
  expect(independentFraction([.5,.5])).toBeCloseTo(.75);
  expect(independentFraction([.25,.25])).toBeCloseTo(.4375);
  expect(independentFraction([])).toBe(0);
  expect(independentFraction([1,.5])).toBe(1);
 });
 it('rolls strongest first and does not consume weaker critical rolls',()=>{
  const calls:string[]=[];
  const result=selectCritical([{key:'weak',multiplier:2,roll:()=>{calls.push('weak');return true;}},{key:'strong',multiplier:4,roll:()=>{calls.push('strong');return true;}}]);
  expect(result.multiplier).toBe(4);expect(calls).toEqual(['strong']);
 });
 it('allows a weaker critical after the stronger one fails',()=>{
  const calls:string[]=[];
  const result=selectCritical([{key:'weak',multiplier:2,lifesteal:.5,roll:()=>{calls.push('weak');return true;}},{key:'strong',multiplier:4,roll:()=>{calls.push('strong');return false;}}]);
  expect(result).toEqual({multiplier:2,lifesteal:.5,key:'weak'});expect(calls).toEqual(['strong','weak']);
 });
});

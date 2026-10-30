import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/config',async importOriginal=>{
 const actual=await importOriginal<typeof import('../src/config')>();
 return{...actual,CONFIG_HASH:'test-changed-config',ECONOMY_CONFIG:{...actual.ECONOMY_CONFIG,copiesPerSkill:30,skillPrice:2,rerollPrice:2,moveSkillPrice:3,ultimateShopLevel:2,incomeBase:12,incomePerRound:3,incomeCap:24,roundDamageBase:7,roundDamageDivisor:2},SHOP_LEVELS:actual.SHOP_LEVELS.map((row,index)=>({...row,upgradePrice:index===0?5:row.upgradePrice}))};
});
import {newGame,buySkill,moveSkill,upgradeShop,validateGame,roundIncome,roundDamage,GAME_RULES,restoreGame,serializeGame} from '../src/game';
import type {SkillDefinition} from '../src/model';
const def=(id:string,ultimate=false):SkillDefinition=>({id,name:id,nameEn:id,description:'',descriptionEn:'',tags:[],categories:[],super:'',gaben:'',values:[],cooldowns:[],mana:[],icon:'',passive:false,ultimate});
describe('compiled economy is authoritative across execution and validation',()=>{
 it('uses configured income, purchase price, movement fee and shared inventory',()=>{
  const defs=[def('test')],state=newGame(31,1,defs),p=state.players[0];
  expect(p.gold).toBe(12);expect(roundIncome(2)).toBe(15);expect(roundIncome(20)).toBe(24);
  expect(GAME_RULES.copiesPerSkill).toBe(30);expect(buySkill(state,0,0)).toBeNull();expect(p.gold).toBe(10);
  expect(moveSkill(state,0,{reserve:0},{hero:0,slot:0})).toBeNull();expect(p.gold).toBe(10);
  expect(moveSkill(state,0,{hero:0,slot:0},{reserve:0})).toBeNull();expect(p.gold).toBe(7);
  expect(validateGame(state,defs)).toBeNull();expect(restoreGame(serializeGame(state),defs)).not.toBeNull();
  expect(roundDamage(2,2)).toBe(10);
 });
 it('accepts a configured ultimate threshold in both shop generation and save validation',()=>{
  const defs=[def('ultimate',true)],state=newGame(34,1,defs);expect(state.players[0].shop.every(id=>id===null)).toBe(true);
  expect(upgradeShop(state,0)).toBeNull();expect(state.players[0].gold).toBe(7);
  expect(state.players[0].shop.some(id=>id==='ultimate')).toBe(true);expect(validateGame(state,defs)).toBeNull();
 });
});

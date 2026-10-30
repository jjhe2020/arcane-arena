import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle,queueSpellOrder,serializeBattle,restoreBattle} from '../src/combat';
import type {BattleState,Player,SkillDefinition} from '../src/model';

const definitions=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const SHARPSHOOTER='custom_hoodwink_sharpshooter',BOOMERANG='hoodwink_hunters_boomerang',JINGU='custom_monkey_king_jingu_mastery';
/** Untouched initial players and the real final registry/catalog. No post-create
 * HP/positions/statuses/programs or runtime clocks are inserted into replay. */
function player(id:number,ability:string):Player{return{id,name:'P',hp:100,gold:0,shopLevel:5,locked:false,shop:[],reserve:[],heroes:[0,1].map(i=>({id:`h${id}-${i}`,name:'H',role:i?'tank':'mage',skin:'male',x:i?2:0,y:-3,skills:id===0&&i===0?[{id:ability,points:9}]:[]}))};}
function restoredPair(battle:BattleState){const saved=serializeBattle(battle),eager=restoreBattle(saved,definitions),lazy=JSON.parse(saved) as BattleState;stepBattle(lazy,0,definitions);return[eager,lazy];}
function expectSame(actual:BattleState,expected:BattleState){
 expect(actual.events).toEqual(expected.events);expect(actual.rng).toBe(expected.rng);expect(actual.units).toEqual(expected.units);expect(actual.spellOrders).toEqual(expected.spellOrders);expect(actual.visualBodyActions).toEqual(expected.visualBodyActions);expect(actual.visualProjectiles).toEqual(expected.visualProjectiles);expect(actual.visualWorldEffects).toEqual(expected.visualWorldEffects);
}
function expectContinuation(battle:BattleState,restored:BattleState[]){for(const other of restored)expectSame(other,battle);stepBattle(battle,.9,definitions);for(const other of restored){stepBattle(other,.9,definitions);expectSame(other,battle);}}

describe('C16 real input and profession snapshot replay intermediate states',()=>{
 it('C16-REPLAY01 an accepted real point order restores before its first dispatch and continues identically through both restore paths',()=>{
  const battle=createBattle(player(0,SHARPSHOOTER),player(1,SHARPSHOOTER),1616,definitions),source=battle.units[0],slot=source.skills.findIndex(s=>s?.id===BOOMERANG);expect(slot).toBeGreaterThanOrEqual(0);expect(queueSpellOrder(battle,source,slot,{position:{x:source.x+3,y:source.y}})).toBe(true);expect(battle.tickCount).toBe(0);expect(battle.events.some(e=>e.status==='castWindup'&&e.skill===BOOMERANG)).toBe(false);
  expectContinuation(battle,restoredPair(battle));expect(battle.events.filter(e=>e.type==='cast'&&e.skill===BOOMERANG)).toHaveLength(1);
 });
 it('C16-REPLAY02 a real unit order replaces an actually begun Boomerang point windup and both restores release only the replacement',()=>{
  const battle=createBattle(player(0,SHARPSHOOTER),player(1,SHARPSHOOTER),1616,definitions),source=battle.units[0],target=battle.units.find(u=>u.side===1)!,slot=source.skills.findIndex(s=>s?.id===BOOMERANG);expect(queueSpellOrder(battle,source,slot,{position:{x:source.x+3,y:source.y}})).toBe(true);
  for(let n=0;n<20&&!battle.events.some(e=>e.status==='castWindup'&&e.skill===BOOMERANG);n++)stepBattle(battle,1/30,definitions);expect(battle.events.filter(e=>e.status==='castWindup'&&e.skill===BOOMERANG)).toHaveLength(1);expect(battle.events.some(e=>e.type==='cast'&&e.skill===BOOMERANG)).toBe(false);
  expect(queueSpellOrder(battle,source,slot,{targetId:target.id})).toBe(true);stepBattle(battle,1/30,definitions);expect(battle.events.some(e=>e.type==='cast'&&e.skill===BOOMERANG)).toBe(false);expectContinuation(battle,restoredPair(battle));expect(battle.events.filter(e=>e.type==='cast'&&e.skill===BOOMERANG)).toHaveLength(1);expect(battle.events.filter(e=>e.status==='castWindup'&&e.skill===BOOMERANG)).toHaveLength(2);expect(battle.events.find(e=>e.type==='cast'&&e.skill===BOOMERANG)?.target).toBe(target.id);
 });
 it('C16-REPLAY03 actual Jingu profession clone attributes and presentation state rebuild and advance identically through both restore paths',()=>{
  const battle=createBattle(player(0,JINGU),player(1,JINGU),1616,definitions);stepBattle(battle,2.1,definitions);const source=battle.units[0],clone=battle.units.find(u=>u.extraJinguSoldier)!;expect(clone).toBeDefined();expect(clone.heroClone).toBe(true);expect(clone.illusion).toBe(false);expect(clone.role).toBe(source.role);expect([clone.strength,clone.agility,clone.intelligence]).toEqual([source.strength,source.agility,source.intelligence]);expect(clone.intelligence).toBeGreaterThan(0);expectContinuation(battle,restoredPair(battle));
 });
});

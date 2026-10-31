import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {newGame,startRound,getBattlePlayers,buySkill,moveSkill} from '../src/game';
import {createBattle,stepBattle,FIXED_STEP} from '../src/combat';
import {createReplayFile,parseReplayFile,beginReplay,seekReplay,verifyReplay,MAX_REPLAY_BYTES} from '../src/replay';
import type {SkillDefinition} from '../src/model';
const defs=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
function setup(){const game=newGame(314159,1,defs);buySkill(game,0,0);moveSkill(game,0,{reserve:0},{hero:0,slot:0});expect(startRound(game,defs)).toBeNull();const [a,b]=game.pairs.find(pair=>pair.includes(0))!,players=getBattlePlayers(game);return{game,battle:createBattle(players[a],players[b],game.battleSeed,defs,undefined,game.round)};}
describe('portable battle replay',()=>{
 it('exports immutable initial inputs and replays the exact units, RNG, events and result without the game state',()=>{
  const {game,battle}=setup();for(let i=0;i<210&&!battle.finished;i++)stepBattle(battle,FIXED_STEP,defs);
  const file=createReplayFile(battle,defs),raw=JSON.stringify(file),saved=JSON.stringify(game),parsed=parseReplayFile(raw,defs),restored=beginReplay(parsed,defs);
  for(let i=0;i<parsed.targetTick&&!restored.finished;i++)stepBattle(restored,FIXED_STEP,defs);
  expect(restored.units).toEqual(battle.units);expect(restored.events).toEqual(battle.events);expect(restored.rng).toBe(battle.rng);expect(verifyReplay(parsed,restored)).toBe(true);expect(JSON.stringify(game)).toBe(saved);
  battle.units[0].hp=1;game.players[0].heroes[0].skills.fill(null);expect(JSON.stringify(file)).toBe(raw);
 });
 it('seeks backward and forward in cancellable fixed ticks, and detects altered results',async()=>{
  const {battle}=setup();stepBattle(battle,5,defs);const file=createReplayFile(battle,defs);
  const early=await seekReplay(file,30,defs);expect(early!.tickCount).toBe(30);expect(early!.time).toBe(1);
  const final=await seekReplay(file,file.targetTick,defs);expect(verifyReplay(file,final!)).toBe(true);final!.rng^=1;expect(verifyReplay(file,final!)).toBe(false);
  expect(await seekReplay(file,file.targetTick,defs,()=>true)).toBeNull();
 });
 it('rejects malformed snapshots and incompatible versions before running any mechanics',()=>{
  const {battle}=setup(),file=createReplayFile(battle,defs),parse=(value:unknown)=>parseReplayFile(JSON.stringify(value),defs);
  expect(()=>parse({...file,targetTick:1e9})).toThrow('无效');expect(()=>parse({...file,release:'<script>'})).toThrow('无效');
  expect(()=>parse({...file,initial:{...file.initial,a:{...file.initial.a,heroes:[{...file.initial.a.heroes[0],x:1e9}]}}})).toThrow('无效');
  expect(()=>parse({...file,simulationRevision:'old'})).toThrow(file.release);
  expect(()=>parse({...file,spellOrders:[{tick:1,slot:0,skillId:'x',unitId:'x',kind:'point',position:{x:Infinity,y:0}}]})).toThrow();
  expect(()=>parseReplayFile(' '.repeat(MAX_REPLAY_BYTES+1),defs)).toThrow('2 MB');expect(()=>parseReplayFile('{',defs)).toThrow('无效');
 });
 it('reproduces a completed fight with a ghost side and verifies its final statistics',()=>{
  const {battle}=setup();battle.ghostSide=(battle.initial as {b:{id:number}}).b.id;while(!battle.finished)stepBattle(battle,1,defs);
  const file=parseReplayFile(JSON.stringify(createReplayFile(battle,defs)),defs),restored=beginReplay(file,defs);while(!restored.finished)stepBattle(restored,1,defs);
  expect(verifyReplay(file,restored)).toBe(true);expect(restored.ghostSide).toBe(battle.ghostSide);expect(file.expected.finished).toBe(true);
 });
});

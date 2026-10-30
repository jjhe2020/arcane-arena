import {describe,it,expect} from 'vitest';
import {setImmediate as yieldToWorker} from 'node:timers/promises';
import data from '../public/data/skills.json';
import {newGame,startRound,getBattlePlayers,finishRound,prepareRound,roundDamage,validateGame,serializeGame,restoreGame,buySkill,rerollShop} from '../src/game';
import {simulateBattle,battleStats} from '../src/combat';
import type {SkillDefinition,RoundReport} from '../src/model';
const defs=data as SkillDefinition[];
describe('整局联动',()=>{
 it.each([1,1.5,2])('%d倍AI：真实战斗推动8方直到唯一冠军',async difficulty=>{
  const game=newGame(298734,difficulty,defs);let rounds=0;
  while(game.phase!=='finished'&&rounds++<100){
   if(game.phase==='result')expect(prepareRound(game,defs)).toBeNull();
   // A deterministic human purchase script exercises the same public shop API.
   if(game.players[0].hp>0){for(let guard=0;guard<15&&game.players[0].gold>=3;guard++){const item=game.players[0].shop.findIndex(Boolean);if(item<0||buySkill(game,0,item)){if(rerollShop(game,0))break;}}}
   expect(startRound(game,defs)).toBeNull();const snapshot=getBattlePlayers(game);
   const reports:RoundReport[]=game.pairs.map(([a,b],i)=>{const battle=simulateBattle(snapshot[a],snapshot[b],game.battleSeed+i,defs);const survivors=battle.units.filter(u=>!u.dead&&!u.summoned&&u.side===battle.winner).length;return{round:game.round,a,b,winner:battle.winner,damage:roundDamage(game.round,survivors),duration:battle.time,survivors,stats:battleStats(battle)};});
   expect(finishRound(game,reports)).toBeNull();expect(validateGame(game,defs)).toBeNull();
   const saved=serializeGame(game);expect(restoreGame(saved,defs)).toEqual(game);
   // CPU-only rounds can otherwise starve Vitest's worker RPC for an entire
   // tournament file. Yield between rounds; no simulation dt/input changes.
   await yieldToWorker();
  }
  expect(game.phase).toBe('finished');expect(game.winner).toBeDefined();expect(game.players.filter(p=>p.hp>0).length).toBeLessThanOrEqual(1);expect(rounds).toBeGreaterThan(9);
 },30000);
});

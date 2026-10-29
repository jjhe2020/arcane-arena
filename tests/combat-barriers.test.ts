import { describe,expect,it } from 'vitest';
import { createBattle,stepBattle } from '../src/combat';
import { addBarrier,barriers,barrierBlocksUnit } from '../src/combat/barriers';
import type { Player } from '../src/model';
const player=(id:number):Player=>({id,name:String(id),hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'unit',role:'tank',skin:'male',x:0,y:-8,skills:[]}]});
describe('deterministic impassable barriers',()=>{
  it('distinguishes free terrain traversal, flying and unit-only phasing by barrier source',()=>{
    const b=createBattle(player(0),player(1),1,[]),u=b.units[0];
    addBarrier(b,u,'custom_tusk_ice_shards',{x:-3,y:0},{x:3,y:0},1,30);addBarrier(b,u,'mars_arena_of_blood',{x:-3,y:1},{x:3,y:1},1,30);addBarrier(b,u,'unknown_barrier',{x:-3,y:2},{x:3,y:2},1,30);
    u.statuses=[{kind:'phased',until:30}];expect(barriers(b).map(w=>barrierBlocksUnit(u,w))).toEqual([true,true,true]);
    u.statuses=[{kind:'freePathing',until:30}];expect(barriers(b).map(w=>barrierBlocksUnit(u,w))).toEqual([false,true,true]);
    u.statuses=[{kind:'flying',until:30}];expect(barriers(b).map(w=>barrierBlocksUnit(u,w))).toEqual([false,false,true]);
  });
  it('routes around finite wall endpoints and never walks through the wall capsule',()=>{
    const b=createBattle(player(0),player(1),1,[]),[u,target]=b.units;target.statuses.push({kind:'stun',until:100});u.statuses.push({kind:'disarm',until:100});
    addBarrier(b,u,'test_wall',{x:-3,y:0},{x:3,y:0},1,30);let farthestX=0;
    for(let i=0;i<240;i++){stepBattle(b,1/30,[]);farthestX=Math.max(farthestX,Math.abs(u.x));const gap=Math.abs(u.x)<=3?Math.abs(u.y):Math.hypot(Math.abs(u.x)-3,u.y);expect(gap).toBeGreaterThanOrEqual(.8999);}
    expect(farthestX).toBeGreaterThan(3.8);expect(u.y).toBeGreaterThan(3);
  });
  it('keeps unit phasing distinct from crossing ability walls and expires walls in simulation time',()=>{
    const b=createBattle(player(0),player(1),1,[]),u=b.units[0];u.y=-2;u.statuses.push({kind:'phased',until:10},{kind:'disarm',until:10});b.units[1].statuses.push({kind:'stun',until:10});
    addBarrier(b,u,'ice_shards',{x:-3,y:0},{x:3,y:0},1,2,{group:'wall-group',centerX:0,centerY:0,angle:0});
    const saved=JSON.parse(JSON.stringify(b.barriers));expect(saved[0]).toMatchObject({createdAt:0,visual:{group:'wall-group',centerX:0,centerY:0,angle:0}});
    stepBattle(b,1.5,[]);expect(u.y).toBeLessThan(0);expect(Math.abs(u.x)).toBeGreaterThan(0);expect(barriers(b)).toHaveLength(1);
    stepBattle(b,.5,[]);expect(barriers(b)).toHaveLength(0);stepBattle(b,2,[]);expect(u.y).toBeGreaterThan(1);
  });
  it('resolves a wall forming under a body continuously instead of teleporting it',()=>{
    const b=createBattle(player(0),player(1),1,[]),[u,phased]=b.units;u.y=0;phased.y=0;phased.x=1;phased.statuses.push({kind:'phased',until:10});
    addBarrier(b,u,'fissure',{x:-3,y:0},{x:3,y:0},1,5);
    expect(u.y).toBe(0);expect(phased.y).toBe(0);
    u.statuses.push({kind:'stun',until:10});phased.statuses.push({kind:'stun',until:10});
    let previous={x:u.x,y:u.y};for(let i=0;i<15;i++){stepBattle(b,1/30,[]);expect(Math.hypot(u.x-previous.x,u.y-previous.y)).toBeLessThanOrEqual(u.moveSpeed/30+1e-8);previous={x:u.x,y:u.y};}
    expect(Math.abs(u.y)).toBeGreaterThanOrEqual(.8999);expect(Math.abs(phased.y)).toBeGreaterThanOrEqual(.8999);expect(u.warpSequence).toBe(0);
  });
});

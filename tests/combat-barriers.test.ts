import { describe,expect,it } from 'vitest';
import { createBattle,stepBattle } from '../src/combat';
import { addBarrier,barriers } from '../src/combat/barriers';
import type { Player } from '../src/model';
const player=(id:number):Player=>({id,name:String(id),hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'unit',role:'tank',skin:'male',x:0,y:-8,skills:[]}]});
describe('deterministic impassable barriers',()=>{
  it('routes around finite wall endpoints and never walks through the wall capsule',()=>{
    const b=createBattle(player(0),player(1),1,[]),[u,target]=b.units;target.statuses.push({kind:'stun',until:100});u.statuses.push({kind:'disarm',until:100});
    addBarrier(b,u,'test_wall',{x:-3,y:0},{x:3,y:0},1,30);let farthestX=0;
    for(let i=0;i<240;i++){stepBattle(b,1/30,[]);farthestX=Math.max(farthestX,Math.abs(u.x));const gap=Math.abs(u.x)<=3?Math.abs(u.y):Math.hypot(Math.abs(u.x)-3,u.y);expect(gap).toBeGreaterThanOrEqual(.8999);}
    expect(farthestX).toBeGreaterThan(3.8);expect(u.y).toBeGreaterThan(3);
  });
  it('lets phased travel cross and expires walls in simulation time',()=>{
    const b=createBattle(player(0),player(1),1,[]),u=b.units[0];u.y=-2;u.statuses.push({kind:'phased',until:10},{kind:'disarm',until:10});b.units[1].statuses.push({kind:'stun',until:10});
    addBarrier(b,u,'ice_shards',{x:-3,y:0},{x:3,y:0},1,2,{group:'wall-group',centerX:0,centerY:0,angle:0});
    const saved=JSON.parse(JSON.stringify(b.barriers));expect(saved[0]).toMatchObject({createdAt:0,visual:{group:'wall-group',centerX:0,centerY:0,angle:0}});
    stepBattle(b,1.5,[]);expect(u.y).toBeGreaterThan(1);expect(u.x).toBe(0);expect(barriers(b)).toHaveLength(1);
    stepBattle(b,.5,[]);expect(barriers(b)).toHaveLength(0);
  });
  it('pushes a body away when a wall forms through it while leaving phased bodies untouched',()=>{
    const b=createBattle(player(0),player(1),1,[]),[u,phased]=b.units;u.y=0;phased.y=0;phased.x=1;phased.statuses.push({kind:'phased',until:10});
    addBarrier(b,u,'fissure',{x:-3,y:0},{x:3,y:0},1,5);
    expect(Math.abs(u.y)).toBeGreaterThan(.9);expect(phased.y).toBe(0);
  });
});

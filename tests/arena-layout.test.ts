import {describe,expect,it} from 'vitest';
import {ARENA_HEIGHT,ARENA_SCALE,ARENA_WIDTH,BATTLE_BOUNDS,FORMATION_BOUNDS,clampFormationPoint} from '../src/arena-layout';
import {BATTLE_CONFIG} from '../src/config';
import {createBattle,stepBattle} from '../src/combat';
import {addBarrier,barriers,constrainBarrierMotion} from '../src/combat/barriers';
import {newGame,restoreGame,serializeGame} from '../src/game';
import {ROLES,type Player,type SkillDefinition} from '../src/model';

const definitions:SkillDefinition[]=[{id:'arena_fixture',name:'测试',nameEn:'Test',tags:[],categories:[],description:'',descriptionEn:'',super:'',gaben:'',values:[],cooldowns:[],mana:[],icon:'',passive:true,ultimate:false}];
function player(id:number):Player{return {id,name:`p${id}`,hp:100,gold:0,shopLevel:1,reserve:Array(4).fill(null),shop:Array(12).fill(null),locked:false,heroes:[{id:`h${id}`,name:`hero${id}`,role:'tank',skin:'male',x:0,y:-4,skills:Array(4).fill(null)}]};}

describe('shared smaller arena geometry',()=>{
  it('fits the arena to 80 percent while preserving the requested ranged attack distances',()=>{
    expect(ARENA_SCALE).toBe(.8);
    expect(ARENA_WIDTH).toBeCloseTo(29.142857*.8,8);
    expect(ARENA_HEIGHT).toBeCloseTo(25.833333*.8,8);
    expect(BATTLE_BOUNDS.x*2).toBe(ARENA_WIDTH);
    expect(BATTLE_BOUNDS.y*2).toBe(ARENA_HEIGHT);
    expect(ROLES.archer.range).toBe(7);
    expect(ROLES.mage.range).toBe(5.5);
  });
  it('keeps every permitted formation edge unchanged when the battle spawns, including the mirrored player',()=>{
    const a=player(4),b=player(2);
    for(const position of [clampFormationPoint(-100,-100),clampFormationPoint(100,-100),clampFormationPoint(100,100)]){
      Object.assign(a.heroes[0],position);Object.assign(b.heroes[0],position);
      const battle=createBattle(a,b,41,[]),[bottom,top]=battle.units;
      expect({x:bottom.x,y:bottom.y}).toEqual(position);
      expect({x:top.x,y:top.y}).toEqual({x:-position.x,y:-position.y});
      expect(a.heroes[0].x).toBe(position.x);expect(b.heroes[0].y).toBe(position.y);
    }
  });
  it('scales default formations and rejects saved formations outside the new battlefield',()=>{
    const state=newGame(17,1,definitions);
    expect(state.players[0].heroes[0]).toMatchObject({x:-8*.8,y:-4*.8});
    for(const p of state.players)for(const hero of p.heroes){expect(Math.abs(hero.x)).toBeLessThanOrEqual(FORMATION_BOUNDS.x);expect(hero.y).toBeGreaterThanOrEqual(FORMATION_BOUNDS.minY);expect(hero.y).toBeLessThanOrEqual(0);}
    expect(restoreGame(serializeGame(state),definitions)).not.toBeNull();
    state.players[0].heroes[0].x=BATTLE_BOUNDS.x+.01;
    expect(restoreGame(JSON.stringify(state),definitions)).toBeNull();
  });
  it('uses the same body inset for battle movement, wall placement and barrier-free motion',()=>{
    const a=player(0),b=player(1);a.heroes[0].x=-100;a.heroes[0].y=-100;b.heroes[0].x=-100;b.heroes[0].y=-100;
    const battle=createBattle(a,b,71,[]),[bottom,top]=battle.units,inside={x:BATTLE_BOUNDS.x-BATTLE_CONFIG.bodyRadius,y:BATTLE_BOUNDS.y-BATTLE_CONFIG.bodyRadius};
    expect(bottom.x).toBeCloseTo(-inside.x);expect(bottom.y).toBeCloseTo(-inside.y);
    expect(top.x).toBeCloseTo(inside.x);expect(top.y).toBeCloseTo(inside.y);
    expect(constrainBarrierMotion(battle,bottom,{x:100,y:100})).toEqual(inside);
    addBarrier(battle,bottom,'custom_earthshaker_fissure',{x:-100,y:-100},{x:100,y:100},.4,5);
    expect(barriers(battle)[0].from).toEqual({x:-inside.x,y:-inside.y});expect(barriers(battle)[0].to).toEqual(inside);
    stepBattle(battle,3,[]);
    for(const u of battle.units){expect(Math.abs(u.x)).toBeLessThanOrEqual(inside.x+1e-8);expect(Math.abs(u.y)).toBeLessThanOrEqual(inside.y+1e-8);}
  });
});

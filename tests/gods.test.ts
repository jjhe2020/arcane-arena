import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,physicalDamageMultiplier,stepBattle} from '../src/combat';
import {buySkill,finishRound,lockShop,newGame,rerollShop,sellSkill,setGodTarget,shopOfferCount,shopOfferPoints,shopRerollCost,shopUpgradeCost,startRound,upgradeShop,validateGame} from '../src/game';
import {GOD_IDS,GOD_OPENING_ROLE,GOD_SKILLS,godTarget} from '../src/gods';
import type {GameState,Player,RoundReport,SkillDefinition,SkillStack} from '../src/model';
import {createReplayFile,parseReplayFile,seekReplay,verifyReplay} from '../src/replay';

function definition(id:string,options:Partial<SkillDefinition>={}):SkillDefinition {
  return {id,name:id,nameEn:id,description:'',descriptionEn:'',tags:[],categories:[],super:'',gaben:'',values:[],cooldowns:[25],mana:[0],icon:'',passive:false,ultimate:false,...options};
}
const defs=Array.from({length:32},(_,index)=>definition(`god_test_${index}`,{ultimate:index>=24}));
const missile=definition('custom_vengefulspirit_magic_missile',{values:['DAMAGE: 90 / 180 / 360','STUN DURATION: 1.4 / 1.5 / 1.7'],mana:[50]});
const treants=definition('custom_furion_force_of_nature',{values:['TREANT COUNT: 2 / 3 / 5','TREANT HEALTH: 550','TREANT DAMAGE: 18 / 26 / 42','TREANT DURATION: 4']});
const reports=(state:GameState):RoundReport[]=>state.pairs.map(([a,b])=>({round:state.round,a,b,winner:a,damage:1,duration:2,survivors:1,stats:[]}));
const advance=(battle:ReturnType<typeof createBattle>,seconds:number,skills:SkillDefinition[])=>{
  for(let tick=0;tick<Math.round(seconds/FIXED_STEP);tick++)stepBattle(battle,FIXED_STEP,skills);
};
function player(id:number,skills:SkillStack[]=[]):Player {
  return {id,name:`P${id}`,hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:`p${id}-h0`,name:`H${id}`,role:'mage',skin:'female',x:0,y:-1,skills}]};
}

describe('god selection and shared skill inventory',()=>{
  it('gives every opponent an independent, reproducible god selection',()=>{
    const first=newGame(753,1,defs,'centaur'),second=newGame(753,1,defs,'centaur');
    expect(first.players[0].god?.id).toBe('centaur');
    expect(first.players.map(p=>p.god)).toEqual(second.players.map(p=>p.god));
    expect(new Set(first.players.slice(1).map(p=>p.god?.id)).size).toBeGreaterThan(2);
    const opponents=GOD_IDS.flatMap((id,seed)=>newGame(seed+1,1,defs,id).players.slice(1));
    const seen=new Set(opponents.map(p=>p.god?.id));
    expect([...seen].sort()).toEqual([...GOD_IDS].sort());
    for(const p of opponents){const openingRole=GOD_OPENING_ROLE[p.god!.id];if(openingRole)expect(p.heroes[0].role).toBe(openingRole);}
    expect(validateGame(first,defs)).toBeNull();
  });

  it('adds Boneless shop slots and discounts while filtering every ultimate',()=>{
    const game=newGame(21,1,defs,'bonelessAghanim'),p=game.players[0];
    expect(shopUpgradeCost(game,0)).toBe(8);
    p.gold=100;
    for(let level=2;level<=5;level++)expect(upgradeShop(game,0)).toBeNull();
    expect(shopOfferCount(p.shopLevel,p.god?.id)).toBe(11);
    expect(rerollShop(game,0)).toBeNull();
    expect(p.shop.filter(Boolean)).toHaveLength(11);
    expect(p.shop.every(id=>id===null||!defs.find(d=>d.id===id)?.ultimate)).toBe(true);
    expect(validateGame(game,defs)).toBeNull();
  });

  it('reserves both Vacation copies across a locked shop and spends four gold on purchase',()=>{
    const game=Array.from({length:32},(_,seed)=>newGame(seed+1,1,defs,'vacationAghanim')).find(game=>game.players[0].god?.doubleSlots?.length)!;
    const p=game.players[0],slot=p.god!.doubleSlots![0],id=p.shop[slot];
    expect(lockShop(game,0,true)).toBeNull();
    expect(startRound(game,defs)).toBeNull();
    expect(p.shop[slot]).toBe(id);
    expect(shopOfferPoints(p,slot)).toBe(2);
    expect(validateGame(game,defs)).toBeNull();
    const gold=p.gold;
    expect(buySkill(game,0,slot)).toBeNull();
    expect(p.gold).toBe(gold-4);
    expect(p.reserve[0]).toMatchObject({id,points:2});
    expect(shopOfferPoints(p,slot)).toBe(1);
    expect(validateGame(game,defs)).toBeNull();
  });

  it('resets Sideshop Man’s free reroll each round and returns full sale value',()=>{
    const game=newGame(97,1,defs,'sideshopMan'),p=game.players[0],income=p.gold;
    expect(rerollShop(game,0)).toBeNull();
    expect(p.gold).toBe(income);
    expect(shopRerollCost(p)).toBe(1);
    expect(buySkill(game,0,0)).toBeNull();
    expect(sellSkill(game,0,{reserve:0})).toBeNull();
    expect(p.gold).toBe(income);
    expect(startRound(game,defs)).toBeNull();
    expect(shopRerollCost(p)).toBe(0);
    expect(validateGame(game,defs)).toBeNull();
  });

  it('conserves shared inventory when Aghanim upgrades a reserve stack at settlement',()=>{
    const game=newGame(73,1,defs,'aghanim'),p=game.players[0];
    expect(buySkill(game,0,0)).toBeNull();
    expect(startRound(game,defs)).toBeNull();
    game.rng=1;
    expect(finishRound(game,reports(game))).toBeNull();
    expect(p.reserve[0]?.points).toBe(2);
    expect(p.god?.lastUpgraded).toBe(p.reserve[0]?.id);
    expect(validateGame(game,defs)).toBeNull();
  });

  it('freezes Legion’s selected hero and accumulated attack for the battle',()=>{
    const game=newGame(73,1,defs,'legionCommander'),p=game.players[0];
    expect(setGodTarget(game,0,0)).toBeNull();
    expect(startRound(game,defs)).toBeNull();
    expect(p.god?.legionAttack).toBe(4);
    expect(game.battlePlayers[0].god?.legionAttack).toBe(4);
    expect(godTarget(game.battlePlayers[0])?.id).toBe(p.heroes[0].id);
    const baseline=createBattle(player(2),player(3),4,defs).units[0];
    const legion=player(2);legion.god={id:'legionCommander',legionAttack:4};
    expect(createBattle(legion,player(3),4,defs).units[0].attack).toBe(baseline.attack+4);
  });
});

describe('god effects in combat',()=>{
  it('reruns temporary Bathtime thresholds from the original loadout when replayed',async()=>{
    const a=player(0,[{id:defs[0].id,points:1},{id:defs[1].id,points:5},{id:defs[2].id,points:8}]);
    a.god={id:'bathtimeAghanim'};a.shopLevel=5;
    const battle=createBattle(a,player(1),88,defs,undefined,7);
    expect(a.heroes[0].skills.map(s=>s?.points)).toEqual([1,5,8]);
    expect(battle.units[0].skills.map(s=>s?.points)).toEqual([3,6,9]);
    expect(battle.units[0].skills[1]?.superRound).toBe(7);
    advance(battle,2,defs);
    const file=parseReplayFile(JSON.stringify(createReplayFile(battle,defs)),defs);
    const restored=await seekReplay(file,file.targetTick,defs);
    expect(restored&&verifyReplay(file,restored)).toBe(true);
  });

  it('adds Centaur health to the selected hero and attributes retaliated physical damage',()=>{
    const a=player(0),b=player(1);a.god={id:'centaur',targetHeroId:'p0-h0'};
    const base=createBattle(player(0),b,8,[],undefined,4).units[0];
    const battle=createBattle(a,b,8,[],undefined,4),[tank,attacker]=battle.units;
    expect(tank.maxHp).toBe(base.maxHp+280);
    const hit=applyDamage(battle,attacker,tank,100,'physical');
    expect(attacker.maxHp-attacker.hp).toBeCloseTo(hit*.35*physicalDamageMultiplier(attacker.armor));
    expect(tank.abilityStats?.some(stats=>stats.abilityId===GOD_SKILLS.centaur&&stats.damage>0)).toBe(true);
  });

  it('gives Selemene’s whole team amplification for an actual paid cast',()=>{
    const a=player(0,[{id:missile.id,points:3}]),b=player(1);a.god={id:'selemene'};
    a.heroes.push({...a.heroes[0],id:'p0-h1',skills:[],x:3});
    const battle=createBattle(a,b,1,[missile]);advance(battle,2,[missile]);
    expect(battle.events.some(event=>event.type==='cast'&&event.skill===missile.id)).toBe(true);
    expect(battle.units[0].godSpellAmp).toBeCloseTo(.0075);
    expect(battle.units[1].godSpellAmp).toBeCloseTo(.0075);
    expect(battle.units[2].godSpellAmp).toBeUndefined();
  });

  it('releases Ogre’s second cast without paying another mana cost',()=>{
    const a=player(0,[{id:missile.id,points:3}]);a.god={id:'ogreMagi'};
    const battle=createBattle(a,player(1),1,[missile]);
    advance(battle,2,[missile]);
    const casts=battle.events.filter(event=>event.type==='cast'&&event.skill===missile.id);
    expect(casts).toHaveLength(2);
    expect(casts[1].duplicatedBy).toBe(GOD_SKILLS.ogreMagi);
    expect(battle.units[0].maxMana-battle.units[0].mana).toBeLessThan(60);
  });

  it('counts Phantom Assassin travel and gives Kanna attack speed for real summons',()=>{
    const pa=player(0);pa.god={id:'phantomAssassin'};pa.heroes[0].role='assassin';pa.heroes[0].y=-6;
    const movement=createBattle(pa,player(1),1,[]);advance(movement,2,[]);
    expect(movement.units[0].godTravel).toBeGreaterThan(1);
    const kanna=player(0,[{id:treants.id,points:1}]);kanna.god={id:'kanna'};
    const battle=createBattle(kanna,player(1),1,[treants]);advance(battle,2,[treants]);
    const summons=battle.units.filter(unit=>unit.summoned);
    expect(summons.length).toBeGreaterThan(0);
    expect(battle.units[0].godSummonAttackSpeed).toBe(summons.length*5);
    expect(summons.every(unit=>unit.godSummonAttackSpeed===summons.length*5)).toBe(true);
  });
});

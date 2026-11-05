import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {ATTRIBUTE_CONFIG,BATTLE_CONFIG} from '../src/config';
import {createBattle,getCombatStats,getSkillRange,isRangedAttackType,stepBattle} from '../src/combat';
import {chooseHeroEnchantment,changeRole,finishRound,getBattlePlayers,newGame,prepareRound,redrawHeroEnchantment,restoreGame,serializeGame,startRound} from '../src/game';
import {ENCHANTMENTS,ENCHANTMENT_GRADES,ENCHANTMENT_STATS,enchantmentCoefficient,enchantmentEntries,getEnchantment,redrawEnchantments} from '../src/hero-enchantments';
import {heroStatsAtLevel} from '../src/hero-progression';
import type {Player,SkillDefinition} from '../src/model';

const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const acid='custom_alchemist_acid_spray';
const player=(id:number,enchantmentId?:string,skillId?:string):Player=>({id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:[{id:'hero',name:'H',role:'tank',skin:'male',x:0,y:-2,enchantmentId,skills:skillId?[{id:skillId,points:3}]:[]}]});

describe('hero enchantments',()=>{
  it('keeps every catalog entry in its tier and each signed coefficient total in range',()=>{
    for (const enchantment of ENCHANTMENTS) {
      const effects=enchantmentEntries(enchantment.effects);
      const top=ENCHANTMENT_GRADES.indexOf(enchantment.grade);
      expect(Math.max(...effects.map(([stat])=>ENCHANTMENT_GRADES.indexOf(ENCHANTMENT_STATS[stat].grade))),enchantment.id).toBe(top);
      expect(effects.some(([stat,amount])=>ENCHANTMENT_STATS[stat].grade===enchantment.grade&&enchantmentCoefficient(stat,amount)>0),enchantment.id).toBe(true);
      for (const [stat,amount] of effects) {
        if (ENCHANTMENT_STATS[stat].grade===enchantment.grade&&enchantment.grade!=='D'&&stat!=='moveSpeed') expect(enchantmentCoefficient(stat,amount),enchantment.id).toBeGreaterThan(0);
      }
      const score=effects.reduce((sum,[stat,amount])=>sum+enchantmentCoefficient(stat,amount),0);
      expect(score,enchantment.id).toBeGreaterThanOrEqual(10);
      expect(score,enchantment.id).toBeLessThanOrEqual(20);
    }
  });

  it('can roll four distinct candidates of the same grade and uses a separate grade draw for every slot',()=>{
    const sameGrade=redrawEnchantments('granite',()=>0);
    expect(sameGrade.options).toHaveLength(4);
    expect(new Set(sameGrade.options).size).toBe(4);
    expect(sameGrade.options).not.toContain('granite');
    expect(sameGrade.options.map(id=>getEnchantment(id)?.grade)).toEqual(['D','D','D','D']);
    for (let start=0;start<5;start++) {
      const random=Array.from({length:4},(_,index)=>[((start+index)%5+.5)/5,0]).flat();
      expect(redrawEnchantments('eagle-eye',()=>random.shift()!).options.map(id=>getEnchantment(id)?.grade)).toEqual(Array.from({length:4},(_,index)=>ENCHANTMENT_GRADES[(start+index)%5]));
    }
  });

  it('offers three unique grades for each of the five arrivals and assigns valid AI enchantments',()=>{
    const game=newGame(12,1,definitions);
    const seen=new Set<string>();
    for(let round=1;round<=9;round++) {
      for(const hero of game.players[0].heroes) {
        if(seen.has(hero.id)) continue;
        seen.add(hero.id);
        expect(hero.enchantmentChoice?.mode).toBe('arrival');
        expect(new Set(hero.enchantmentChoice?.options.map(id=>getEnchantment(id)?.grade)).size).toBe(3);
        expect(hero.enchantmentChoice?.options).toContain(hero.enchantmentId);
      }
      expect(game.players.slice(1).every(p=>p.heroes.every(hero=>getEnchantment(hero.enchantmentId)&&!hero.enchantmentChoice))).toBe(true);
      expect(startRound(game,definitions)).toBeNull();
      expect(getBattlePlayers(game).every(p=>p.heroes.every(hero=>getEnchantment(hero.enchantmentId)&&!hero.enchantmentChoice))).toBe(true);
      expect(finishRound(game,game.pairs.map(([a,b])=>({round,a,b,winner:null,damage:1,duration:4,survivors:0,stats:[]})))).toBeNull();
      expect(prepareRound(game,definitions)).toBeNull();
    }
    expect(seen.size).toBe(5);
  });

  it('locks a purchased redraw across save restore and leaves the battle snapshot and shop RNG untouched',()=>{
    const game=newGame(27,1,definitions),own=game.players[0],hero=own.heroes[0];
    const initial=hero.enchantmentId!;
    expect(chooseHeroEnchantment(game,0,0,initial)).toBeNull();
    expect(startRound(game,definitions)).toBeNull();
    const gold=own.gold,shopRng=game.rng;
    expect(redrawHeroEnchantment(game,0,0)).toBeNull();
    expect(own.gold).toBe(gold-2);
    expect(game.rng).toBe(shopRng);
    expect(redrawHeroEnchantment(game,0,0)).toBeTruthy();
    expect(own.gold).toBe(gold-2);
    const restored=restoreGame(serializeGame(game),definitions)!;
    expect(restored.players[0].heroes[0].enchantmentChoice).toEqual(hero.enchantmentChoice);
    expect(chooseHeroEnchantment(restored,0,0,initial)).toBeTruthy();
    expect(finishRound(restored,restored.pairs.map(([a,b])=>({round:1,a,b,winner:null,damage:1,duration:4,survivors:0,stats:[]})))).toBeNull();
    expect(prepareRound(restored,definitions)).toBeNull();
    expect(startRound(restored,definitions)).toBeTruthy();
    const choice=hero.enchantmentChoice!.options[0];
    expect(chooseHeroEnchantment(restored,0,0,choice)).toBeNull();
    expect(chooseHeroEnchantment(game,0,0,choice)).toBeNull();
    expect(changeRole(game,0,0,'mage')).toBeNull();
    hero.skin='female';
    expect(hero.enchantmentId).toBe(choice);
    expect(getBattlePlayers(game)[0].heroes[0].enchantmentId).toBe(initial);
  });

  it('applies base and growth stats at the correct level and preserves melee attack classification',()=>{
    const base=heroStatsAtLevel('tank',5),b=heroStatsAtLevel('tank',5,'ironroot');
    expect(b.strength-base.strength).toBeCloseTo(4+4*.8);
    expect(b.hp-base.hp).toBeCloseTo((4+4*.8)*ATTRIBUTE_CONFIG.strengthHp);
    const battle=createBattle(player(0,'eagle-eye'),player(1),7,definitions),unit=battle.units[0];
    expect(getCombatStats(unit).range).toBeCloseTo(base.range+.56);
    expect(isRangedAttackType(unit)).toBe(false);
  });

  it('changes effective cast distance, emitted zone radius, and health/mana restoration in the real battle',()=>{
    const target=player(1),base=createBattle(player(0,undefined,acid),target,7,definitions),far=createBattle(player(0,'starlight',acid),target,7,definitions),wide=createBattle(player(0,'resonance',acid),target,7,definitions);
    expect(getSkillRange(far,far.units[0],far.units[0].skills[0]!)!.range-getSkillRange(base,base.units[0],base.units[0].skills[0]!)!.range).toBeCloseTo(.7);
    stepBattle(base,1,definitions);stepBattle(wide,1,definitions);
    const radius=(battle:typeof base)=>(battle.zones as {radius:number}[])[0].radius;
    expect(radius(wide)).toBeCloseTo(radius(base)*1.14);
    const regen=createBattle(player(0,'spring'),player(1,'incense'),7,definitions);
    const [first,second]=regen.units;
    for (const unit of regen.units) {unit.moveSpeed=0;unit.nextAttack=1000;}
    first.hp-=100;second.mana-=100;
    const hp=first.hp,mana=second.mana;
    stepBattle(regen,1,definitions);
    expect(first.hp-hp).toBeCloseTo(6);
    expect(second.mana-mana).toBeCloseTo(BATTLE_CONFIG.baseManaRegen+1.5);
  });

  it('expands both fixed Sonic Boom areas while keeping Blink movement unchanged',()=>{
    const blink='custom_queenofpain_blink';
    const probe=(enchantmentId?:string)=>{
      const enemy=player(1),template=enemy.heroes[0];
      enemy.heroes.push(...['start-edge','end-edge','outside'].map(id=>({...template,id,skills:[]})));
      const battle=createBattle(player(0,enchantmentId,blink),enemy,7,definitions);
      const [caster,primary,startEdge,endEdge,outside]=battle.units;
      const points=[[0,0],[0,8],[3.2,0],[3.2,7.3],[3.6,0]];
      battle.units.forEach((unit,index)=>{
        [unit.x,unit.y]=points[index];
        unit.nextAttack=1000;
        unit.moveSpeed=0;
      });
      stepBattle(battle,1,definitions);
      const hitIds=new Set(battle.events.filter(event=>event.type==='hit'&&event.skill===blink).map(event=>event.target));
      expect(hitIds.has(primary.id)).toBe(true);
      expect(hitIds.has(outside.id)).toBe(false);
      expect(caster.warpSequence).toBe(1);
      return {x:caster.x,y:caster.y,startHit:hitIds.has(startEdge.id),endHit:hitIds.has(endEdge.id)};
    };
    const base=probe();
    expect(base).toMatchObject({startHit:false,endHit:false});
    expect(probe('resonance')).toEqual({...base,startHit:true,endHit:true});
  });
});

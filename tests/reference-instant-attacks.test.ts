import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createBattle,stepBattle} from '../src/combat';
import type {BattleState,Player,SkillDefinition} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';

const catalog=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const ids={acorn:'hoodwink_acorn_shot',anchor:'tidehunter_anchor_smash',boundless:'custom_monkey_king_boundless_strike',walrus:'custom_tusk_walrus_punch',swash:'pangolier_swashbuckle',jingu:'custom_monkey_king_jingu_mastery'};
function player(side:number,skills:{id:string;points:number}[]=[],count=1):Player{return{id:side,name:`P${side}`,hp:100,gold:0,shopLevel:3,locked:false,reserve:[],shop:[],heroes:Array.from({length:count},(_,i)=>({id:`h${i}`,name:`h${i}`,role:'mage',skin:'female',x:0,y:-2,skills:i?[]:skills}))};}
function setup(id:string,points=3,targets=1,extras:{id:string;points:number}[]=[],fixture=false){
  const defs=fixture?catalog.map(d=>d.id===id?{...d,cooldowns:[100],mana:[0]}:d):catalog;
  const b=createBattle(player(0,[{id,points},...extras]),player(1,[],targets),137,defs);
  for(const u of b.units){u.hp=u.maxHp=100000;u.mana=u.maxMana=100000;u.armor=0;u.moveSpeed=0;u.nextAttack=99999;u.statuses.push({kind:'disarm',until:100});}
  const c=b.units[0];c.x=0;c.y=0;c.facing=Math.PI/2;c.attack=100;c.attackMin=c.attackMax=100;
  if(id===ids.walrus){c.nextAttack=0;c.statuses=c.statuses.filter(s=>s.kind!=='disarm');}
  b.units.slice(1).forEach((u,i)=>{u.x=0;u.y=2+i*2;});
  return{b,c,t:b.units[1],defs,advance:(seconds:number)=>stepBattle(b,seconds,defs)};
}
const hits=(b:BattleState,id:string)=>b.events.filter(e=>e.type==='hit'&&e.skill===id&&(e.amount??0)>0);
const status=(u:BattleState['units'][number],kind:string)=>u.statuses.find(s=>s.kind===kind) as EffectStatus|undefined;
function guaranteedCritical(u:BattleState['units'][number],multiplier:number){u.statuses.push({kind:'critChance',until:100,value:1,skill:'testCrit'},{kind:'critMultiplier',until:100,value:multiplier,skill:'testCrit'});}

describe('Wiki acceptance: selected historical instant attacks',()=>{
  it('Acorn, Anchor and Boundless release only after their historical spell cast points',()=>{
    for(const [id,point] of [[ids.acorn,.2],[ids.anchor,.4],[ids.boundless,.4]] as const){const h=setup(id);h.advance(1/30);const start=h.c.actionStart;h.advance(point-1/30);expect(h.b.events.some(e=>e.type==='cast'&&e.skill===id)).toBe(false);h.advance(2/30);const released=h.b.events.find(e=>e.type==='cast'&&e.skill===id)!;expect(released.time-start).toBeCloseTo(point,6);}
  });
  it('Acorn combines its fixed bonus into one critical attack and lifesteals that same damage',()=>{
    const h=setup(ids.acorn,3,1,[],true);h.c.hp=1000;h.c.statuses.push({kind:'lifesteal',until:100,value:.5});guaranteedCritical(h.c,2);h.advance(.8);
    expect(hits(h.b,ids.acorn).map(e=>e.amount)).toEqual([430]);expect(h.c.hp).toBeCloseTo(1215);
  });
  it('Acorn misses under evasion yet still applies its independent slow without damage or lifesteal',()=>{
    const h=setup(ids.acorn);h.c.hp=1000;h.c.statuses.push({kind:'lifesteal',until:100,value:1},{kind:'blind',until:100,value:1});h.t.statuses.push({kind:'evasion',until:100,value:1});h.advance(.4);
    expect(hits(h.b,ids.acorn)).toHaveLength(0);expect(status(h.t,'slow')?.value).toBe(1);expect(h.c.hp).toBe(1000);
  });
  it('Acorn bounces from the prior impact with delay and can revisit an earlier target',()=>{
    const h=setup(ids.acorn,1,2,[],true);h.c.projectileSpeed=10;h.t.y=2;h.b.units[2].y=4;h.advance(2);
    const list=hits(h.b,ids.acorn);expect(list).toHaveLength(3);expect(list.map(e=>e.target)).toEqual([h.t.id,h.b.units[2].id,h.t.id]);
    // The arena resolves homing impact at body contact (before center arrival).
    for(let i=1;i<list.length;i++){expect(list[i].time-list[i-1].time).toBeGreaterThanOrEqual(.4-1e-8);expect(list[i].time-list[i-1].time).toBeLessThanOrEqual(.5+1/30);}
  });
  it('Acorn Gaben corrosion affects the first successful hit and a missed hit applies no corrosion',()=>{
    const h=setup(ids.acorn,9);h.advance(.5);expect(status(h.t,'armor')?.value).toBe(-10);expect(hits(h.b,ids.acorn)[0].amount).toBeGreaterThan(265);
    const miss=setup(ids.acorn,9);miss.c.statuses.push({kind:'blind',until:100,value:1});miss.advance(.5);expect(status(miss.t,'armor')).toBeUndefined();
  });
  it('Acorn Super final profiles add two bounces and fifty percentage points exactly once',()=>{
    const h=setup(ids.acorn,6,2);h.advance(4);expect(hits(h.b,ids.acorn)).toHaveLength(8);expect(hits(h.b,ids.acorn).every(e=>e.amount===265)).toBe(true);
  });
  it('Anchor has True Strike, applies base attack reduction before damage, and never cleaves',()=>{
    const h=setup(ids.anchor,3,2);h.b.units[2].x=4;h.b.units[2].y=2;h.c.statuses.push({kind:'blind',until:100,value:1},{kind:'cleave',until:100,value:1,data:{radius:20}} as EffectStatus);h.t.statuses.push({kind:'evasion',until:100,value:1});guaranteedCritical(h.c,2);h.advance(.8);
    expect(hits(h.b,ids.anchor).map(e=>e.amount)).toEqual([550]);expect(h.b.units[2].hp).toBe(100000);expect(status(h.t,'baseAttackDamageReduction')?.value).toBe(.6);
    const debuff=h.b.events.findIndex(e=>e.type==='status'&&e.status==='baseAttackDamageReduction'),hit=h.b.events.findIndex(e=>e.type==='hit'&&e.skill===ids.anchor);expect(debuff).toBeLessThan(hit);
  });
  it('Anchor Super reads final bonus and reduction once without adding its upgrades a second time',()=>{
    const h=setup(ids.anchor,6);h.advance(.8);expect(hits(h.b,ids.anchor).map(e=>e.amount)).toEqual([375]);expect(status(h.t,'baseAttackDamageReduction')?.value).toBe(.8);
  });
  it('Anchor Gaben PRD casts remain bounded and independent of active mana and cooldown',()=>{
    const h=setup(ids.anchor,9,1,[],true);h.c.cooldowns[0]=100;h.c.statuses=h.c.statuses.filter(s=>s.kind!=='disarm');h.c.range=2;h.c.attackPoint=0;h.c.attackInterval=.12;h.c.attackBackswing=0;h.c.nextAttack=0;h.advance(4);
    const trials=Object.values(h.c.prdState??{}) as {trials:number;successes:number}[];expect(trials).toHaveLength(1);expect(trials[0].successes).toBeGreaterThan(0);expect(hits(h.b,ids.anchor)).toHaveLength(trials[0].successes);expect(h.c.cooldowns[0]).toBe(100);expect(h.c.mana).toBe(100000);
  });
  it('Anchor reduction changes only the victim main attack damage and leaves its flat bonus intact',()=>{
    const h=setup(ids.anchor,3);h.advance(.7);h.c.cooldowns[0]=100;h.t.statuses=h.t.statuses.filter(s=>!['disarm','stun'].includes(s.kind));h.t.range=2;h.t.attack=100;h.t.attackMin=h.t.attackMax=100;h.t.attackPoint=0;h.t.attackInterval=2;h.t.nextAttack=0;h.t.statuses.push({kind:'attackBonus',until:100,value:50});const before=h.c.hp;h.advance(.3);expect(before-h.c.hp).toBeCloseTo(90);
  });
  it('Boundless selects the strongest critical rather than multiplying critical sources and excludes cleave',()=>{
    const h=setup(ids.boundless,3,2);h.b.units[2].x=4;h.c.statuses.push({kind:'blind',until:100,value:1},{kind:'cleave',until:100,value:1,data:{radius:20}} as EffectStatus);h.t.statuses.push({kind:'evasion',until:100,value:1});guaranteedCritical(h.c,3);h.advance(.8);
    expect(hits(h.b,ids.boundless).map(e=>e.amount)).toEqual([300]);expect(h.b.units[2].hp).toBe(100000);expect(status(h.t,'stun')).toBeDefined();
  });
  it('Boundless consumes one Jingu charge while granting the bonus and lifesteal to every target',()=>{
    const h=setup(ids.boundless,3,2,[{id:ids.jingu,points:3}]);h.c[`${ids.jingu}:charges`]=2;h.c.hp=1000;h.advance(.8);
    expect(hits(h.b,ids.boundless).map(e=>e.amount)).toEqual([450,450]);expect(h.c[`${ids.jingu}:charges`]).toBe(1);expect(h.c.hp).toBeCloseTo(1630);
  });
  it('Boundless consumes a Jingu charge on an empty cast and does not consume charges earned during its batch',()=>{
    const empty=setup(ids.boundless,3,1,[{id:ids.jingu,points:3}]);empty.c[`${ids.jingu}:charges`]=2;empty.advance(.1);empty.t.statuses.push({kind:'invulnerable',until:100});empty.advance(.7);expect(empty.c[`${ids.jingu}:charges`]).toBe(1);
    const fresh=setup(ids.boundless,3,2,[{id:ids.jingu,points:3}]);fresh.t.statuses.push({kind:'jinguHits',source:fresh.c.id,value:3,until:100});fresh.advance(.8);expect(hits(fresh.b,ids.boundless).map(e=>e.amount)).toEqual([225,225]);expect(fresh.c[`${ids.jingu}:charges`]).toBe(4);
  });
  it('Boundless with Super Jingu applies Echo slow to each target without queuing an Echo attack',()=>{
    const h=setup(ids.boundless,3,2,[{id:ids.jingu,points:6}]);h.c.range=1.5;h.advance(.8);
    expect(hits(h.b,ids.boundless)).toHaveLength(2);expect(hits(h.b,ids.jingu)).toHaveLength(0);expect(h.b.units.slice(1).every(u=>status(u,'slow')?.value===1)).toBe(true);
  });
  it('Boundless Super uses final critical and stun values and Gaben applies its Bloodthorn child',()=>{
    const h=setup(ids.boundless,9);h.advance(.7);expect(hits(h.b,ids.boundless)[0].amount).toBe(300);expect(status(h.t,'stun')!.until-h.b.events.find(e=>e.type==='cast'&&e.skill===ids.boundless)!.time).toBeCloseTo(1.9);expect(status(h.t,'silence')?.skill).toBe('aa_granted_bloodthorn');
  });
  it('Anchor and Boundless exclude spell-immune bodies while Acorn and Swash retain historical immunity piercing',()=>{
    for(const id of [ids.anchor,ids.boundless,ids.acorn,ids.swash]){const h=setup(id);h.t.statuses.push({kind:'magicImmune',until:100});h.advance(.8);expect(hits(h.b,id).length>0).toBe(id===ids.acorn||id===ids.swash);}
  });
  it('Area instant attacks hit an invisible body after release and retain their distinct block policies',()=>{
    for(const id of [ids.anchor,ids.boundless,ids.swash]){const h=setup(id,3,2);h.b.units[2].y=3;h.b.units[2].statuses.push({kind:'invisible',until:100});h.advance(.8);expect(hits(h.b,id).some(e=>e.target===h.b.units[2].id)).toBe(true);}
    const blocked=setup(ids.boundless);blocked.t.statuses.push({kind:'block',until:100,value:10000});blocked.advance(.8);expect(hits(blocked.b,ids.boundless)).toHaveLength(0);expect(status(blocked.t,'stun')).toBeDefined();
  });
  it('Walrus active True Strikes and selects its ensured critical without multiplying a stronger critical',()=>{
    const h=setup(ids.walrus,3);h.c.range=2;h.c.statuses.push({kind:'blind',until:100,value:1});h.t.statuses.push({kind:'evasion',until:100,value:1});guaranteedCritical(h.c,5);h.advance(.5);
    expect(hits(h.b,ids.walrus).map(e=>e.amount)).toEqual([500]);expect(status(h.t,'stun')).toBeDefined();
  });
  it('Walrus attack point is multiplied by .6 and scales with attack speed while preserving attack cadence',()=>{
    const release:number[]=[];
    for(const speed of [0,100]){const h=setup(ids.walrus,3,1,[],true);h.c.range=2;h.c.attackPoint=.4;h.c.attackInterval=2;h.c.statuses=h.c.statuses.filter(s=>s.kind!=='disarm');h.c.statuses.push({kind:'attackSpeed',until:100,value:speed});h.c.nextAttack=0;h.advance(.6);const cast=h.b.events.find(e=>e.type==='cast'&&e.skill===ids.walrus)!;release.push(cast.time);expect(h.c.nextAttack).toBeGreaterThanOrEqual(2/(1+speed/100));expect(h.b.events.filter(e=>e.type==='hit'&&e.skill==='basic_attack')).toHaveLength(0);}
    expect(release[0]-release[1]).toBeCloseTo(.12,1);
  });
  it('Walrus waits for a preceding ordinary attack cycle instead of granting a free extra active attack',()=>{
    const h=setup(ids.walrus,3,1,[],true);h.c.range=2;h.c.attackInterval=2;h.c.attackPoint=.2;h.c.attackBackswing=0;h.c.cooldowns[0]=100;h.advance(.3);expect(h.b.events.filter(e=>e.type==='hit'&&e.skill===ids.walrus)).toHaveLength(0);expect(h.t.hp).toBeLessThan(100000);h.c.cooldowns[0]=0;h.advance(1);expect(h.b.events.some(e=>e.type==='cast'&&e.skill===ids.walrus)).toBe(false);h.advance(1.3);expect(h.b.events.find(e=>e.type==='cast'&&e.skill===ids.walrus)!.time).toBeGreaterThanOrEqual(2);
  });
  it('Walrus remaining attack windup follows mid-action attack speed and ignores spell cast-speed bonuses',()=>{
    const release=(attackSpeed:number,castTimePct:number)=>{const h=setup(ids.walrus,3,1,[],true);h.c.range=2;h.c.attackInterval=2;h.c.attackPoint=1;h.advance(.2);h.c.statuses.push({kind:'attackSpeed',until:100,value:attackSpeed},{kind:'castTimePct',until:100,value:castTimePct});h.advance(1.3);return h.b.events.find(e=>e.type==='cast'&&e.skill===ids.walrus)!.time;};
    const ordinary=release(0,0),faster=release(100,0),spellOnly=release(0,2);expect(faster).toBeLessThan(ordinary-.1);expect(spellOnly).toBe(ordinary);
  });
  it('Walrus cannot start its active attack while disarmed',()=>{
    const h=setup(ids.walrus,3,1,[],true);h.c.range=2;h.c.attackPoint=.2;h.c.statuses.push({kind:'disarm',until:.5});h.advance(.4);expect(h.b.events.some(e=>e.type==='cast'&&e.skill===ids.walrus)).toBe(false);h.advance(.5);expect(h.b.events.some(e=>e.type==='cast'&&e.skill===ids.walrus)).toBe(true);
  });
  it('Walrus Gaben PRD replaces the same attack and spends neither mana nor active cooldown',()=>{
    const h=setup(ids.walrus,9,1,[],true);h.c.range=2;h.c.cooldowns[0]=100;h.c.statuses=h.c.statuses.filter(s=>s.kind!=='disarm');h.c.attackInterval=.12;h.c.attackPoint=0;h.c.attackBackswing=0;h.c.nextAttack=0;h.t.statuses.push({kind:'evasion',until:100,value:1});h.advance(8);
    const landed=h.b.events.filter(e=>e.type==='hit'&&e.source===h.c.id&&(e.amount??0)>0);expect(landed.length).toBeGreaterThan(0);expect(landed.every(e=>e.amount===400)).toBe(true);expect(h.b.events.filter(e=>e.type==='cast'&&e.skill===ids.walrus)).toHaveLength(0);expect(h.c.mana).toBe(100000);expect(h.c.cooldowns[0]).toBe(100);expect(Object.keys(h.c.prdState??{}).some(k=>k.includes('walrusPunch'))).toBe(true);
  });
  it('Walrus zero-damage landed attacks still disable and its final Super air time precedes landing slow',()=>{
    const h=setup(ids.walrus,6);h.c.range=2;h.t.statuses.push({kind:'shield',until:100,remaining:10000} as EffectStatus);h.advance(.5);const cast=h.b.events.find(e=>e.type==='cast'&&e.skill===ids.walrus)!;expect(status(h.t,'stun')!.until-cast.time).toBeCloseTo(1.4);expect(hits(h.b,ids.walrus)).toHaveLength(0);expect(status(h.t,'slow')).toBeUndefined();h.advance(1.3);expect(status(h.t,'slow')?.value).toBe(.4);expect(status(h.t,'break')).toBeDefined();
  });
  it('Acorn and Walrus use the actual wielder attack range rather than the captured hero range',()=>{
    for(const id of [ids.acorn,ids.walrus]){const h=setup(id);h.c.range=7;h.t.y=id===ids.acorn?10:6;h.advance(.8);expect(h.b.events.some(e=>e.type==='cast'&&e.skill===id)).toBe(true);}
  });
  it('Swash finishes its continuous dash before slashing at .1-second intervals',()=>{
    const h=setup(ids.swash);h.t.y=8;h.advance(.2);expect(h.c.y).toBeGreaterThan(0);expect(h.c.y).toBeLessThan(6);expect(hits(h.b,ids.swash)).toHaveLength(0);h.advance(.6);
    const list=hits(h.b,ids.swash);expect(list).toHaveLength(3);expect(list[1].time-list[0].time).toBeCloseTo(.1,6);expect(list[2].time-list[1].time).toBeCloseTo(.1,6);expect(h.c.y).toBeCloseTo(6);expect(h.b.events.some(e=>e.type==='move'&&e.source===h.c.id&&e.teleport)).toBe(false);
  });
  it('Swash fixed strikes True Strike through blind, ignore flat block, and still trigger cleave',()=>{
    const h=setup(ids.swash,3,2);h.c.attack=1000;h.b.units[2].x=3;h.b.units[2].y=2;h.c.statuses.push({kind:'blind',until:100,value:1},{kind:'cleave',until:100,value:1,skill:'testCleave',data:{radius:20}} as EffectStatus);h.t.statuses.push({kind:'evasion',until:100,value:1},{kind:'block',until:100,value:100000},{kind:'attackDamageBlock',until:100,value:100000});h.advance(.8);
    expect(hits(h.b,ids.swash).map(e=>e.amount)).toEqual([85,85,85]);expect(hits(h.b,'testCleave').map(e=>e.amount)).toEqual([85,85,85]);
  });
  it('Swash Gaben final profile has six strikes and Super periodic half-count slashes remain breakable',()=>{
    const h=setup(ids.swash,9);h.advance(.8);expect(hits(h.b,ids.swash)).toHaveLength(6);h.c.cooldowns[0]=100;h.c.statuses.push({kind:'break',until:7});h.advance(5.7);expect(hits(h.b,ids.swash)).toHaveLength(6);
  });
  it('Swash Super fires facing-direction periodic slashes with half the tier strike count rounded up',()=>{
    for(const [points,count] of [[6,2],[9,3]]){const h=setup(ids.swash,points);h.c.cooldowns[0]=100;h.c.facing=Math.PI/2;h.advance(6.5);expect(hits(h.b,ids.swash)).toHaveLength(count);expect(h.c.y).toBe(0);}
  });
  it('Swash ignores Enchant Totem base-damage amplification while still consuming the attack buff',()=>{
    const totem='custom_earthshaker_enchant_totem',h=setup(ids.swash,3,1,[{id:totem,points:3}]);h.c.cooldowns[1]=100;h.c.statuses.push({kind:'enchantTotem',skill:totem,source:h.c.id,until:100});h.advance(.8);expect(hits(h.b,ids.swash).map(e=>e.amount)).toEqual([85,85,85]);expect(status(h.c,'enchantTotem')).toBeUndefined();
  });
});

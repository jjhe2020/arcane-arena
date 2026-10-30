import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyDamage,createBattle,stepBattle,FIXED_STEP,getCombatStats} from '../src/combat';
import {SKILL_IMPLEMENTATIONS,type EffectContext,type EffectStatus,type SkillProgram} from '../src/skill-effects';
import type {AssetManifest,CombatUnit,Player,SkillDefinition} from '../src/model';
import {addBarrier,barriers,barrierBlocksUnit} from '../src/combat/barriers';
import {barrierPresentations} from '../src/animation';
const OBS='test_c13_observer',CALL='test_c13_cast',registry=SKILL_IMPLEMENTATIONS as Record<string,SkillProgram>,catalog=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const observer:SkillDefinition={id:OBS,name:OBS,nameEn:OBS,description:'Finite engine observation fixture.',descriptionEn:'Finite engine observation fixture.',icon:'',tags:[],super:'',gaben:'',values:[],cooldowns:[999],mana:[0],categories:['ABILITY: Passive'],passive:true,ultimate:false};
const player=(id:number,extra:string[]=[]):Player=>({id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-2,skills:[OBS,...extra].map(id=>({id,points:1}))}]});
afterEach(()=>{delete registry[OBS];delete registry[CALL];});
function world(extra:string[]=[]){
 const contexts:EffectContext[]=[];registry[OBS]={passive:true,implemented:[],remaining:[],init:c=>{contexts.push(c);}};
 registry[CALL]={target:'enemy',unitTarget:true,requiresFacing:false,castPoint:0,range:20,cast:c=>{c.damage(c.target,100,'pure');},implemented:[],remaining:[]};
 const definitions=[...structuredClone(catalog),observer,{...observer,id:CALL,passive:false,categories:['ABILITY: Unit Target']}],b=createBattle(player(0,extra),player(1),901,definitions),u=b.units[0],t=b.units[1];
 for(const body of b.units){body.hp=body.maxHp=10000;body.armor=body.magicResist=body.moveSpeed=0;body.nextAttack=99999;body.attack=body.attackMin=body.attackMax=100;}
 u.x=u.y=0;t.x=2;t.y=0;
 const c=contexts.find(c=>c.caster.id===u.id)!,add=(kind:string,value:number,data:Record<string,string|number|boolean>={},source=u.id)=>{const s:EffectStatus={kind,value,until:999,source,skill:OBS,data};t.statuses.push(s);return s;};
 return{b,u,t,c,tc:contexts.find(c=>c.caster.id===t.id)!,contexts,add,definitions,damage:(n=100,type:'pure'|'physical'|'magical'='pure',actor=u,flags={})=>applyDamage(b,actor,t,n,type,OBS,false,0,false,undefined,{flags}),step:(s=FIXED_STEP)=>stepBattle(b,s,definitions)};
}
describe('C13 declared source-specific generic incoming amplification',()=>{
 it('C13-E01 an opted source amplification adds to the signed generic reduction group',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});expect(w.damage()).toBeCloseTo(80);});
 it('C13-E02 an unmarked legacy source amplification preserves its previous independent factor',()=>{const w=world();w.add('sourceDamageAmp',.4);w.add('damageReduction',.6,{genericIncoming:true});expect(w.damage()).toBeCloseTo(56);});
 it('C13-E03 unrelated damage sources cannot use another caster amplification',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true},'other');w.add('damageReduction',.6,{genericIncoming:true});expect(w.damage()).toBeCloseTo(40);});
 it('C13-E04 a real owned summoned body uses the matching owner amplification once',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});const body=w.c.summon({name:'Owned damage source',count:1,hp:100,attack:10,lifetime:5})[0];expect(body.owner).toBe(w.u.id);expect(w.damage(100,'pure',body)).toBeCloseTo(80);});
 it('C13-E05 ordinary armor precedes the declared incoming stage',()=>{const w=world();w.t.armor=10;w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});expect(w.damage(100,'physical')).toBeCloseTo(50);});
 it('C13-E06 ungrouped reduction remains a separate compatibility factor',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});w.add('damageReduction',.5);expect(w.damage()).toBeCloseTo(40);});
 it('C13-E07 direct health removal and typed HPLOSS cannot acquire the opted amplification',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});expect(w.damage(100,'pure',w.u,{healthRemoval:true})).toBe(100);expect(w.damage(100,'pure',w.u,{healthLoss:true})).toBe(100);});
 it('C13-E08 an explicit after-armor barrier spends capacity before the signed generic group',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('damageReduction',.6,{genericIncoming:true});w.t.statuses.push({kind:'physicalShield',value:50,remaining:50,until:999,source:w.t.id,skill:OBS,data:{physicalAttackOnly:true,damageStage:'afterArmorBeforeGeneric'}} as EffectStatus);expect(applyDamage(w.b,w.u,w.t,100,'physical')).toBeCloseTo(40);expect(w.t.absorbed).toBe(50);});
 it('C13-E09 source and owner identities do not double-count a single status',()=>{const w=world();w.u.owner=w.u.id;w.add('sourceDamageAmp',.4,{genericIncoming:true});expect(w.damage()).toBeCloseTo(140);});
 it('C13-E10 signed amplification remains additive with opted attack-only reduction',()=>{const w=world();w.add('sourceDamageAmp',.4,{genericIncoming:true});w.add('attackDamageReduction',.6,{genericIncoming:true});expect(applyDamage(w.b,w.u,w.t,100,'physical')).toBeCloseTo(80);expect(w.damage()).toBeCloseTo(140);});
});

describe('C13 actual continuous movement segment callbacks',()=>{
 it('C13-E11 callbacks observe recorded transforms once per nonzero segment before termination',()=>{const w=world(),segments:number[][]=[],order:string[]=[];w.t.x=12;expect(w.c.moveContinuous(w.u,3,0,{duration:.1,lockActions:false,onMove:(from,to)=>{expect(w.u.x).toBe(to.x);expect(w.u.y).toBe(to.y);expect(w.b.events.at(-1)).toMatchObject({type:'move',toX:to.x,toY:to.y});segments.push([from.x,to.x]);order.push('move');},onEnd:r=>order.push(r)})).toBe(true);expect(segments).toEqual([[0,1]]);w.step(.2);expect(segments).toEqual([[0,1],[1,2],[2,3]]);expect(order).toEqual(['move','move','move','complete']);expect(w.u.warpSequence).toBe(0);});
 it('C13-E12 a zero-length controller never emits a segment and still ends once',()=>{const w=world(),ends:string[]=[];let moves=0;w.c.moveContinuous(w.u,0,0,{duration:.1,onMove:()=>moves++,onEnd:r=>ends.push(r)});w.step(.2);expect(moves).toBe(0);expect(ends).toEqual(['complete']);});
 it('C13-E13 a segment callback may explicitly warp the body without completing the old controller later',()=>{const w=world(),ends:string[]=[];let moves=0;w.t.x=12;w.c.moveContinuous(w.u,3,0,{duration:.1,onMove:()=>{moves++;w.c.warp(w.u,8,0);},onEnd:r=>ends.push(r)});expect(w.u.x).toBe(8);w.step(.2);expect(moves).toBe(1);expect(ends).toEqual(['interrupted']);expect(w.u.warpSequence).toBe(1);});
 it('C13-E14 a callback can replace its controller and the old endpoint cannot terminate that replacement',()=>{const w=world(),ends:string[]=[];w.t.x=12;let replaced=false;w.c.moveContinuous(w.u,1,0,{duration:FIXED_STEP,onMove:()=>{if(!replaced){replaced=true;w.c.moveContinuous(w.u,4,0,{duration:.1,onEnd:r=>ends.push(`new:${r}`)});}},onEnd:r=>ends.push(`old:${r}`)});w.step(.2);expect(w.u.x).toBe(4);expect(ends).toEqual(['old:interrupted','new:complete']);});
 it('C13-E15 callbacks expose only actual wall-constrained segments',()=>{const w=world(),segments:number[][]=[];w.t.x=12;w.c.barrier({from:{x:1,y:-2},to:{x:1,y:2},width:.2,duration:1});w.c.moveContinuous(w.u,4,0,{duration:.1,onMove:(from,to)=>segments.push([from.x,to.x])});w.step(.2);expect(w.u.x).toBeLessThan(1);expect(segments.length).toBeGreaterThan(0);expect(segments.every(([from,to])=>to>from&&to<1)).toBe(true);expect(segments.reduce((n,[from,to])=>n+to-from,0)).toBeCloseTo(w.u.x);});
 it.each([true,false])('C13-E16 lockActions=%s preserves its declared ordinary-attack gate',lockActions=>{const w=world();w.t.x=10;w.u.facing=0;w.u.range=20;w.u.attackCapability='melee';w.u.attackPoint=0;w.u.nextAttack=0;w.c.moveContinuous(w.u,3,0,{duration:.5,lockActions});w.step(.1);expect(w.u.x).toBeGreaterThan(0);expect(w.b.events.some(e=>e.type==='attack'&&e.source===w.u.id)).toBe(!lockActions);});
});

describe('C13 explicit nonlethal direct health assignment',()=>{
 it('C13-E17 health assignment bypasses damage, healing, shields and False Promise accounting',()=>{const w=world();w.add('falsePromise',0);w.add('shield',1000);w.add('healReduction',1);const events=w.b.events.length,healing=w.u.healing,taken=w.t.taken;expect(w.c.setHealth!(w.t,9900,{nonLethal:true})).toBe(-100);expect(w.t.hp).toBe(9900);expect(w.c.setHealth!(w.t,9950,{nonLethal:true})).toBe(50);expect(w.t.hp).toBe(9950);expect(w.u.healing).toBe(healing);expect(w.t.taken).toBe(taken);expect(w.t.absorbed??0).toBe(0);expect(w.b.events).toHaveLength(events);expect((w.t.statuses.find(s=>s.kind==='shield') as EffectStatus).value).toBe(1000);});
 it('C13-E18 the direct setter clamps at one and maximum without producing a death or revive',()=>{const w=world();expect(w.c.setHealth!(w.t,-100,{nonLethal:true})).toBe(-9999);expect(w.t.hp).toBe(1);expect(w.t.dead).toBe(false);expect(w.c.setHealth!(w.t,100000,{nonLethal:true})).toBe(9999);expect(w.t.hp).toBe(10000);w.t.dead=true;expect(w.c.setHealth!(w.t,5000,{nonLethal:true})).toBe(0);expect(w.t.hp).toBe(10000);expect(w.t.dead).toBe(true);});
 it.each([NaN,Infinity,-Infinity])('C13-E19 invalid direct health value%s leaves the body unchanged',value=>{const w=world();expect(w.c.setHealth!(w.t,value,{nonLethal:true})).toBe(0);expect(w.t.hp).toBe(10000);});
});

describe('C13 pure effective armor read with source exclusions',()=>{
 it('C13-E20 a signed total includes base percentage and bonus armor without modifying state',()=>{const w=world();w.t.armor=10;w.add('baseArmorPct',-.5);w.add('armor',-8);const before=JSON.stringify(w.b);expect(w.c.armor!(w.t)).toBe(-3);expect(JSON.stringify(w.b)).toBe(before);});
 it('C13-E21 source and skill exclusions together remove only their matching contribution',()=>{const w=world();w.t.armor=10;w.add('armor',4,{},'sourceA');w.t.statuses.push({kind:'armor',value:6,source:'sourceA',skill:'different',until:999},{kind:'armor',value:3,source:'sourceB',skill:OBS,until:999});expect(w.c.armor!(w.t,{excludeSourceId:'sourceA',excludeSkillId:OBS})).toBe(19);expect(w.c.armor!(w.t,{excludeSourceId:'sourceA'})).toBe(13);expect(w.c.armor!(w.t,{excludeSkillId:OBS})).toBe(16);});
 it('C13-E22 exclusion precedes strongest-group selection so another eligible source remains',()=>{const w=world();w.add('armor',8,{stacking:'strongest',uniqueGroup:'shared'},'sourceA');w.add('armor',5,{stacking:'strongest',uniqueGroup:'shared'},'sourceB');expect(w.c.armor!(w.t)).toBe(8);expect(w.c.armor!(w.t,{excludeSourceId:'sourceA',excludeSkillId:OBS})).toBe(5);});
 it('C13-E23 recipient and source Break qualification is preserved by the read',()=>{const w=world();w.t.statuses.push({kind:'armor',value:8,source:w.t.id,skill:OBS,until:999,passive:true} as EffectStatus);expect(w.c.armor!(w.t)).toBe(8);w.add('break',0);expect(w.c.armor!(w.t)).toBe(0);w.t.statuses=[];w.add('armor',6,{suppressWithSourceBreak:true});w.u.statuses.push({kind:'break',until:999});expect(w.c.armor!(w.t)).toBe(0);});
});

describe('C13 explicit primary-only Soulbind exception',()=>{
 it.each([false,true,undefined])('C13-E24 soulbindCopies=%s gates both extra cast events and extra effects',enabled=>{const w=world([CALL]);registry[CALL].soulbindCopies=enabled;const partner=w.tc.summon({name:'Bound partner',count:1,hp:1000,attack:0,lifetime:10,position:{x:4,y:0}})[0];w.add('soulbind',0,{partnerId:partner.id});w.step();expect(w.b.events.filter(e=>e.type==='cast'&&e.skill===CALL)).toHaveLength(enabled===false?1:2);expect(w.t.hp).toBe(9900);expect(partner.hp).toBe(enabled===false?1000:900);});
});

describe('C13 opt-in native block group and provider-local PRD',()=>{
 const block=(w:ReturnType<typeof world>,value:number,chance:number,more:EffectStatus['data']={})=>w.add('attackDamageBlock',value,{blockGroup:'nativeDamageBlock',chance,prdKey:'crimsonGuardBlock',...more});
 const physical=(w:ReturnType<typeof world>)=>applyDamage(w.b,w.u,w.t,100,'physical');
 it('C13-E25 an active guarantee prevents lower-priority native block trials and RNG consumption',()=>{const w=world();block(w,75,1);const passive=block(w,50,.6);passive.skill='item_crimson_guard';const rng=w.b.rng;expect(physical(w)).toBe(25);expect(w.b.rng).toBe(rng);expect(w.t.prdState??{}).toEqual({});});
 it('C13-E26 an equal-value guarantee wins before a passive regardless of insertion order',()=>{const w=world();block(w,75,.6).skill='item_crimson_guard';block(w,75,1);const rng=w.b.rng;expect(physical(w)).toBe(25);expect(w.b.rng).toBe(rng);expect(w.t.prdState??{}).toEqual({});});
 it('C13-E27 a declared Crimson passive records exactly one wearer PRD trial per eligible packet',()=>{const w=world();block(w,75,.6).skill='item_crimson_guard';for(let i=0;i<3;i++)physical(w);const states=Object.values(w.t.prdState??{}) as {trials:number}[];expect(states).toHaveLength(1);expect(states[0].trials).toBe(3);expect(w.u.prdState??{}).toEqual({});});
 it('C13-E28 excluded ward sources and physical spells do not roll a native attack block',()=>{const w=world();block(w,75,.6,{excludeWardAttacks:true}).skill='item_crimson_guard';const rng=w.b.rng;w.u.ward=true;expect(physical(w)).toBe(100);w.u.ward=false;expect(w.damage(100,'physical')).toBe(100);expect(w.b.rng).toBe(rng);expect(w.t.prdState??{}).toEqual({});});
 it('C13-E29 a failed higher opted chance can fall through to a lower guarantee without adding block amounts',()=>{const w=world();block(w,90,0);block(w,40,1);expect(physical(w)).toBe(60);});
 it('C13-E30 unmarked legacy providers retain their previous separate qualification',()=>{const w=world();w.add('attackDamageBlock',20,{chance:1});block(w,40,1);expect(physical(w)).toBe(60);});
});

describe('C13 explicitly qualified health-victim lifesteal providers',()=>{
 const provider=(w:ReturnType<typeof world>,qualified=true)=>{w.u.hp=5000;w.u.statuses.push({kind:'lifesteal',value:.5,until:999,skill:qualified?'qualifiedLS':'legacyLS',source:w.u.id,data:qualified?{requiresHealthVictim:true}:undefined} as EffectStatus);};
 it('C13-E31 only the opted provider is excluded for a building victim',()=>{const w=world();w.t.building=true;provider(w);provider(w,false);w.c.attack(w.t);expect(w.t.taken).toBe(100);expect(w.u.hp).toBe(5050);expect(w.u.healing).toBe(50);});
 it('C13-E32 a fixed-hit body cannot provide qualified lifesteal while legacy providers remain separate',()=>{const w=world();w.t.ward=true;w.add('hitCountBody',0,{heroRangedDamage:2,heroMeleeDamage:2});provider(w);provider(w,false);w.c.attack(w.t);expect(w.t.taken).toBe(2);expect(w.u.hp).toBe(5001);});
 it('C13-E33 a ward with ordinary health remains eligible under the explicitly bounded flag',()=>{const w=world();w.t.ward=true;provider(w);w.c.attack(w.t);expect(w.u.hp).toBe(5050);});
 it('C13-E34 allied targets retain the existing no-lifesteal rule',()=>{const w=world();w.t.side=0;provider(w);w.c.attack(w.t);expect(w.u.hp).toBe(5000);});
 it('C13-E35 a qualified deferred packet freezes eligibility before later victim-form changes',()=>{const w=world();provider(w);w.add('damageDelay',.1);w.c.attack(w.t);expect(w.u.hp).toBe(5000);w.t.building=true;w.step(.2);expect(w.u.hp).toBeCloseTo(5050);});
});

describe('C13 explicitly released allied-contact lease observation',()=>{
 it.each([true,false])('C13-E36 after-death flag%s enables only the selected program and contact hook',enabled=>{const w=world([CALL]),seen:string[]=[];registry[OBS].onAllyBeforeAttackDamageAfterDeath=enabled;registry[OBS].onAllyBeforeAttackDamage=c=>{seen.push('opted');c.addAttackBonus?.(40);};registry[CALL].onAllyBeforeAttackDamage=c=>{seen.push('unmarked');c.addAttackBonus?.(900);};registry[OBS].onAllyAttack=()=>seen.push('otherHook');const body=w.c.summon({name:'Allied attacker',count:1,hp:1000,attack:100,lifetime:10,inheritsSkills:true,initializeInherited:true,inheritedMode:'passives'})[0];w.u.cooldowns.fill(99999);w.step();const actor=w.contexts.find(c=>c.caster.id===body.id)!;w.u.dead=true;actor.attack(w.t);expect(w.t.taken).toBe(enabled?140:100);expect(seen).toEqual(enabled?['opted']:[]);});
});

describe('C13 explicit child terrain and visual family',()=>{
 it('C13-E37 Snowball child walls share terrain traversal without exempting unknown spell barriers',()=>{const w=world();w.t.x=12;addBarrier(w.b,w.u,'aa_granted_snowball_ice_shards',{x:1,y:-2},{x:1,y:2},.2,5);addBarrier(w.b,w.u,'unknown_spell_barrier',{x:2,y:-2},{x:2,y:2},.2,5);w.u.statuses.push({kind:'freePathing',until:999});expect(barriers(w.b).map(wall=>barrierBlocksUnit(w.u,wall))).toEqual([false,true]);w.u.statuses=[];w.c.moveContinuous(w.u,4,0,{duration:.1,ignoreTerrainBarriers:true});w.step(.2);expect(w.u.x).toBeGreaterThan(1);expect(w.u.x).toBeLessThan(2);expect(barriers(w.b)[0].skill).toBe('aa_granted_snowball_ice_shards');});
 it('C13-E38 native child walls reuse the delivered Ice Shards body without rewriting their identity',()=>{const w=world(),assets=JSON.parse(readFileSync(new URL('../public/data/assets.json',import.meta.url),'utf8')) as AssetManifest,visual={group:'child-shards',centerX:1,centerY:0,angle:0};for(const y of[-1,1])addBarrier(w.b,w.u,'aa_granted_snowball_ice_shards',{x:1,y},{x:1,y},.5,5,visual);const before=JSON.stringify(w.b),paint=barrierPresentations(assets,barriers(w.b),0);expect(paint).toHaveLength(1);expect(paint[0].clip.image).toBe('/art/skills/custom_tusk_ice_shards/barrier.webp');expect(JSON.stringify(w.b)).toBe(before);});
});

describe('C13 displayed resistance follows the actual modifier selection',()=>{
 it('C13-E39 source-Break suppression affects both displayed resistance and actual mitigation',()=>{const w=world();w.add('magicResist',.33,{suppressWithSourceBreak:true});expect(getCombatStats(w.t).magicResist).toBeCloseTo(.33);expect(w.damage(100,'magical')).toBeCloseTo(67);w.u.statuses.push({kind:'break',until:999});expect(getCombatStats(w.t).magicResist).toBe(0);expect(w.damage(100,'magical')).toBe(100);});
});

describe('C13 explicit AA automatic-cast difference',()=>{
 it('C13-E40 real Quill Spray casts off cooldown without inventing an enemy-in-range requirement',()=>{const id='custom_bristleback_quill_spray',w=world([id]);w.t.x=12;w.step(.1);const casts=()=>w.b.events.filter(e=>e.type==='cast'&&e.skill===id);expect(casts()).toHaveLength(1);expect(w.t.taken).toBe(0);w.step(3.1);expect(casts()).toHaveLength(2);expect(w.t.taken).toBe(0);expect(w.b.events.filter(e=>e.type==='hit'&&e.skill===id)).toHaveLength(0);});
});

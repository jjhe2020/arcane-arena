import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle,FIXED_STEP} from '../src/combat';
import {UNIT_CONFIG,skillBalance} from '../src/config';
import type {EffectStatus} from '../src/skill-effects';
import {bodyPresentation,basicAttackClip} from '../src/animation';
import {getSkillProgram} from '../src/skill-effects';
import {activeVisualWorldEffects} from '../src/combat/visual-state';
import {worldVisuals} from '../src/visual-bindings';
import type {CombatUnit,Player,Role,SkillDefinition,SkillStack} from '../src/model';

const defs=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const assets=JSON.parse(readFileSync(new URL('../public/data/assets.json',import.meta.url),'utf8'));
const CH='keeper_of_the_light_chakra_magic',WIND='custom_windrunner_windrun',FINGER='custom_lion_finger_of_death',STEP='void_spirit_astral_step',NC='custom_furion_force_of_nature',J='custom_monkey_king_jingu_mastery',COOKIE='custom_snapfire_firesnap_cookie',KISSES='custom_snapfire_mortimer_kisses',SPIT='aa_granted_spit_out',GOBBLE='aa_granted_gobble_up';
/** Only initial statistics,positions and action clocks are controlled. All
 * casts,marks,damage,summons,death and dispel come from the real registry. */
function world(load0:SkillStack[][],load1:SkillStack[][]=[],role:Role='mage'){
 const player=(side:number):Player=>({id:side,name:'P',hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`p${side}h${i}`,name:'H',role:side===0&&i===0?role:'mage',skin:'male',x:i,y:0,skills:(side===0?load0:load1)[i]??[]}))});
 const definitions=structuredClone(defs),b=createBattle(player(0),player(1),1616,definitions),c=b.units[0],a=b.units[1],t=b.units.find(u=>u.side===1)!;
 for(const u of b.units){u.hp=u.maxHp=100000;u.mana=u.maxMana=10000;u.armor=u.magicResist=0;u.moveSpeed=0;u.nextAttack=99999;u.x=15;u.y=10;}
 c.x=c.y=0;c.facing=0;a.x=2;a.y=0;a.facing=0;t.x=4;t.y=0;t.facing=Math.PI;
 return {b,c,a,t,definitions,step:(s:number)=>stepBattle(b,s,definitions)};
}
type W=ReturnType<typeof world>;
const casts=(w:W,id:string,actor?:CombatUnit)=>w.b.events.filter(e=>e.type==='cast'&&e.skill===id&&(!actor||e.source===actor.id));
const until=(w:W,fn:()=>boolean,seconds=10)=>{for(let n=0;n<seconds*30&&!fn();n++)w.step(FIXED_STEP);expect(fn()).toBe(true);};
const burnHits=(w:W)=>w.b.events.filter(e=>e.type==='hit'&&e.target===w.t.id&&e.flags?.damageOverTime);
function numericDeadlines(value:unknown):number[]{if(Array.isArray(value))return value as number[];if(!value||typeof value!=='object')return [];const o=value as Record<string,unknown>;if(Array.isArray(o.queue))return o.queue as number[];if(typeof o.next==='number')return[o.next];if(typeof o.readyAt==='number')return[o.readyAt];return [];}
const charges=(u:CombatUnit)=>Object.fromEntries(Object.entries(u).filter(([k])=>/charges|charge|recharge|demonic/i.test(k)));

describe('Existing Chakra modifier follows the recipient execution lifecycle',()=>{
 it.each([false,true])('LS-CH01 original provider dead=%s preserves the same4-second retroactive reduction after a genuine Finger death',dead=>{
  const w=world([[{id:CH,points:3}],[{id:WIND,points:9}]],[[{id:FINGER,points:3}]]);w.c.hp=1;w.a.mana=0;w.a.cooldowns[0]=10;w.t.x=-3;w.t.cooldowns[0]=dead?1:99999;
  until(w,()=>casts(w,CH,w.c).length>0);until(w,()=>casts(w,WIND,w.a).length>0);
  expect(w.c.dead).toBe(dead);expect(w.a.statuses.some(s=>s.kind==='chakraMagic'&&s.source===w.c.id)).toBe(true);
  const data=w.a['mainCharges:'+WIND] as {queue:number[]};expect(data.queue[0]).toBeCloseTo(14);expect(casts(w,WIND,w.a)[0].time).toBeCloseTo(6);
  if(dead)expect(w.b.events.some(e=>e.type==='death'&&e.target===w.c.id&&e.skill===FINGER)).toBe(true);
 });
 it('LS-CH02 a new Chakra cast does not reduce its own new cooldown or double-run the old own/ally handlers',()=>{
  const w=world([[{id:CH,points:9}],[{id:WIND,points:9}]]);w.a.mana=0;w.a.cooldowns[0]=10;until(w,()=>casts(w,CH,w.c).length>0);
  const cast=casts(w,CH,w.c)[0];expect(w.c.cooldowns[0]-cast.time).toBeCloseTo(skillBalance(w.definitions.find(d=>d.id===CH)!,9)!.cooldown);
  expect(getSkillProgram(CH)?.onCast).toBeUndefined();expect(getSkillProgram(CH)?.onAllyCast).toBeUndefined();
 });
 it('LS-CH05 the expired15-second working lease cannot reduce a later Windrun',()=>{
  const w=world([[{id:CH,points:3}],[{id:WIND,points:9}]]);w.a.mana=0;w.a.cooldowns[0]=30;until(w,()=>casts(w,CH,w.c).length>0);w.c.cooldowns.fill(99999);until(w,()=>casts(w,WIND,w.a).length>0,30);const cast=casts(w,WIND,w.a)[0],state=w.a['mainCharges:'+WIND] as {queue:number[]};expect(w.a.statuses.some(s=>s.kind==='chakraMagic')).toBe(false);expect(state.queue[0]-cast.time).toBeCloseTo(12);
 });
 it.each([3,9])('LS-CH03 rank%s Astral Step shifts its real exhausted charge deadline by6seconds and retains sequential capacity',points=>{
  const w=world([[{id:CH,points:9}],[{id:STEP,points}]]);w.c.cooldowns[0]=2;w.a.hp=90000;w.a.mana=200;w.step(1.9);
  const old=structuredClone(w.a['charges:'+STEP]) as {count:number;maximum:number;next:number};expect(old.count).toBe(0);expect(old.maximum).toBe(points===3?2:4);
  until(w,()=>casts(w,CH,w.c).length>0,5);const next=w.a['charges:'+STEP] as typeof old;expect(next.next).toBeCloseTo(old.next-6);expect(next.count).toBe(0);expect(next.maximum).toBe(old.maximum);
 });
 it('LS-CH08 actual mana restoration adds a recipient-following restore occurrence without health-heal events or render mutation',()=>{
  const w=world([[{id:CH,points:3}],[{id:WIND,points:9}]]);w.a.mana=0;w.a.cooldowns[0]=10;until(w,()=>casts(w,CH,w.c).length>0);const effect=activeVisualWorldEffects(w.b).find(e=>e.skill===CH&&e.layer==='restore'&&e.followUnit===w.a.id)!;expect(effect).toBeDefined();expect(effect.x).toBe(w.a.x);expect(effect.y).toBe(w.a.y);expect(effect.until-effect.createdAt).toBeCloseTo(16/24);expect(w.b.events.filter(e=>e.type==='heal'&&e.skill===CH)).toHaveLength(0);
  const frozen=JSON.stringify(w.b),projected=worldVisuals(assets,w.b,w.b.time);expect(projected.some(v=>v.clip.image.includes('/keeper_of_the_light_chakra_magic/restore.webp'))).toBe(true);worldVisuals(assets,w.b,w.b.time);expect(JSON.stringify(w.b)).toBe(frozen);w.step(.7);expect(activeVisualWorldEffects(w.b).some(e=>e.skill===CH&&e.layer==='restore')).toBe(false);expect(w.a.statuses.some(s=>s.kind==='chakraMagic')).toBe(true);
 });
 it('LS-CH09 a full-mana recipient receives its real cooldown benefit without an unearned mana-restore occurrence',()=>{
  const w=world([[{id:CH,points:3}],[{id:WIND,points:9}]]);w.a.cooldowns[0]=10;until(w,()=>casts(w,CH,w.c).length>0);expect(casts(w,CH,w.c)[0].target).toBe(w.a.id);expect(w.a.cooldowns[0]).toBe(6);expect(activeVisualWorldEffects(w.b).filter(e=>e.skill===CH&&e.layer==='restore')).toHaveLength(0);
 });
 it('LS-CH06 a genuine granted Blink Fragment shifts all three already-queued restoration deadlines once',()=>{
  const w=world([[{id:CH,points:9}],[{id:'antimage_mana_break',points:9}]]);w.c.cooldowns[0]=2;w.a.hp=90000;w.a.mana=200;w.step(1.9);const id='aa_granted_blink_fragment',old=structuredClone(w.a['mainCharges:'+id]) as {queue:number[];count:number};expect(w.a.skills.some(s=>s?.id===id)).toBe(true);expect(old.queue).toHaveLength(3);until(w,()=>casts(w,CH,w.c).length>0,5);const state=w.a['mainCharges:'+id] as typeof old;expect(state.queue).toEqual(old.queue.map(t=>t-6));expect(state.count).toBe(0);
 });
 it.each(['sandking_burrowstrike','void_spirit_resonant_pulse','ember_spirit_sleight_of_fist'])('LS-CH07 %s accounts for real same-frame recast and retroactive reduction rather than comparing a stale queue alone',id=>{
  const w=world([[{id:CH,points:9}],[{id,points:9}]]);w.c.cooldowns[0]=2;w.a.hp=90000;w.a.mana=200;w.step(1.9);const oldCount=casts(w,id,w.a).length,before=structuredClone(charges(w.a));until(w,()=>casts(w,CH,w.c).length>0,5);expect(casts(w,id,w.a).length).toBe(oldCount+1);const state=charges(w.a);
  if(id==='sandking_burrowstrike'){const data=state['mobilityCharges:'+id] as {count:number;next:number;recharge:number};expect(data.count).toBe(1);expect(data.next-w.b.time).toBeCloseTo(data.recharge);}
  else if(id==='void_spirit_resonant_pulse'){const key='mainCharges:'+id,data=state[key] as {queue:number[];count:number},old=before[key] as typeof data;expect(data.count).toBe(0);expect(data.queue[0]).toBeCloseTo(old.queue[0]-12);expect(data.queue[1]-data.queue[0]).toBeCloseTo(18);}
  else{const data=state['fistCharges:'+id] as {queue:number[];count:number};expect(data.count).toBe(1);expect(data.queue).toHaveLength(2);expect(data.queue[1]-data.queue[0]).toBeCloseTo(6);}
 });
 it.each([
  ['clinkz_strafe',9],['custom_shadow_demon_demonic_purge',6],['custom_shadow_demon_demonic_cleanse',6],['custom_shadow_demon_disruption',9],['custom_grimstroke_ink_swell',9],['death_prophet_spirit_siphon',9],['dawnbreaker_fire_wreath',6],['morphling_waveform',6],['custom_windrunner_windrun',9]
 ] as const)('LS-CH04 %s keeps its already-supported real charge clock responsive to allied Chakra',(id,points)=>{
  const w=world([[{id:CH,points:9}],[{id,points}]]);w.c.cooldowns[0]=2;w.a.hp=90000;w.a.mana=200;w.step(1.9);const before=structuredClone(charges(w.a));
  until(w,()=>casts(w,CH,w.c).length>0,5);const after=charges(w.a),key=Object.keys(before).find(k=>numericDeadlines(before[k]).length&&numericDeadlines(after[k]).length);
  expect(getSkillProgram(id)?.reduceRecharge).toBeTypeOf('function');expect(key).toBeDefined();expect(numericDeadlines(after[key!])[0]).toBeCloseTo(numericDeadlines(before[key!])[0]-6);
 });
});

describe('Cookie Kisses and Spit use the existing one-provider magma lifecycle',()=>{
 function pair(first:string,second:string){
  const ids=[first,second],w=world([...[COOKIE,KISSES].every(id=>ids.includes(id))?[[{id:COOKIE,points:6}],[{id:KISSES,points:9}]]:ids.includes(COOKIE)?[[{id:COOKIE,points:6}],[{id:KISSES,points:6}]]:[[{id:KISSES,points:9}],[{id:KISSES,points:6}]]]);
  const hasSpit=ids.includes(SPIT),cookieFirst=first===COOKIE;
  if(!hasSpit){w.a.x=0;w.a.y=5;w.t.x=8;w.c.cooldowns[0]=cookieFirst?0:1.5;w.a.cooldowns.fill(99999,1);w.a.cooldowns[0]=cookieFirst?1.5:0;}
  else{w.a.x=-6;w.a.y=0;w.b.units[2].x=-5;w.b.units[2].y=0;w.t.x=8;w.c.cooldowns[0]=first===SPIT?2:0;w.c.cooldowns.fill(99999,1);w.a.cooldowns[0]=99999;const gobble=w.a.skills.findIndex(s=>s?.id===GOBBLE),spit=w.a.skills.findIndex(s=>s?.id===SPIT);w.a.cooldowns[gobble]=first===SPIT?0:1.5;w.a.cooldowns[spit]=0;}
  w.step(hasSpit?5:4.7);return w;
 }
 it.each([[COOKIE,KISSES,15],[KISSES,COOKIE,25],[COOKIE,SPIT,15],[SPIT,COOKIE,50],[KISSES,SPIT,25],[SPIT,KISSES,50]] as const)('LS-MG01 first%s then%s keeps first-provider half-second damage%s without a second stacked burn',(first,second,amount)=>{
  const w=pair(first,second),hits=burnHits(w);expect(casts(w,first).length).toBeGreaterThan(0);expect(casts(w,second).length).toBeGreaterThan(0);expect(hits.length).toBeGreaterThan(2);expect(hits.every(h=>h.skill===first&&h.amount===amount)).toBe(true);
  for(let i=1;i<hits.length;i++)expect(hits[i].time-hits[i-1].time).toBeCloseTo(.5);
 });
 it('LS-MG02 genuine Super Chakra purge removes the old burn run and the surviving Cookie puddle reapplies a new immediate run',()=>{
  const w=world([[{id:COOKIE,points:6}]],[[{id:CH,points:6}]]);w.a.x=-10;w.t.x=8;w.t.mana=0;w.t.cooldowns[0]=2;w.step(4.7);
  const purge=casts(w,CH,w.t)[0],hits=burnHits(w);expect(purge).toBeDefined();expect(hits.some(h=>h.time<purge.time)).toBe(true);expect(hits.filter(h=>h.time>purge.time).map(h=>h.amount)).toEqual([15,15]);
  const marks=w.b.events.filter(e=>e.type==='status'&&e.status==='magmaBurn'&&e.target===w.t.id);expect(marks.some(e=>e.time>purge.time)).toBe(true);expect(w.t.statuses.some(s=>s.kind==='magmaBurn'&&((s as EffectStatus).data as Record<string,unknown>|undefined)?.magmaId===2)).toBe(true);
 });
 it('LS-MG03 real Finger death stops the Kisses channel but already released pools continue their attributed half-second damage',()=>{
  const w=world([[{id:KISSES,points:3}]],[[{id:FINGER,points:3}]]);w.c.hp=1;w.a.x=15;w.a.y=10;w.t.x=8;w.t.cooldowns[0]=1.4;w.step(6);const death=w.b.events.find(e=>e.type==='death'&&e.target===w.c.id)!;
  expect(w.c.dead).toBe(true);expect(death).toBeDefined();expect(burnHits(w).filter(e=>e.time>death.time).length).toBeGreaterThan(3);expect(burnHits(w).every(e=>e.source===w.c.id&&e.skill===KISSES&&e.amount===15)).toBe(true);
 });
});

describe('Native Greater Treant variance and AA Jingu profession lineage',()=>{
 it('LS-TR01 genuine Super Greater Treant uses configured102–114 per-attack variance rather than fixed108',()=>{
  const w=world([[{id:NC,points:6}]]);until(w,()=>casts(w,NC).length>0);w.c.cooldowns.fill(99999);const tree=w.b.units.find(u=>u.owner===w.c.id)!;tree.x=3;tree.y=0;tree.facing=0;tree.moveSpeed=0;tree.nextAttack=w.b.time;
  for(const other of w.b.units.filter(u=>u.owner===w.c.id&&u!==tree)){other.nextAttack=99999;other.moveSpeed=0;other.x=-15;other.y=-10;}w.step(20);
  const raw=UNIT_CONFIG.npc_dota_furion_treant_large,values=w.b.events.filter(e=>e.type==='hit'&&e.source===tree.id&&e.target===w.t.id).map(e=>Number(e.amount));expect(tree.attackMin).toBe(raw.AttackDamageMin);expect(tree.attackMax).toBe(raw.AttackDamageMax);expect(values.length).toBeGreaterThan(8);expect(new Set(values).size).toBeGreaterThan(1);expect(values.every(n=>n>=102&&n<=114)).toBe(true);
 });
 it('LS-TR03 genuine Gaben ally Finger kill creates a corpse-location Greater Treant with the same native attack range',()=>{
  const w=world([[{id:NC,points:9}],[{id:FINGER,points:3}]]);w.c.cooldowns.fill(99999);w.t.hp=1;until(w,()=>w.t.dead);const bodies=w.b.units.filter(u=>u.owner===w.c.id);expect(bodies).toHaveLength(1);expect(bodies[0].nativeTemplateId).toBe('npc_dota_furion_treant_large');expect(bodies[0].attackMin).toBe(102);expect(bodies[0].attackMax).toBe(114);const placed=w.b.events.find(e=>e.type==='move'&&e.source===bodies[0].id&&e.movementKind==='warp');expect(placed?.toX).toBe(w.t.x);expect(placed?.toY).toBe(w.t.y);
 });
 it('LS-TR02 ordinary AA Treants keep the locked42 fixed damage and do not borrow Greater Treant variance',()=>{
  const w=world([[{id:NC,points:3}]]);until(w,()=>casts(w,NC).length>0);for(const tree of w.b.units.filter(u=>u.owner===w.c.id)){expect(tree.attack).toBe(42);expect(tree.attackMin).toBeUndefined();expect(tree.attackMax).toBeUndefined();expect(tree.nativeTemplateId).toBe('npc_dota_furion_treant_4');}
 });
 it('LS-JG02 existing clone attributes remain a snapshot while a later soldier copies genuine Glaives intelligence gain',()=>{
  const glaives='custom_silencer_glaives_of_wisdom',w=world([[{id:J,points:9},{id:glaives,points:3}]]);w.c.nextAttack=2.4;w.c.range=6;w.step(2.05);const old=w.b.units.find(u=>u.extraJinguSoldier)!,intelligence=old.intelligence;until(w,()=>Number(w.c.intelligence)>Number(intelligence),5);w.c.nextAttack=99999;expect(old.intelligence).toBe(intelligence);until(w,()=>w.b.units.filter(u=>u.extraJinguSoldier).length>=2,5);const newest=w.b.units.filter(u=>u.extraJinguSoldier).at(-1)!;expect(newest.intelligence).toBe(w.c.intelligence);expect(newest.intelligence).toBeGreaterThan(Number(old.intelligence));
 });
 it.each(['assassin','archer','mage','tank'] as const)('LS-JG01 actual%s Jingu soldier remains a profession clone with copied attributes and existing role art',role=>{
  const w=world([[{id:J,points:9}]],[],role);w.step(2.05);const soldier=w.b.units.find(u=>u.extraJinguSoldier)!;expect(soldier).toBeDefined();expect(soldier.heroClone).toBe(true);expect(soldier.illusion).toBe(false);expect(soldier.nativeTemplateId).toBeUndefined();expect(soldier.role).toBe(w.c.role);expect(soldier.skin).toBe(w.c.skin);
  expect([soldier.strength,soldier.agility,soldier.intelligence]).toEqual([w.c.strength,w.c.agility,w.c.intelligence]);expect(soldier.attack).toBe(w.c.attack+15);expect(soldier.hp).toBe(1);expect(soldier.maxHp).toBe(1);expect(soldier.armor).toBe(0);expect(soldier.attackInterval).toBe(1.2);expect(soldier.attackPoint).toBeCloseTo(.36);expect(soldier.attackBackswing).toBeCloseTo(.84);expect(soldier.attackCapability).toBe(['mage','archer'].includes(role)?'ranged':'melee');
  expect(bodyPresentation(assets,soldier,'idle',w.b.time).clip?.name??JSON.stringify(bodyPresentation(assets,soldier,'idle',w.b.time))).toContain('soldier_idle');expect(JSON.stringify(bodyPresentation(assets,soldier,'attack',w.b.time))).toContain('soldier_attack');expect(basicAttackClip(assets,soldier,w.b.time)).toBeDefined();
 });
});

import {BATTLE_CONFIG,skillBalance,UNIT_CONFIG} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const STEP=1/30,EDGE='centaur_double_edge',SLAVE='custom_lina_dragon_slave',DUEL='custom_legion_commander_duel',SPLITTER='elder_titan_earth_splitter',SHOCK='custom_ursa_earthshock';
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const has=(c:C,u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>c.battle.time);
const hero=(u:CombatUnit)=>!u.summoned||!!u.illusion||!!u.heroClone;
const eligibleArea=(c:C,u:CombatUnit,pierces=false)=>!u.dead&&u.side!==c.caster.side&&!u.ward&&!u.building&&!has(c,u,'invulnerable')&&!has(c,u,'banished')&&(pierces||!has(c,u,'magicImmune'));

/** Final AA overrides with pinned2023 mechanisms. The ledger distinguishes
 * proven native rules from AA-only upgrades and retained project choices. */
export function applyEdgeEarthAcceptance(registry:Record<string,SkillProgram>):void {
 const edge=registry[EDGE];edge.target='enemy';edge.pointTarget=false;edge.castPoint=.3;edge.backswing=.5;
 const edgeStacks=(c:C)=>c.caster.statuses.filter(s=>s.skill===EDGE&&s.source===c.caster.id&&s.kind==='strengthPct'&&s.until>c.battle.time);
 const edgeRegen=(c:C)=>{
  c.caster.statuses=c.caster.statuses.filter(s=>!(s.skill===EDGE&&s.source===c.caster.id&&s.kind==='regen'));
  const stacks=edgeStacks(c);if(!G(c)||!stacks.length||c.caster.dead)return;
  const interval=Math.max(STEP,v(c,'REGEN UPDATE INTERVAL',.1));
  c.status(c.caster,'regen',interval+STEP,c.caster.maxHp*v(c,'REGEN PER STACK',.5)/100*stacks.length,{dispel:'none'});
 };
 edge.init=c=>{if(!G(c))return;const pulse=()=>{if(c.caster.dead||c.battle.finished)return;edgeRegen(c);c.delay(Math.max(STEP,v(c,'REGEN UPDATE INTERVAL',.1)),pulse);};pulse();};
 edge.onStatusRemoved=(c,status)=>{if(status.kind==='strengthPct')edgeRegen(c);};
 edge.cast=c=>{
  const radius=(v(c,'RADIUS',220)+(!configured(c)&&S(c)?200:0))/100;
  const targets=c.battle.units.filter(t=>eligibleArea(c,t)&&distance(t,c.target)<=radius);
  if(S(c)){
   for(const t of targets){c.status(t,'slow',v(c,'SLOW DURATION',2),v(c,'MOVEMENT SLOW',25)/100,{harmful:true,dispel:'basic'});c.status(t,'attackSpeedPct',v(c,'SLOW DURATION',2),-v(c,'ATTACK SLOW',25)/100,{harmful:true,dispel:'basic'});}
   const count=targets.filter(t=>hero(t)&&!t.illusion).length,seconds=v(c,'STRENGTH DURATION',15);
   for(const stack of edgeStacks(c))stack.until=c.battle.time+seconds;
   for(let i=0;i<count;i++)c.status(c.caster,'strengthPct',seconds,v(c,'STRENGTH PER STACK',30)/100,{maxStacks:v(c,'MAX STACKS',5),removeOnDeath:true,dispel:'basic',data:{attributeHealthMode:'doubleEdge'}});
  }
  const damage=v(c,'DAMAGE')+Number(c.caster.strength??0)*Math.abs(v(c,'STRENGTH DAMAGE'))/100;
  for(const target of targets)c.damage(target,damage,'magical',false);
  if(!G(c))c.damage(c.caster,damage,'magical',true,{flags:{nonLethal:true}});
  else edgeRegen(c);
 };
 edge.implemented=['Target-centered220radius and AA+200Super radius','All eligible hero/clone strength stacks and slows precede every damage instance','AA30% total-strength stacks cap5 and refresh together; current HP is unchanged by strength gain/removal','Magical nonlethal self damage pierces own spell immunity; Gaben removes it and regenerates0.5%maxHP per stack','300ms point/500ms recovery with AA increased250cast-range candidate'];
 edge.remaining=['Strength-derived passive health regeneration is not implemented by the project attribute conversion','AA cast-range250 is inferred from native150 plus official AA+100 change note; no AA spell KV recovered','Gaben percent regeneration resamples current maximum HP every configurable100ms; exact original AA sampling cadence is unrecovered'];

 const slave=registry[SLAVE];slave.target='enemy';slave.pointTarget=true;slave.castPoint=.45;slave.backswing=.38;
 const dragon=(c:C,x:number,y:number)=>{
  const raw=UNIT_CONFIG.npc_dota_neutral_black_dragon,life=v(c,'DRAGON DURATION',120),skills=['black_dragon_fireball','black_dragon_splash_attack','black_dragon_dragonhide_aura'];
  const template={...c.caster,skills:skills.map(id=>({id,points:3}))};
  const body=c.summon({name:'霸主黑龙',count:1,hp:Math.max(v(c,'DRAGON MIN HEALTH',1800),raw.StatusHealth),attack:(raw.AttackDamageMin+raw.AttackDamageMax)/2+v(c,'DRAGON BONUS DAMAGE',80),armor:raw.ArmorPhysical+v(c,'DRAGON BONUS ARMOR',8),range:raw.AttackRange/100,interval:raw.AttackRate,speed:v(c,'DRAGON MOVE SPEED',400)/100,lifetime:life,nativeTemplateId:'npc_dota_neutral_black_dragon',template,inheritsSkills:true,initializeInherited:true})[0];
  body.ancient=true;body.magicResist=raw.MagicalResistance/100;body.mana=body.maxMana=raw.StatusMana;
  c.status(body,'regen',life,raw.StatusHealthRegen+v(c,'DRAGON BONUS HEALTH REGEN',12),{dispel:'none'});
  c.status(body,'manaRegen',life,raw.StatusManaRegen+v(c,'DRAGON BONUS MANA REGEN',4)-BATTLE_CONFIG.baseManaRegen,{dispel:'none'});
  c.status(body,'fly',life,1,{dispel:'none'});c.warp(body,x,y);
 };
 slave.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,angle=Math.atan2(point.y-origin.y,point.x-origin.x),length=v(c,'TRAVEL DISTANCE',1075)/100;let count=0;
  c.linearProjectile({origin,angle,distance:length,speed:v(c,'PROJECTILE SPEED',1200)/100,width:v(c,'START RADIUS',275)/100,endWidth:v(c,'END RADIUS',200)/100,effect:t=>{
   if(!eligibleArea(c,t))return;
   c.damage(t,v(c,'DAMAGE')+(!configured(c)&&S(c)?150:0)+(S(c)?count*v(c,'STACK DAMAGE',50):0),'magical',false);count++;
  },onEnd:()=>{if(G(c))dragon(c,origin.x+Math.cos(angle)*length,origin.y+Math.sin(angle)*length);}});
 };
 slave.implemented=['450ms cast point/380ms recovery; historical800cast range and1075travel are separate','1200-speed linearly tapering275-to200radius wave, invisible targets included and each body hit once','AA final460Super/Gaben base damage plus50for each previously affected unit within that cast','Gaben spawns a native-profile Black Dragon at the wave endpoint, with native skills and additive Overlord+80damage/+8armor/+12HPregen/+4manaRegen'];
 slave.remaining=['AA stacking damage is retained per wave; persistent cross-cast interpretation lacks original Lua evidence','120-second dragon lifetime is the retained project policy; AA does not publish its duration','Dragon native skill combinations retain their existing reference coverage, not a full independent child-skill acceptance'];

 const duel=registry[DUEL];duel.target='enemy';duel.pointTarget=false;duel.castPoint=.3;duel.backswing=0;
 const pairKey=(s:EffectStatus)=>String(s.data?.duelKey??'');
 const clearPair=(c:C,key:string)=>{if(!key)return;for(const unit of c.battle.units)unit.statuses=unit.statuses.filter(s=>pairKey(s as EffectStatus)!==key);};
 duel.targetEligibility=(c,t)=>t.side!==c.caster.side&&hero(t)&&!t.ward&&!t.building&&(c.canTarget?.(t)??!t.dead);
 duel.targetSelector=(c,targets)=>targets.filter(t=>duel.targetEligibility!(c,t)).sort((a,b)=>Number(!!a.illusion)-Number(!!b.illusion)||distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 duel.cast=c=>{
  const seconds=v(c,'DURATION')+(!configured(c)&&S(c)?1:0),key=`${c.caster.id}:${c.skill.id}:${c.battle.time}`,externalReduction=G(c)?v(c,'EXTERNAL DAMAGE REDUCTION',80)/100:0;
  for(const [unit,partner]of[[c.caster,c.target],[c.target,c.caster]])c.status(unit,'duel',seconds,1,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,data:{targetId:partner.id,externalReduction,duelKey:key,breakDistance:v(c,'BREAK DISTANCE',2000)/100,duelRules:true}});
  if([c.caster,c.target].every(unit=>unit.statuses.some(s=>pairKey(s as EffectStatus)===key)))addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'challenge',kind:'burst',x:(c.caster.x+c.target.x)/2,y:(c.caster.y+c.target.y)/2,angle:Math.atan2(c.target.y-c.caster.y,c.target.x-c.caster.x),until:c.battle.time+16/24});
 };
 duel.onStatusRemoved=(c,s)=>{if(s.kind==='duel')clearPair(c,pairKey(s));};
 duel.onUnitDeath=c=>{
  const status=(c.caster.statuses as EffectStatus[]).find(s=>s.kind==='duel'&&s.skill===DUEL&&s.source===c.caster.id&&s.until>c.battle.time&&s.data?.targetId===c.target.id);
  if(!status)return;
  if(!c.target.illusion&&!c.target.tempestDouble&&!c.target.consideredHero){const gain=v(c,'REWARD DAMAGE')+(!configured(c)&&S(c)?10:0),key=`${DUEL}:attack`,state=(c.caster.skillState??={})as Record<string,number>,gains=(c.caster.permanentSkillGains??={})as Record<string,number>;state[key]=(state[key]??0)+gain;gains[key]=(gains[key]??0)+gain;c.caster.attack+=gain;addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'victory',kind:'burst',x:c.caster.x,y:c.caster.y,until:c.battle.time+28/24});}
  clearPair(c,pairKey(status));
 };
 duel.implemented=['AA mutually forced hero/illusion attacks; no opposing winner reward and no spellcasting','300ms point/zero recovery; final Super duration/range/reward/cooldown consumed once','AA Strong dispel or natural expiry cleans both linked duel states','Gaben80% external incoming reduction; ordinary duel-partner damage is excluded','Caster earns permanent flat damage on eligible opponent death, including third-party kills, and never on illusions/creep-heroes/TempestDouble'];
 duel.remaining=['Meepo death propagation and TempestDouble identity require explicit clone-family modeling','Native victory automatic Press the Attack interaction is not yet verified against AA attack-modifier override','Reflected Duel, Soulbind multi-duel and TrueSight-immune/Swallow/Supernova termination require scoped combination evidence'];

 const splitter=registry[SPLITTER];splitter.target='enemy';splitter.pointTarget=true;splitter.castPoint=.4;splitter.backswing=.73;
 splitter.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},target=c.castPosition??c.target,angle=Math.atan2(target.y-origin.y,target.x-origin.x),dx=Math.cos(angle),dy=Math.sin(angle),length=v(c,'CRACK LENGTH')/100,width=(v(c,'CRACK WIDTH')+(!configured(c)&&S(c)?75:0))/100,damagePct=(v(c,'MAX HP AS DAMAGE')+(!configured(c)&&S(c)?10:0))/100;
  c.delay(v(c,'IMPLODE DELAY'),()=>{
   for(const unit of c.battle.units.filter(t=>eligibleArea(c,t,true)&&!t.ancient)){
    const along=Math.max(0,Math.min(length,(unit.x-origin.x)*dx+(unit.y-origin.y)*dy)),center={x:origin.x+dx*along,y:origin.y+dy*along};
    if(distance(unit,center)>width)continue;
    c.warp(unit,center.x,center.y);c.interrupt?.(unit);
    c.status(unit,'slow',v(c,'SLOW DURATION'),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,piercesImmunity:true,dispel:'basic'});
    if(G(c)){c.status(unit,'baseArmorPct',v(c,'SLOW DURATION'),-v(c,'BASE ARMOR REDUCTION',100)/100,{harmful:true,piercesImmunity:true,dispel:'basic'});c.status(unit,'baseMagicResistPct',v(c,'SLOW DURATION'),-v(c,'BASE MAGIC RESISTANCE REDUCTION',100)/100,{harmful:true,piercesImmunity:true,dispel:'basic'});}
    const damage=unit.maxHp*damagePct;c.damage(unit,damage/2,'magical',true);c.damage(unit,damage/2,'physical',true);
   }
  });
 };
 splitter.implemented=['Frozen2400AA ground line and2.718-second implosion delay; .4/.73public animation','Ancient creeps excluded; ordinary invisible/spell-immune bodies included','Instant offensive pull to the crack center and Stop precede debuffs, magical half damage then physical half damage','Final Super50%maximum-health damage/300width/40second cooldown consumed once','Gaben100%base armor/base magic resistance reduction precedes its own damage, while bonus defenses remain'];
 splitter.remaining=['Native per-cell pull geometry versus continuous projection needs executable original evidence; present projection retains AA full2400length','AA magical-resistance wording is interpreted through historical Natural Order base-resistance prototype; exact AA Lua unavailable','Native fog vision and tree destruction have no arena counterparts'];

 const shock=registry[SHOCK];shock.target='self';shock.pointTarget=false;shock.requiresFacing=false;shock.castPoint=0;shock.backswing=0;shock.canCast=c=>c.enemies().some(t=>distance(t,c.caster)<=v(c,'RADIUS')/100+v(c,'LEAP DISTANCE',400)/100);
 shock.cast=c=>{
  const jump=(body:CombatUnit,main:boolean)=>{
   let landed=false;
   const landing=()=>{
    if(landed)return;landed=true;if(body.dead)return;
    const radius=(main?v(c,'RADIUS')+(!configured(c)&&S(c)?500:0):v(c,'ALLY RADIUS',385))/100;
    for(const unit of c.battle.units.filter(t=>eligibleArea(c,t)&&distance(t,body)<=radius)){
     c.status(unit,'slow',v(c,'SLOW DURATION',3),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,dispel:'basic'});c.status(unit,'attackSpeed',v(c,'SLOW DURATION',3),v(c,'ATTACK SLOW'),{harmful:true,dispel:'basic'});
     c.damage(unit,v(c,'DAMAGE')*(main?1:v(c,'ALLY DAMAGE PERCENT',50)/100),'magical',false);
    }
    if(main&&S(c)){
     const seconds=v(c,'ENRAGE DURATION',1.5),extend=(kind:string,value:number)=>{const existing=body.statuses.find(s=>s.kind===kind&&s.source===body.id&&(s.skill===SHOCK||s.skill==='ursa_enrage')&&s.until>c.battle.time);if(existing)existing.until+=seconds;else c.status(body,kind,seconds,value,{dispel:'none'});};
     extend('damageReduction',v(c,'ENRAGE DAMAGE REDUCTION',80)/100);extend('statusResistance',v(c,'ENRAGE STATUS RESISTANCE',50)/100);
    }
   };
   c.interrupt?.(body);
   if(has(c,body,'root')||has(c,body,'soulbind')||has(c,body,'leash')){landing();return;}
   const duration=v(c,'LEAP DURATION',.25),leapDistance=v(c,'LEAP DISTANCE',400)/100;
   c.status(body,'phased',duration,1,{dispel:'none'});
   if(!c.moveContinuous(body,body.x+Math.cos(body.facing)*leapDistance,body.y+Math.sin(body.facing)*leapDistance,{duration,lockActions:false,ignoreBarriers:true,cancelOnRoot:true,onEnd:landing}))landing();
  };
  jump(c.caster,true);
  if(G(c))for(const ally of c.allies().filter(t=>t.id!==c.caster.id&&hero(t)&&!t.illusion))jump(ally,false);
 };
 shock.implemented=['Instant no-target release, fixed400AA units along each acting hero facing,250ms continuous airborne movement','Leap permits turning/attacks/spells and passes units/terrain; root/leash ends it with impact at current position','Debuffs precede damage; AA three-second movement and flat attack-speed slows','Super final885radius and1.5-second80%damage-reduction/50%status-resistance Enrage without an active-Enrage strong dispel','Gaben other allied heroes perform their own base-radius half-damage leap, without Super radius or Enrage'];
 shock.remaining=['AA Gaben delegated caster attribution and spell-amplification ownership are unrecovered; current damage retains original caster attribution','Native root/leash source-specific edge cases and inherited Fury Swipes talent are outside this AA upgrade specification'];
}

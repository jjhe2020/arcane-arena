import {skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const REBUKE='mars_gods_rebuke',CHILL='custom_visage_grave_chill',GROW='tiny_grow',ANGEL='custom_omniknight_guardian_angel',GUST='custom_drow_ranger_wave_of_silence';
const FOREVER=1_000_000,STEP=1/30;
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const data=(c:C)=>({ownerInstance:identity(c),instanceKey:identity(c)});
const own=(c:C,t:CombatUnit,kind:string)=>statuses(t).find(s=>s.kind===kind&&s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===identity(c)&&s.until>c.battle.time+1e-8);
const body=(t:CombatUnit)=>!t.dead&&!has(t,'banished')&&!has(t,'invulnerable');
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const direction=(from:{x:number;y:number},to:{x:number;y:number})=>{const n=distance(from,to);return n>1e-9?{x:(to.x-from.x)/n,y:(to.y-from.y)/n}:{x:0,y:0};};
function knockback(c:C,t:CombatUnit,kind:string,to:{x:number;y:number},seconds:number):void{
 const key=`${c.skill.id}:${identity(c)}:sequence`,generation=Number(c.caster[key]??0)+1;c.caster[key]=generation;
 c.status(t,kind,seconds,0,{harmful:true,dispel:'basic',removeOnDeath:true,data:{...data(c),generation}});
 const marker=own(c,t,kind);if(!marker)return;
 if(!c.moveContinuous(t,to.x,to.y,{duration:marker.until-c.battle.time,lockActions:false,ignoreTerrainBarriers:c.skill.id===GUST})){t.statuses=t.statuses.filter(s=>s!==marker);return;}
 const controller=c.motionActive?.(t),startedAt=controller?.startedAt??-1,controllerOwner=controller?.owner??'';
 marker.data={...marker.data,motionStartedAt:startedAt,motionOwner:controllerOwner};
 const check=()=>{const active=own(c,t,kind);if(active?.data?.generation!==generation)return;const motion=c.motionActive?.(t);if(has(t,'magicImmune')&&motion?.skill===c.skill.id&&motion.owner===controllerOwner&&motion.startedAt===startedAt){c.cancelMotion?.(t);t.statuses=t.statuses.filter(s=>s!==active);return;}if(c.battle.time<marker.until-1e-8)c.delay(STEP,check);};c.delay(STEP,check);
}
function motionRemoved(c:C,status:EffectStatus):void{
 if(!['gustKnockback','rebukeKnockback'].includes(status.kind))return;
 const motion=c.motionActive?.(c.target);if(motion?.skill===c.skill.id&&motion.owner===status.data?.motionOwner&&motion.startedAt===status.data?.motionStartedAt)c.cancelMotion?.(c.target);
}

/** AA values and explicit upgrades take precedence. Version-specific native
 * prototypes and unresolved custom compositions are recorded in god-gust.json. */
export function applyGodGustAcceptance(registry:Record<string,SkillProgram>):void{
 const rebuke=registry[REBUKE];
 rebuke.requiresFacing=c=>!has(c.caster,'facingLock');rebuke.range=c=>v(c,'DISTANCE',500)/100;
 rebuke.backswing=1.07;
 rebuke.cast=c=>{
  const facing={x:Math.cos(c.caster.facing),y:Math.sin(c.caster.facing)},cosine=Math.cos(v(c,'ANGLE',140)*Math.PI/360);
  const critical=(v(c,'CRITICAL DAMAGE')+(!compiled(c)&&c.skill.points>=6?65:0))/100;
  for(const t of c.enemies().filter(t=>distance(t,c.caster)<=v(c,'DISTANCE')/100&&(()=>{const d=direction(c.caster,t);return d.x*facing.x+d.y*facing.y>=cosine;})())){
   // Conditional hero damage shares the attack packet but is not multiplied by
   // either the ensured critical or a stronger selected critical.
   const hero=!t.summoned||t.illusion||t.heroClone||t.nativeTemplateId==='npc_dota_lone_druid_bear';
   c.attack(t,1,true,undefined,true,{criticalMultiplier:critical,postCriticalBonus:hero?v(c,'BONUS DAMAGE VS HEROES'):0,trueStrike:true,noCleave:true,allowInvisibleTarget:true});
   if(t.dead)continue;
   const seconds=v(c,'KNOCKBACK DURATION',.3),away=direction(c.caster,t),start={x:t.x,y:t.y};
   if(!has(t,'magicImmune')&&!t.statuses.some(s=>s.kind==='spearImpaled'||s.kind==='mars_spear_impale_stun'||(s.kind==='stun'&&s.skill==='custom_mars_spear_of_mars')))knockback(c,t,'rebukeKnockback',{x:start.x+away.x*v(c,'KNOCKBACK DISTANCE',150)/100,y:start.y+away.y*v(c,'KNOCKBACK DISTANCE',150)/100},seconds);
   c.status(t,'slow',v(c,'KNOCKBACK SLOW DURATION')+(!compiled(c)&&c.skill.points>=6?1.5:0),v(c,'KNOCKBACK SLOW')/100,{harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)});
   if(c.skill.points>=9){c.status(t,'stun',v(c,'GABEN STUN',1),0,{harmful:true,dispel:'strong',removeOnDeath:true,data:data(c)});c.status(t,'break',v(c,'GABEN BREAK',1),0,{harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)});}
  }
 };
 rebuke.onStatusRemoved=motionRemoved;
 rebuke.implemented=['AA five-rank ensured critical and conditional hero attack packet','True Strike, disarm-independent invisible-body cone attacks, no cleave','Current-facing140degree sector and non-disabling continuous knockback','Super crit/slow/CD finals and Gaben stun/break'];
 rebuke.remaining=['Exact2023 attack/knockback/slow order has conflicting retained Wiki prose; attack-first candidate used','AA Gaben stun/break native upgrade provenance unspecified','Specific skill-wall and Spear modifier aliases require further combinations'];

 const chill=registry[CHILL];chill.backswing=.57;
 chill.cast=c=>{
  const seconds=v(c,'DURATION'),attack=v(c,'ATTACK SPEED DRAIN'),move=v(c,'MOVE SPEED DRAIN')/100;
  const harmful:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)};
  c.status(c.target,'attackSpeed',seconds,-attack,harmful);c.status(c.target,'slow',seconds,move,harmful);
  if(c.skill.points>=6)c.status(c.target,'disarm',seconds,0,harmful);
  const targets=c.allies().filter(t=>!has(t,'banished')&&!t.ward&&!t.building&&(t.id===c.caster.id||(t.owner===c.caster.id&&distance(t,c.caster)<=v(c,'SUMMON RADIUS',900)/100)||(c.skill.points>=9&&distance(t,c.caster)<=v(c,'ALLY RADIUS',500)/100)));
  for(const t of targets){const options:Partial<EffectStatus>={dispel:'basic',removeOnDeath:true,data:data(c)};c.status(t,'attackSpeed',seconds,attack,options);c.status(t,'haste',seconds,move,options);}
 };
 chill.implemented=['Independent immediate six-second positive and negative modifiers','AA all controlled summon types within nearby900 snapshot; invulnerable recipients included, hidden excluded','Basic Dispel independence and source-block prevents all buffs','Super disarm/CD final and Gaben500allied recipients'];
 chill.remaining=['Exact captured-AA controlled-summon radius is omitted; native900 candidate adopted','Multi-caster drain stacking and Gaben invulnerable-allied eligibility lack precise historical AA evidence'];

 const grow=registry[GROW];
 grow.init=c=>{
  // Native Grow increases white/base attack damage, so Empower/Totem can use
  // the increased base. Illusion initialization restores copied totals later.
  c.caster.attack+=v(c,'BONUS DAMAGE')+(!compiled(c)&&c.skill.points>=6?51:0);
  const base:Partial<EffectStatus>={passive:false,dispel:'none',data:data(c)};
  c.status(c.caster,'armor',FOREVER,v(c,'BONUS ARMOR'),base);
  const loss=compiled(c)?v(c,'ATTACK SPEED REDUCTION'):(c.skill.points<6?v(c,'ATTACK SPEED REDUCTION'):0);
  if(loss)c.status(c.caster,'attackSpeedPct',FOREVER,loss/100,base);
  c.status(c.caster,'growTossBonus',FOREVER,v(c,'TOSS BONUS DAMAGE'),base);
  if(c.skill.points>=9)c.status(c.caster,'statusResistance',FOREVER,v(c,'BELCH STATUS RESIST',30)/100,{passive:true,dispel:'none',data:data(c)});
 };
 grow.onAttacked=c=>{const probability=v(c,'BELCH CHANCE',30)/100;if(c.skill.points>=9&&body(c.target)&&(c.chance?c.chance(probability,'belchExterior'):c.random()<probability))c.status(c.target,'stun',v(c,'BELCH STUN',2),0,{harmful:true,dispel:'strong',removeOnDeath:true,data:data(c)});};
 grow.implemented=['AA base damage/armor and total attack-speed percentage loss','Native base Grow survives Break; Super removes percentage loss and adds51damage','Real Toss bonus consumer in one combined landing packet','AA Gaben status resistance and any-unit landed-attack retaliation'];
 grow.remaining=['AA retained Toss actor1.3 combined with post7.31 Grow bonus: bonus-before1.3 is an explicit working candidate','Belch uses native7.00PRD prototype; exact AA PRD, illusion, Break and attacker-immunity qualifications need primary implementation evidence','Tree bonus has no Tree Grab/Volley consumer in the current catalog; environment branch not fabricated'];

 const angel=registry[ANGEL];angel.target='self';angel.requiresFacing=false;angel.backswing=1.07;
 angel.cast=c=>{
  const seconds=v(c,'DURATION')+(!compiled(c)&&c.skill.points>=6?1:0),radius=compiled(c)?v(c,'RADIUS')/100:(c.skill.points>=6?100:v(c,'RADIUS')/100);
  for(const t of c.allies().filter(t=>body(t)&&!t.ward&&!t.building&&!t.courier&&distance(t,c.caster)<=radius)){
   const options:Partial<EffectStatus>={dispel:'basic',removeOnDeath:true,data:data(c)};
   c.status(t,'physicalImmune',seconds,0,options);
   if(c.skill.points>=6)c.status(t,'regen',seconds,v(c,'HEALTH REGEN',40),options);
   if(c.skill.points>=9)c.status(t,'guardianRetaliation',seconds,v(c,'RETALIATION CHANCE',15)/100,{...options,data:{...data(c),hammerLevel:4}});
  }
 };
 angel.implemented=['Old NoTarget Guardian Angel with AA2/3/4second physical immunity','Snapshot radius700 and exclusion of wards/buildings/couriers/hidden/invulnerable units','Super global/+1second/40regen/CD60 finals','Gaben protected actual actor free native Hammer4, parent attribution and removable lifetime'];
 angel.remaining=['AA global upgrade does not explicitly inherit native Scepter hidden/building eligibility; base eligibility retained','Exact free retaliation Spell Block, attack-modifier-suppressed attacks and simultaneous Guardian proc stacking require AA evidence','Historical physical-immunity damage-event hook suppression is distinct from effective-zero statistics'];

 const gust=registry[GUST];gust.pointTarget=true;gust.backswing=.6;
 gust.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},cursor=c.castPosition??c.target,angle=Math.atan2(cursor.y-origin.y,cursor.x-origin.x),seconds=v(c,'SILENCE DURATION');
  c.status(c.caster,'haste',seconds,v(c,'SELF MOVE SPEED',10)/100,{dispel:'basic',removeOnDeath:true,data:data(c)});
  const width=(v(c,'WIDTH')+(!compiled(c)&&c.skill.points>=6?250:0))/100,seen=new Set<string>();
  const affect=(t:CombatUnit)=>{
   if(seen.has(t.id)||!body(t)||t.ward||t.building||has(t,'magicImmune'))return;seen.add(t.id);
   c.status(t,'silence',seconds,0,{harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)});
   if(c.skill.points>=9)c.status(t,'blind',seconds,v(c,'BLIND',100)/100,{harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)});
   const length=distance(origin,t),away=direction(origin,t),max=v(c,'KNOCKBACK MAX')*(!compiled(c)&&c.skill.points>=9?2:1),push=length<1e-9?0:Math.max(1,Math.trunc(max-length*100*.5));
   if(push<=0)return;
   knockback(c,t,'gustKnockback',{x:t.x+away.x*push/100,y:t.y+away.y*push/100},v(c,'KNOCKBACK DURATION'));
  };
  c.linearProjectile({angle,distance:v(c,'CAST RANGE',900)/100,speed:v(c,'WAVE SPEED',2000)/100,width,effect:affect,onMove:position=>{for(const t of c.enemies())if(distance(t,position)<=width)affect(t);}});
 };
 gust.onStatusRemoved=motionRemoved;
 gust.implemented=['AA rank-dependent silence and non-disabling continuous knockback duration','2000speed swept wave with radius/endpoint geometry and invisible bodies','Super final500radius/CD10 and Gaben100blind/double maximum knockback','Basic Dispel and gained spell immunity cancel only the owned knockback controller'];
 gust.remaining=['AA omits native2023self10percent movement buff; native prototype retained explicitly pending','Gaben doubled maximum plus native.5/unit distance falloff is a working custom composition','Frozen launch-origin radial direction, special skill-barrier exceptions beyond terrain and precise2023SR qualification require further native evidence','No7.35TrueSight or7.41distance-dependent knockback duration imported'];
}

import {skillBalance} from '../config';
import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {applyMagmaBurn,magmaStatusRemoved} from './magma-burn';
import {addVisualProjectile,removeVisualProjectile} from './visual-state';

const COIL='custom_abaddon_death_coil',MOON='custom_luna_moon_glaive',KISSES='custom_snapfire_mortimer_kisses',MULTI='custom_drow_ranger_multishot',FLARE='custom_skywrath_mage_mystic_flare',SOLAR='aa_granted_solar_crest',GOBBLE='aa_granted_gobble_up',SPIT='aa_granted_spit_out',MARK='drow_ranger_marksmanship';
const STEP=1/30,FOREVER=1_000_000;
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[],has=(u:CombatUnit,k:string)=>u.statuses.some(s=>s.kind===k);
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const key=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id,data=(c:C)=>({ownerInstance:key(c),instanceKey:key(c)});
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const body=(u:CombatUnit)=>!u.dead&&!has(u,'invulnerable')&&!has(u,'banished')&&!u.hiddenSpellBody;
const hero=(u:CombatUnit)=>!u.ward&&!u.building&&!u.courier&&(!u.summoned||!!u.illusion||!!u.heroClone||!!u.consideredHero);
const visible=(c:C,u:CombatUnit)=>!has(u,'invisible')||has(u,'revealed')||!!c.canTarget?.(u,true);
const enemy=(c:C,u:CombatUnit)=>u.side!==c.caster.side&&body(u);
const unit=(c:C,u:CombatUnit)=>!u.dead&&!u.hiddenSpellBody&&!u.ward&&!u.building&&!u.courier;
const grant=(id:string,parent:string,levels=1):SkillDefinition=>({id,name:id===MARK?'射手天赋':'吐出',nameEn:id===MARK?'Marksmanship':'Spit Out',icon:`/art/icons/${parent}.webp`,description:id===MARK?'提供敏捷光环，并有概率使攻击获得额外伤害、必中及基础护甲忽略；附近有真实敌方英雄时暂时失效。':'将吞入的单位抛向目标区域，落地后造成伤害、眩晕，并留下燃烧区域。',descriptionEn:id===MARK?'Agility aura and conditional attack procs; disabled near real enemy heroes.':'Launches the carried unit; its actual landing damages and stuns nearby enemies and creates a burning area.',tags:[],super:'',gaben:'',values:[],cooldowns:[0],mana:[0],categories:[levels===3?'ABILITY: Passive':'ABILITY: Point Target'],passive:levels===3,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:parent,historicalSource:{id,maxLevel:levels,date:'2023-02-10; mechanism candidate20230215'}} as SkillDefinition);
export const MIST_FLARE_CHILD_DEFINITIONS=[grant(SPIT,KISSES),grant(MARK,MULTI,3)];
function puddle(c:C,p:{x:number;y:number},radius:number,duration:number,dps:number,slow:number):void{c.zone({...p,radius,duration,interval:v(c,'AURA INTERVAL',.5),immediate:true,includeEnd:true,effect:t=>{if(enemy(c,t))applyMagmaBurn(c,t,{damagePerSecond:dps,slow,interval:v(c,'BURN INTERVAL',.5),linger:v(c,'BURN LINGER',1)});}});}
interface Passenger {c:C;unit:CombatUnit;token:string;active:boolean;flying:boolean;until:number}
const passengers=new WeakMap<BattleState,Map<string,Passenger>>();
const parents=new WeakMap<BattleState,Map<string,C>>();
const holds=(c:C)=>{let m=passengers.get(c.battle);if(!m){m=new Map;passengers.set(c.battle,m);}return m;};
const release=(run:Passenger)=>{if(!run.active)return;run.active=false;run.unit.statuses=statuses(run.unit).filter(s=>s.data?.passengerToken!==run.token);holds(run.c).delete(run.c.caster.id);};
const ordinaryPassenger=(u:CombatUnit)=>!!u.summoned&&!u.illusion&&!u.heroClone&&!u.consideredHero;

export function applyMistFlareAcceptance(registry:Record<string,SkillProgram>):void{
 const coil=registry[COIL];coil.target='any';coil.backswing=.4;coil.spellBlockTiming='program';coil.projectileDisjointable=true;coil.projectileDisjointOnInvisibility=true;
 coil.targetEligibility=(c,t)=>unit(c,t)&&t.id!==c.caster.id&&!has(t,'banished')&&!has(t,'invulnerable')&&(t.side===c.caster.side||!has(t,'magicImmune'));
 coil.targetSelector=(c,ts)=>ts.filter(t=>t.side===c.caster.side&&t.hp<t.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||dist(a,c.caster)-dist(b,c.caster))[0]??ts.filter(t=>t.side!==c.caster.side).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster))[0];
 coil.cast=c=>{
  if(!S(c))c.damage(c.caster,v(c,'DAMAGE/HEAL')*v(c,'SELF DAMAGE')/100,'pure',true,{flags:{nonLethal:true}});
  const origin={x:c.caster.x,y:c.caster.y},targets=S(c)?c.battle.units.filter(t=>unit(c,t)&&t.id!==c.caster.id&&dist(t,c.target)<=v(c,'SUPER RADIUS',1000)/100&&!has(t,'banished')&&!has(t,'invulnerable')):[c.target];
  for(const target of targets)c.projectile(target,v(c,'PROJECTILE SPEED',1300)/100,t=>{
   if(t.dead||t.hiddenSpellBody)return;if(t.side!==c.caster.side&&(!body(t)||has(t,'magicImmune')||c.trySpellBlock?.(t)))return;
   if(t.side===c.caster.side)c.heal(t,v(c,'DAMAGE/HEAL'));else c.damage(t,v(c,'DAMAGE/HEAL'),'magical');
   if(G(c)){if(t.side!==c.caster.side)c.attack(t,1,true,undefined,true,{attackOrigin:origin});c.dispel(t,false,t.side===c.caster.side);c.castAbility(SOLAR,1,t);}
  },origin);
 };
 coil.implemented=['AA nonlethal pure self damage, cast-time independent AoE projectiles','Impact per-target SpellBlock/disjoint and ally hidden healing','AA enemy instant attacks/basic dispel and dated Solar target effects'];coil.remaining=['AA exact Solar owner inventory/cooldown penalty and ally instant-attack wording remain compatibility boundaries','Missing-health ally choice is deterministic AI policy'];
 const solar=registry[SOLAR];solar.cast=c=>{const t=c.target;if(!unit(c,t)||t.id===c.caster.id||t.side!==c.caster.side&&has(t,'magicImmune'))return;const ally=t.side===c.caster.side,sign=ally?1:-1,group=`solar:${ally?'buff':'debuff'}`;
  // Native equal-sign target modifiers refresh across providers; opposing signs
  // coexist. This free grant is a target effect, not an inventory item.
  t.statuses=statuses(t).filter(s=>s.data?.solarGroup!==group);const options:Partial<EffectStatus>={harmful:!ally,dispel:'basic',removeOnDeath:true,data:{solarGroup:group}};
  c.status(t,'armor',v(c,'DURATION',12),sign*v(c,'ARMOR',6),options);c.status(t,'attackSpeed',v(c,'DURATION',12),sign*v(c,'ATTACK SPEED',50),options);c.status(t,ally?'haste':'slow',v(c,'DURATION',12),v(c,'MOVEMENT SPEED',10)/100,options);
 };

 const moon=registry[MOON];moon.init=c=>{if(!G(c))return;for(const[k,p,n]of[['agility','BUTTERFLY AGILITY',35],['attackSpeed','BUTTERFLY ATTACK SPEED',30],['attackBonus','BUTTERFLY DAMAGE',25],['evasion','BUTTERFLY EVASION',35]] as const)c.status(c.caster,k,FOREVER,k==='evasion'?v(c,p,n)/100:v(c,p,n),{dispel:'none',passive:false,removeOnDeath:false,data:data(c)});};
 moon.onAttack=c=>{
  const amount=Number(c.attackRecord?.mainDamageSnapshot?.damage??c.baseAttackDamage??c.caster.attack),count=v(c,'BOUNCES')+(!configured(c)&&S(c)?1:0),factor=1-(v(c,'DAMAGE REDUCTION PER BOUNCE')-(!configured(c)&&S(c)?8:0))/100,speed=Number(c.attackRecord?.data.projectileSpeed??c.caster.projectileSpeed??14),seen=new Set([c.target.id]);
  const bounce=(origin:{x:number;y:number},index:number)=>{if(index>count)return;const candidates=c.battle.units.filter(t=>enemy(c,t)&&!t.ward&&!t.courier&&visible(c,t)&&dist(t,origin)<=v(c,'BOUNCE RADIUS')/100&&t.id!==(origin as CombatUnit).id);if(!candidates.length)return;let fresh=candidates.filter(t=>!seen.has(t.id));if(!fresh.length){seen.clear();fresh=candidates;}const target=fresh.sort((a,b)=>dist(a,origin)-dist(b,origin)||a.id.localeCompare(b.id))[0];
   c.projectile(target,speed,t=>{seen.add(t.id);c.damage(t,amount*Math.pow(factor,index),'physical',true,{flags:{noAmplification:true,noSpellLifesteal:true,physicalAttackBlock:true}});bounce(t,index+1);},origin,undefined,{onDisjoint:p=>bounce(p,index+1),onTargetLost:p=>bounce(p,index+1)});
  };bounce(c.target,1);
 };moon.projectileDisjointable=true;moon.projectileDisjointOnInvisibility=true;moon.implemented=['Serial bounded fresh-first/revisit bounces with record main/critical/speed snapshot','Physical spell block and no spell amplification/lifesteal','Disjoint/lost-target continuation; AA final Super and persistent Butterfly'];moon.remaining=['Exact AA physical-body and rare illusion inheritance qualifications remain scoped'];

 const kisses=registry[KISSES];kisses.pointTarget=true;kisses.backswing=.73;kisses.requiresFacing=false;kisses.channel=c=>G(c)?0:v(c,'LAUNCH DURATION',5.5);kisses.canCast=c=>c.enemies().some(t=>visible(c,t)&&dist(t,c.caster)>=v(c,'MIN RANGE',600)/100&&dist(t,c.caster)<=Number(skillBalance(c.definition,c.skill.points)?.range??30));
 kisses.targetSelector=(c,ts)=>ts.filter(t=>visible(c,t)&&dist(t,c.caster)>=v(c,'MIN RANGE',600)/100).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0];
 kisses.init=c=>{let map=parents.get(c.battle);if(!map){map=new Map;parents.set(c.battle,map);}map.set(c.caster.id,c);if(S(c)){c.grantAbility?.(GOBBLE,1);c.grantAbility?.(SPIT,1);}};kisses.onStatusRemoved=magmaStatusRemoved;
 kisses.cast=c=>{
  const duration=v(c,'LAUNCH DURATION',5.5),count=v(c,'GLOB COUNT'),maximum=skillBalance(c.definition,c.skill.points)?.range??30,min=v(c,'MIN RANGE',600)/100;
  if(!G(c))for(const[k,n]of[['forceMoveSpeed',0],['disarm',0],['turnRatePct',-v(c,'TURN RATE SLOW',75)/100]] as const)c.status(c.caster,k,duration,n,{dispel:'none',removeOnDeath:true,data:{...data(c),kissesRun:true,priority:100}});
  const launch=(index:number)=>{if(!G(c)&&(c.caster.dead||c.caster.action!=='channel'||c.caster.castUntil<=c.battle.time))return;if(index>=count)return;
   const choices=c.battle.units.filter(t=>enemy(c,t)&&visible(c,t)&&dist(t,c.caster)>=min&&dist(t,c.caster)<=maximum);if(!choices.length)return;const target=choices[Math.floor(c.random()*choices.length)],point={x:target.x,y:target.y},origin={x:c.caster.x,y:c.caster.y},flight=Math.max(v(c,'MIN FLIGHT',.8),Math.min(v(c,'MAX FLIGHT',2),dist(point,origin)/(v(c,'PROJECTILE SPEED',1300)/100))),impact=v(c,'DAMAGE PER GLOB');
   const visual=addVisualProjectile(c.battle,{source:c.caster.id,skill:KISSES,points:c.skill.points,layer:'projectile',role:'projectile',...origin,origin,destination:point,arrival:c.battle.time+flight,until:c.battle.time+flight+STEP,angle:Math.atan2(point.y-origin.y,point.x-origin.x)});
   c.delay(flight,()=>{removeVisualProjectile(c.battle,visual);for(const t of c.battle.units.filter(t=>enemy(c,t)&&dist(t,point)<=v(c,'IMPACT RADIUS')/100))c.damage(t,impact,'magical');puddle(c,point,v(c,'IMPACT RADIUS')/100,v(c,'FIRESPIT POOL DURATION'),v(c,'BURN DPS')+(!configured(c)&&S(c)?20:0),v(c,'ENEMY MOVEMENT SLOW')/100);});
  };
  launch(0);for(let i=1;i<count;i++)c.delay(duration/count*i,()=>launch(i),!G(c));
  const cleanup=()=>{if(!G(c))c.caster.statuses=statuses(c.caster).filter(s=>!(s.skill===KISSES&&s.data?.ownerInstance===key(c)&&s.data?.kissesRun));};
  if(!G(c)){const check=()=>{if(c.caster.dead||c.caster.action!=='channel'||c.caster.castUntil<=c.battle.time){cleanup();return;}c.delay(STEP,check);};c.delay(STEP,check);}
 };
 kisses.implemented=['AA immediate8-glob barrage with clamped native flight and75percent turn slow','Released impact snapshots and nonstacking family magma','Real persistent Gobble/Spit grants and AA free-action Gaben'];kisses.remaining=['Per-glob reaim uses deterministic random visible-enemy AI policy','Gaben death/strong-control release qualification and Super burn-talent lineage remain source-scoped'];
 const gobble=registry[GOBBLE];gobble.target='any';gobble.targetEligibility=(c,t)=>unit(c,t)&&body(t)&&t.id!==c.caster.id&&(t.side===c.caster.side||ordinaryPassenger(t)&&!t.ancient&&!has(t,'magicImmune'));
 gobble.targetSelector=(c,ts)=>ts.filter(t=>t.side===c.caster.side&&hero(t)).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster))[0]??ts.filter(t=>t.side!==c.caster.side).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster))[0];gobble.canCast=c=>!holds(c).has(c.caster.id);gobble.backswing=1.27;
 gobble.cast=c=>{if(holds(c).has(c.caster.id))return;const run:Passenger={c,unit:c.target,token:`${key(c)}:${c.battle.time}`,active:true,flying:false,until:c.battle.time+v(c,'MAX HOLD',3)};holds(c).set(c.caster.id,run);if(ordinaryPassenger(c.target)){c.target.side=c.caster.side;c.target.owner=c.caster.id;}c.disjoint(c.target);c.status(c.target,'banished',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{passengerToken:run.token}});c.status(c.target,'visualForm',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{passengerToken:run.token,form:'gobble_up',passenger:true,leader:c.caster.id}});
  const follow=()=>{if(!run.active||run.flying)return;if(run.unit.dead||c.caster.dead||c.battle.time>=run.until){release(run);if(ordinaryPassenger(run.unit)&&!run.unit.dead)c.execute(run.unit);return;}c.warp(run.unit,c.caster.x,c.caster.y);c.delay(STEP,follow);};follow();
 };
 registry[SPIT]={target:'enemy',pointTarget:true,requiresFacing:false,backswing:1.03,allowZeroCooldown:true,canCast:c=>{const p=holds(c).get(c.caster.id);return!!p?.active&&!p.flying;},cast:c=>{
  const run=holds(c).get(c.caster.id);if(!run?.active||run.flying)return;run.flying=true;const point=c.castPosition??{x:c.target.x,y:c.target.y},flight=Math.max(v(c,'MIN FLIGHT',.6),Math.min(v(c,'MAX FLIGHT',2.1),dist(c.caster,point)/(v(c,'PROJECTILE SPEED',1400)/100))),parent=parents.get(c.battle)?.get(c.caster.id);
  const impact=parent?v(parent,'DAMAGE PER GLOB'):v(c,'IMPACT DAMAGE',300);
  const visual=addVisualProjectile(c.battle,{source:c.caster.id,skill:SPIT,artSkill:KISSES,points:c.visualPoints??c.skill.points,layer:'projectile',role:'projectile',x:run.unit.x,y:run.unit.y,followUnit:run.unit.id,angle:Math.atan2(point.y-run.unit.y,point.x-run.unit.x),until:c.battle.time+flight+STEP});
  const land=()=>{removeVisualProjectile(c.battle,visual);if(!run.active)return;release(run);if(ordinaryPassenger(run.unit)&&!run.unit.dead)c.execute(run.unit);for(const t of c.battle.units.filter(t=>enemy(c,t)&&dist(t,run.unit)<=v(c,'RADIUS',400)/100)){c.damage(t,impact,'magical');c.status(t,'stun',v(c,'STUN DURATION',1.5),0,{harmful:true,dispel:'strong'});}puddle(c,run.unit,v(c,'RADIUS',400)/100,v(c,'BURN DURATION',3),v(c,'BURN DAMAGE',100),v(c,'SLOW',25)/100);};
  if(!c.moveContinuous(run.unit,point.x,point.y,{duration:flight,lockActions:true,ignoreTerrainBarriers:true,onEnd:land}))land();
 },onStatusRemoved:magmaStatusRemoved,implemented:['Normal Spit action and single actual landing'],remaining:['AA child impact level and automatic aiming are scoped candidates']};

 const multi=registry[MULTI];multi.pointTarget=true;multi.backswing=0;multi.dynamicRange=true;multi.ignoreCastRangeBonuses=true;multi.range=c=>(c.attackRange?.(c.caster)??c.caster.range)*v(c,'ARROW RANGE MULTIPLIER');multi.channel=c=>v(c,'CHANNEL DURATION',1.75);multi.init=c=>{if(G(c))c.grantAbility?.(MARK,3);};
 multi.cast=c=>{const cursor=c.castPosition??c.target,angle=Math.atan2(cursor.y-c.caster.y,cursor.x-c.caster.x),waves=v(c,'WAVE COUNT')+(!configured(c)&&S(c)?2:0),arrows=v(c,'ARROWS PER WAVE')+(!configured(c)&&S(c)?2:0),duration=v(c,'CHANNEL DURATION',1.75),first=v(c,'FIRST WAVE DELAY',.1),gap=(duration-first)/waves;
  for(let wave=0;wave<waves;wave++){const hit=new Set<string>();for(let arrow=0;arrow<arrows;arrow++)c.delay(first+wave*gap+arrow*v(c,'ARROW INTERVAL',STEP),()=>{const origin={x:c.caster.x,y:c.caster.y},a=angle+(arrow-(arrows-1)/2)*v(c,'FAN ANGLE',50)/v(c,'VIRTUAL ARROW COUNT',6)*Math.PI/180;
   c.linearProjectile({origin,angle:a,distance:(c.attackRange?.(c.caster)??c.caster.range)*v(c,'ARROW RANGE MULTIPLIER'),speed:v(c,'PROJECTILE SPEED',1200)/100,width:v(c,'ARROW WIDTH',90)/100,stopOnHit:true,targetFilter:t=>!hit.has(t.id)&&!t.courier,effect:t=>{if(hit.has(t.id)||has(t,'magicImmune')||t.courier)return;hit.add(t.id);c.attack(t,v(c,'ARROW BASE DAMAGE BONUS')/100,true,undefined,true);const frost=c.caster.skills.some(s=>s?.id==='custom_drow_ranger_frost_arrows');if(!frost)c.status(t,'slow',v(c,'ARROW SLOW DURATION'),v(c,'FALLBACK FROST SLOW',55)/100,{harmful:true,dispel:'basic'});else for(const s of statuses(t).filter(s=>s.kind==='slow'&&s.source===c.caster.id&&s.skill==='custom_drow_ranger_frost_arrows'))s.until=c.battle.time+v(c,'ARROW SLOW DURATION');}});
  },true);}
 };multi.implemented=['AA modifier-enabled staggered physical fan and final5x6Super','Effective attack-range travel and fixed ground direction','Real native Marksmanship grant'];multi.remaining=['AA Super compressed1.75clock/virtual fan geometry and native-versusAA damage category are explicit candidates','Fallback Frost slow without a drafted Frost orb remains AA-unproved'];
 registry[MARK]={passive:true,init:c=>{if(c.caster.illusion)return;const aura=()=>{const disabled=c.caster.dead||has(c.caster,'break')||c.battle.units.some(t=>!t.dead&&t.side!==c.caster.side&&!t.illusion&&!t.ward&&!t.building&&!t.courier&&(!t.summoned||t.heroClone)&&dist(t,c.caster)<=v(c,'DISABLE RADIUS',400)/100);if(!disabled){const linger=v(c,'AURA LINGER',.5),own=statuses(c.caster).find(s=>s.kind==='agilityPct'&&s.skill===MARK),base=Number(c.caster.agility??0)/(1+(own?.value??0)),self=v(c,'SELF AGILITY',50)/100;c.status(c.caster,'agilityPct',linger,self,{passive:true,dispel:'none',data:{...data(c),uniqueGroup:'marksmanshipSelf',stacking:'strongest'}});const bonus=base*(1+self)*v(c,'ALLY AGILITY',50)/100;for(const t of c.allies().filter(t=>t.id!==c.caster.id&&!t.illusion&&!t.hiddenSpellBody&&!has(t,'banished')&&(c.isRangedAttack?.(t)??t.range>2)&&hero(t)&&dist(t,c.caster)<=v(c,'AURA RADIUS',1200)/100))c.status(t,'agility',linger,bonus,{passive:true,dispel:'none',data:{...data(c),uniqueGroup:'marksmanshipAlly',stacking:'strongest'}});c.status(c.caster,'marksmanship',v(c,'UPDATE INTERVAL',.1)+STEP, v(c,'PROC CHANCE',40)/100,{passive:true,dispel:'none',data:{...data(c),bonus:v(c,'PROC DAMAGE',80),prdKey:'marksmanship'}});}c.delay(Math.max(STEP,v(c,'UPDATE INTERVAL',.1)),aura);};aura();},implemented:['Dated native max-level aura and core launch-record PRD provider'],remaining:['AA granted rank3 and pre7.32eallycoefficient remain version candidates']};

 const flare=registry[FLARE];flare.pointTarget=true;flare.backswing=0;flare.cast=c=>{const primary=c.castPosition??{x:c.target.x,y:c.target.y},points=[{...primary}];if(S(c)){const pool=c.battle.units.filter(t=>enemy(c,t)&&!has(t,'magicImmune')&&visible(c,t)&&dist(t,primary)>v(c,'RADIUS')/100&&dist(t,primary)<=v(c,'SECONDARY SEARCH RADIUS',700)/100),heroes=pool.filter(t=>!t.summoned||t.illusion||t.heroClone),choices=heroes.length?heroes:pool;if(choices.length){const t=choices[Math.floor(c.random()*choices.length)];points.push({x:t.x,y:t.y});}}
  const interval=v(c,'DAMAGE INTERVAL',.1),duration=v(c,'DURATION'),amount=v(c,'DAMAGE')+(!configured(c)&&G(c)?450:0);for(const p of points){
   // The real static field owns its authored persistent presentation. Damage
   // uses a separate whole-pulse snapshot, never a per-victim zone callback.
   c.zone({...p,radius:v(c,'RADIUS')/100,duration,interval:duration,effect:()=>{}});
   for(let tick=1;tick<=Math.round(duration/interval);tick++)c.delay(interval*tick,()=>{const pool=c.battle.units.filter(t=>enemy(c,t)&&unit(c,t)&&!has(t,'magicImmune')&&dist(t,p)<=v(c,'RADIUS')/100),heroes=pool.filter(hero),targets=heroes.length?heroes:pool,damage=amount*interval/duration/(G(c)?1:Math.max(1,targets.length));for(const t of targets)c.damage(t,damage,'magical');});
  }
 };flare.implemented=['AA22pulse frozen-ground field with hero priority and creep fallback','Eligible-pulse snapshot excludes immune soakers','Dated700secondary outside170primary radius and independent AA2050undivided Gaben'];flare.remaining=['Exact AA undivided-damage upgrade origin is unidentified'];
}

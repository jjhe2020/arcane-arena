import {skillBalance,UNIT_CONFIG} from '../config';
import type {BattleState,CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const NA='custom_enchantress_natures_attendants',NC='custom_furion_force_of_nature',SWAP='vengefulspirit_nether_swap',TOXIN='viper_nethertoxin',OMNI='juggernaut_omni_slash';
const STEP=1/30,EPS=1e-8,FOREVER=1_000_000;
const list=(t:CombatUnit)=>t.statuses as EffectStatus[],S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const has=(c:C,t:CombatUnit,kind:string)=>list(t).some(s=>s.kind===kind&&s.until>c.battle.time+EPS);
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id;
const sourceKey=(c:C)=>`${c.caster.id}:${identity(c)}`;
const own=(c:C,s:EffectStatus)=>s.skill===c.skill.id&&s.source===c.caster.id;
function token(c:C):string{const key=`natureOmniSerial:${identity(c)}`;c.caster[key]=Number(c.caster[key]??0)+1;return`${sourceKey(c)}:${c.caster[key]}`;}
const present=(c:C)=>c.caster.skills.some(s=>s?.id===c.skill.id&&(!c.skill.instanceId||s.instanceId===c.skill.instanceId));
const ordinary=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier;

interface WispRun {c:C;token:string;end:number;healEnd:number;evilEnd:number;marker:EffectStatus;count:number;heal:number;evil:number;active:boolean}
const wispRuns=new WeakMap<BattleState,Map<string,WispRun>>();
function wisps(c:C){let m=wispRuns.get(c.battle);if(!m){m=new Map;wispRuns.set(c.battle,m);}return m;}
function healWisps(c:C,count:number,amount:number):void{
 const targets=c.allies().filter(t=>!t.ancient&&!t.building&&!t.ward&&!has(c,t,'banished')&&!t.hiddenSpellBody&&t.hp<t.maxHp&&dist(t,c.caster)<=v(c,'RADIUS')/100);
 for(let i=0;i<count&&targets.length;i++)c.heal(targets[Math.floor(c.random()*targets.length)],amount);
}
function finishWisps(run:WispRun):void{if(!run.active)return;run.active=false;run.c.caster.statuses=list(run.c.caster).filter(s=>s.data?.wispToken!==run.token);}
function startWisps(c:C):void{
 const old=wisps(c).get(sourceKey(c));if(old)finishWisps(old);
 const key=token(c),seconds=v(c,'DURATION',12),interval=v(c,'HEAL INTERVAL',.5),evil=G(c)?v(c,'EVIL WISPS',13):0,evilSeconds=evil?v(c,'EVIL DURATION',12):0;
 c.status(c.caster,'naturesAttendants',Math.max(seconds,evilSeconds),1,{dispel:'none',removeOnDeath:false,ignoreStatusResistance:true,data:{wispToken:key,instanceKey:key}});
 const marker=list(c.caster).find(s=>s.data?.wispToken===key)!;
 const run:WispRun={c,token:key,end:c.battle.time+Math.max(seconds,evilSeconds),healEnd:c.battle.time+seconds,evilEnd:c.battle.time+evilSeconds,marker,count:v(c,'WISPS'),heal:v(c,'HEAL PER SECOND')*interval,evil,active:true};wisps(c).set(sourceKey(c),run);
 let next=c.battle.time+interval;
 const tick=()=>{
  if(!run.active||c.battle.time>run.end+EPS)return;
  // Natural expiry may precede this exact endpoint task. A dispel is marked separately.
  if(marker.data?.removed==='dispel'){finishWisps(run);return;}
  if(c.battle.time<=run.healEnd+EPS)healWisps(c,run.count,run.heal);
  if(run.evil&&c.battle.time<=run.evilEnd+EPS){
   for(let i=0;i<run.evil;i++){const enemies=c.enemies().filter(t=>ordinary(t)&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&dist(t,c.caster)<=v(c,'EVIL RADIUS',275)/100);if(!enemies.length)break;c.damage(enemies[Math.floor(c.random()*enemies.length)],v(c,'EVIL DAMAGE PER SECOND',36)*interval,'magical',false,{flags:{damageOverTime:true}});}
  }
  next+=interval;if(next<=run.end+EPS)c.delay(Math.max(STEP,next-c.battle.time),tick);else finishWisps(run);
 };c.delay(interval,tick);
}
function permanentWisps(c:C):void{
 const count=v(c,'PERMANENT WISPS',S(c)?3:0);if(!count||c.caster.illusion)return;
 const key=`permanent:${sourceKey(c)}`;if(list(c.caster).some(s=>s.data?.permanentWispKey===key))return;
 c.status(c.caster,'permanentWisps',FOREVER,count,{passive:true,dispel:'none',removeOnDeath:false,data:{permanentWispKey:key,instanceKey:key}});
 const interval=v(c,'HEAL INTERVAL',.5);let next=c.battle.time+interval;
 const tick=()=>{if(!present(c)){c.caster.statuses=list(c.caster).filter(s=>s.data?.permanentWispKey!==key);return;}if(!c.caster.dead)healWisps(c,count,v(c,'HEAL PER SECOND')*interval);next+=interval;c.delay(Math.max(STEP,next-c.battle.time),tick);};c.delay(interval,tick);
}

function treants(c:C,greater:boolean,count:number,point:{x:number;y:number}):CombatUnit[]{
 const id=greater?'npc_dota_furion_treant_large':c.skill.points===1?'npc_dota_furion_treant_1':c.skill.points===2?'npc_dota_furion_treant_2':'npc_dota_furion_treant_4',raw=UNIT_CONFIG[id];if(!raw)throw Error(`Missing native Treant profile: ${id}`);
 const seconds=v(c,'TREANT DURATION'),bodies=c.summon({name:greater?'大树人':'树人',visualBody:greater?'greater':'treant',nativeTemplateId:id,count,hp:greater?raw.StatusHealth:v(c,'TREANT HEALTH'),attack:greater?(raw.AttackDamageMin+raw.AttackDamageMax)/2:v(c,'TREANT DAMAGE'),armor:raw.ArmorPhysical,interval:raw.AttackRate,range:raw.AttackRange/100,speed:raw.MovementSpeed/100,lifetime:seconds});
 for(const body of bodies){body.sourceUnitType=id;body.magicResist=(raw.MagicalResistance??0)/100;if(raw.StatusHealthRegen)c.status(body,'regen',seconds,raw.StatusHealthRegen,{dispel:'none'});c.warp(body,point.x,point.y);}
 return bodies;
}
const swapHero=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier&&(!t.summoned||!!t.illusion||!!t.heroClone||!!t.extraSpiritBear||t.sourceUnitType==='npc_dota_lone_druid_bear');
function swap(c:C):void{
 const origin={x:c.caster.x,y:c.caster.y},destination={x:c.target.x,y:c.target.y};delete c.caster.natureOmniSwapAllyRequested;
 if(c.target.side!==c.caster.side&&c.trySpellBlock?.(c.target))return;
 c.interrupt?.(c.target);c.warp(c.caster,destination.x,destination.y);c.warp(c.target,origin.x,origin.y);
 if(c.target.side!==c.caster.side)c.damage(c.target,v(c,'DAMAGE'),'magical',true);
 const options:Partial<EffectStatus>={dispel:'basic',removeOnDeath:true},seconds=v(c,'DAMAGE REDUCTION DURATION'),amount=v(c,'DAMAGE REDUCTION')/100;
 c.status(c.caster,'damageReduction',seconds,amount,options);if(c.target.side===c.caster.side)c.status(c.target,'damageReduction',seconds,amount,options);
 if(G(c))for(const t of c.enemies().filter(t=>ordinary(t)&&dist(t,c.caster)<=v(c,'FEAR RADIUS',700)/100))c.status(t,'fear',v(c,'FEAR DURATION',1.5),0,{harmful:true,dispel:'basic',piercesImmunity:false,removeOnDeath:true});
}

interface ToxinField {c:C;id:string;x:number;y:number;radius:number;until:number;min:number;max:number;silence:boolean}
interface ToxinDebuff {field:ToxinField;target:CombatUnit;until:number;next:number;index:number;inside:boolean}
interface ToxinRuntime {fields:ToxinField[];targets:Map<string,ToxinDebuff>;scheduled:boolean}
const toxinRuns=new WeakMap<BattleState,ToxinRuntime>();
function cleanToxin(debuff:ToxinDebuff):void{const{field,target}=debuff;target.statuses=list(target).filter(s=>s.data?.toxinField!==field.id);}
function toxinRuntime(c:C):ToxinRuntime{let run=toxinRuns.get(c.battle);if(!run){run={fields:[],targets:new Map,scheduled:false};toxinRuns.set(c.battle,run);}return run;}
function toxinTick(c:C,run:ToxinRuntime):void{
 const now=c.battle.time;run.fields=run.fields.filter(f=>f.until>=now-EPS);
 for(const t of c.battle.units){
  const choices=run.fields.filter(f=>t.side!==f.c.caster.side&&ordinary(t)&&!has(c,t,'magicImmune')&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&dist(t,f)<=f.radius);
  // Strongest final DPS is the disclosed provider-selection policy; damage never stacks.
  choices.sort((a,b)=>b.max-a.max||a.id.localeCompare(b.id));const field=choices[0];let debuff=run.targets.get(t.id);
  if(field){
   if(!debuff||!debuff.inside||debuff.field.id!==field.id){if(debuff)cleanToxin(debuff);debuff={field,target:t,until:now+v(field.c,'AURA LINGER',.5),next:now+v(field.c,'DAMAGE INTERVAL',.5),index:0,inside:true};run.targets.set(t.id,debuff);}
   debuff.inside=true;debuff.until=now+v(field.c,'AURA LINGER',.5);
  }else if(debuff)debuff.inside=false;
  if(!debuff)continue;
  const immune=has(c,t,'magicImmune')||has(c,t,'invulnerable')||has(c,t,'banished');
  if(t.dead||now>debuff.until+EPS||immune){cleanToxin(debuff);run.targets.delete(t.id);continue;}
  const owner=debuff.field.c,options:Partial<EffectStatus>={harmful:true,dispel:'none',ignoreStatusResistance:true,removeOnDeath:true,data:{toxinField:debuff.field.id}};
  owner.status(t,'break',Math.max(STEP,debuff.until-now+EPS),0,options);if(debuff.field.silence)owner.status(t,'silence',Math.max(STEP,debuff.until-now+EPS),0,options);
  const interval=v(owner,'DAMAGE INTERVAL',.5);
  if(now>=debuff.next-EPS){const fraction=Math.min(1,debuff.index*interval/Math.max(interval,v(owner,'MAX DPS DURATION')));owner.damage(t,(debuff.field.min+(debuff.field.max-debuff.field.min)*fraction)*interval,'magical',false,{flags:{damageOverTime:true}});debuff.index++;debuff.next+=interval;}
 }
 if(run.fields.length||run.targets.size)c.delay(STEP,()=>toxinTick(c,run));else run.scheduled=false;
}
function toxin(c:C):void{
 const origin={x:c.caster.x,y:c.caster.y},point={...(c.castPosition??c.target)},distance=dist(origin,point),arrive=()=>{
  const run=toxinRuntime(c),field:ToxinField={c,id:token(c),...point,radius:v(c,'RADIUS')/100,until:c.battle.time+v(c,'DURATION'),min:v(c,'MIN DPS'),max:v(c,'MAX DPS'),silence:G(c)};run.fields.push(field);
  c.zone({x:point.x,y:point.y,radius:field.radius,duration:v(c,'DURATION'),interval:STEP,effect:()=>{}});
  if(!run.scheduled){run.scheduled=true;toxinTick(c,run);}
 };
 if(distance<EPS){arrive();return;}c.linearProjectile({origin,angle:Math.atan2(point.y-origin.y,point.x-origin.x),distance,speed:v(c,'PROJECTILE SPEED',2000)/100,width:0,effect:()=>{},onEnd:arrive});
}

interface SlashRun {c:C;token:string;until:number;active:boolean;next:number;emptySince?:number}
const slashRuns=new WeakMap<BattleState,Map<string,SlashRun>>();
function slashes(c:C){let m=slashRuns.get(c.battle);if(!m){m=new Map;slashRuns.set(c.battle,m);}return m;}
const zombie=(t:CombatUnit)=>String(t.sourceUnitType??'').includes('undying_zombie');
const slashTarget=(c:C,t:CombatUnit,first=false)=>!t.dead&&!t.ward&&!t.building&&!zombie(t)&&(!t.courier||first)&&!t.hiddenSpellBody&&!has(c,t,'banished')&&!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed'));
function endSlash(run:SlashRun):void{if(!run.active)return;run.active=false;run.c.caster.statuses=list(run.c.caster).filter(s=>s.data?.omnislashToken!==run.token);}
function slash(c:C,mini=false):void{
 const map=slashes(c),old=map.get(c.caster.id);if(old)endSlash(old);
 const seconds=mini?v(c,'MINI DURATION',.8):v(c,'DURATION'),key=token(c),run:SlashRun={c,token:key,until:c.battle.time+seconds,active:true,next:c.battle.time};map.set(c.caster.id,run);
 c.dispel(c.caster);for(const[kind,amount]of [['invulnerable',0],['magicImmune',0],['root',0],['castWithoutTurning',0],['disarm',0],['omnislash',1],['attackSpeed',v(c,'BONUS ATTACK SPEED')],['attackBonus',v(c,'BONUS DAMAGE')]] as const)c.status(c.caster,kind,seconds,amount,{dispel:'none',removeOnDeath:true,data:{omnislashToken:key}});
 const hit=(target:CombatUnit,first=false)=>{
  const dx=target.x-c.caster.x,dy=target.y-c.caster.y,length=Math.hypot(dx,dy),offset=v(c,'JUMP OFFSET',50)/100,axis=length>EPS?{x:dx/length,y:dy/length}:{x:Math.cos(c.caster.facing),y:Math.sin(c.caster.facing)};
  c.warp(c.caster,target.x+axis.x*offset,target.y+axis.y*offset);c.caster.facing=Math.atan2(target.y-c.caster.y,target.x-c.caster.x);
  const blocked=first&&c.trySpellBlock?.(target);if(!blocked&&!has(c,target,'invulnerable')&&!has(c,target,'physicalImmune')&&!has(c,target,'attackImmune'))c.attack(target,1,true,undefined,false,{modifierPolicy:'all'});
  run.next=c.battle.time+Math.max(STEP,(c.attackInterval?.(c.caster,target)??c.caster.attackInterval)/Math.max(.01,v(c,'SLASHES RATE MULTIPLIER')));
 };
 if(!slashTarget(c,c.target,true)){endSlash(run);return;}hit(c.target,true);
 const tick=()=>{
  if(!run.active)return;if(c.caster.dead||c.battle.time>=run.until-EPS||!list(c.caster).some(s=>s.kind==='omnislash'&&s.data?.omnislashToken===key)){endSlash(run);return;}
  const targets=c.battle.units.filter(t=>t.side!==c.caster.side&&slashTarget(c,t)&&dist(t,c.caster)<=v(c,'SLASH JUMP RADIUS')/100);
  if(!targets.length){run.emptySince??=c.battle.time;if(c.battle.time-run.emptySince>=v(c,'NO TARGET GRACE',.15)-EPS){endSlash(run);return;}}
  else{run.emptySince=undefined;if(c.battle.time>=run.next-EPS)hit(targets[Math.floor(c.random()*targets.length)]);}
  c.delay(STEP,tick);
 };c.delay(STEP,tick);
}

/** Final historical/AA overrides. Unrecovered custom choices remain in the ledger. */
export function applyNatureOmniAcceptance(registry:Record<string,SkillProgram>):void{
 registry[NA]={target:'self',cast:startWisps,init:permanentWisps,canCast:c=>c.allies().some(t=>ordinary(t)&&t.hp<t.maxHp*.85&&dist(t,c.caster)<=v(c,'RADIUS')/100)||G(c)&&c.enemies().some(t=>ordinary(t)&&dist(t,c.caster)<=v(c,'EVIL RADIUS',275)/100),onStatusRemoved:(c,s,reason)=>{if(s.kind!=='naturesAttendants'||reason!=='dispel')return;s.data={...s.data,removed:'dispel'};const run=wisps(c).get(sourceKey(c));if(run?.token===s.data.wispToken)finishWisps(run);},superImplemented:true,gabenImplemented:true,implemented:['Half-second individual random wisps,full-health/ancient/hidden exclusion and corpse-origin continuation','Nonstacking refreshed active swarm protected from both basic and Strong purge;AA category conflict remains explicit','AA final13activewisps/36heal and three permanent wisps from initialization','Explicit Gaben evil-swarm balance candidate'],remaining:['AA evil counts/damage/radius remain disclosed working defaults','Same-tick overheal redistribution and permanent-wisp illusion/Break/owner-replacement eligibility require source-specific checks']};
 registry[NC]={target:'enemy',pointTarget:true,cast:c=>{treants(c,S(c),v(c,'TREANT COUNT'),c.castPosition??c.target);},onUnitDeath:c=>{if(!G(c)||c.target.side===c.caster.side)return;treants(c,!c.target.summoned&&!c.target.illusion,1,c.target);},superImplemented:true,gabenImplemented:true,implemented:['Frozen point-target tree-free AA summoning with native1/2/4profiles and explicitAAHP/damage overrides','Super historical1650HP/108mean Greater Treant body','Gaben enemy summon/illusion deaths create regular Treants and real hero deaths create Greater Treants'],remaining:['Exact AA death-summon eligibility for wards/buildings and source-dead observers remains scoped','Greater Treant ability-upgrade body and historical profiles are compatible prototypes,not recovered original AA Lua']};
 registry[SWAP]={target:'any',unitTarget:true,spellBlockTiming:'program',targetEligibility:(c,t)=>t.id!==c.caster.id&&swapHero(t)&&!has(c,t,'banished')&&!t.hiddenSpellBody&&(t.side===c.caster.side||(!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed')))),targetSelector:(c,targets)=>targets.filter(t=>c.caster.natureOmniSwapAllyRequested===true?t.side===c.caster.side:t.side!==c.caster.side).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0],cast:swap,superImplemented:true,gabenImplemented:true,implemented:['Actual unit eligibility includes allied heroes,illusions,bear and invulnerable bodies but excludes ordinary creeps','Stop target action before source-marked warps without disjointing projectiles','Caster always receives finalgeneric reduction;allied target receives the same buff without enemy damage','AA65percent/10secondSuper and historical destination-centered Gaben fear with explicitnonpiercing immunity'],remaining:['Autonomous AI prefers enemies; runtime diagnostic ally request is not a new persisted manual-order UI','Soulbind three-way redirect sequence and overlapping generic reduction order require separate outcomes']};
 registry[TOXIN]={target:'enemy',pointTarget:true,cast:toxin,superImplemented:true,gabenImplemented:true,implemented:['Released2000speed frozen-point projectile before field creation','Half-second aura damage starting at minimum and reaching finalmaximum at the ninthtick;0.5linger','Independent exposure reset and nonstacking shared toxin manager;release survives caster death','AA final190maximum and Gaben undispellable aura silence'],remaining:['Strongest-provider overlap handoff is a disclosed selection policy;native only directly proves nonstacking','Immediate reentry clock reset and source-specific spell immunity/banish crossings remain precise boundaries']};
 registry[OMNI]={target:'enemy',unitTarget:true,spellBlockTiming:'program',targetEligibility:(c,t)=>t.side!==c.caster.side&&slashTarget(c,t,true)&&!has(c,t,'invulnerable'),canCast:c=>!has(c,c.caster,'bladeFury'),cast:c=>slash(c),onAttack:c=>{if(G(c)&&!has(c,c.caster,'omnislash')&&c.random()<v(c,'MINI CHANCE',20)/100)slash(c,true);},onDeath:c=>{const run=slashes(c).get(c.caster.id);if(run)endSlash(run);},superImplemented:true,gabenImplemented:true,implemented:['Basic dispel and native invulnerability/spellimmunity/root/no-turncasting states;opposite-side target-facing warp','Only firstslash blocked,continued native full-modifier no-TrueStrike instant attacks;invulnerable/ethereal bodies remain jumpable without attacks','Snapshot each next interval after a slash instead of continuously rescaling the pending clock;0.15no-target grace','AA final5secondSuper and nonrecursive20percent0.8secondGaben mini;normal recast replaces old instance'],remaining:['Exact offset50 is retained working geometry,not supplied by historical source','Fog/flyingvision environment,root-protected cross-mobility eligibility and historical item-specific restrictions remain bounded','AA Gaben distribution/illusion eligibility and mini interruption of an ongoing attack have no recovered original Lua']};
}

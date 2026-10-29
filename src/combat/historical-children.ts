import data from './historical-ability-data.json';
import type { CombatUnit,SkillDefinition } from '../model';
import type { EffectContext as C,SkillProgram } from '../skill-effects';

/** Ancillary definitions only: these do not add purchasable catalog entries.
 * Fixed Valve KV mirror commit 6abdd9d13de2f4330ca748082467b9ff6e6cd928,
 * actual commit date 2023-02-10. AA's explicit parent upgrade values override
 * this historical candidate; matching the AA snapshot is still unverified. */
const programs:Record<string,SkillProgram>={};
const definitions:SkillDefinition[]=[];
type Raw=Record<string,unknown>;
function fields(raw:Raw):Record<string,string>{
  const out:Record<string,string>={};
  for(const [key,value]of Object.entries(raw))if(typeof value==='string')out[key]=value;
  for(const [key,value]of Object.entries((raw.AbilityValues??{}) as Raw))if(typeof value==='string')out[key]=value;else if(value&&typeof value==='object'&&typeof(value as Raw).value==='string')out[key]=(value as Raw).value as string;
  for(const special of Object.values((raw.AbilitySpecial??{}) as Raw))for(const[key,value]of Object.entries(special as Raw))if(typeof value==='string'&&!['var_type','LinkedSpecialBonus','RequiresScepter','RequiresShard'].includes(key))out[key]=value;
  return out;
}
const nums=(s:string|undefined)=>s?.match(/-?\d+(?:\.\d+)?/g)?.map(Number)??[];
export function childValue(c:C,key:string,fallback?:number):number{
  const row=c.definition.values.find(s=>s.split(':')[0].trim().toUpperCase()===key.toUpperCase());
  const a=nums(row?.slice(row.indexOf(':')+1));if(!a.length){if(fallback!==undefined)return fallback;throw new Error(`Missing historical child field ${c.skill.id}.${key}`);}
  return a[Math.min(a.length-1,Math.max(0,Math.floor(c.skill.points)-1))];
}
const n=childValue;
const distance=(a:CombatUnit,b:CombatUnit)=>Math.hypot(a.x-b.x,a.y-b.y);
function register(id:keyof typeof data.abilities,p:SkillProgram){
  const raw=data.abilities[id] as Raw,values=fields(raw);
  definitions.push({id,name:id,nameEn:id,tags:[],description:'仅由升级授予的历史候选子技能',descriptionEn:'Historical candidate child effect; AA source-version match unverified.',super:'',gaben:'',values:Object.entries(values).map(([k,v])=>`${k}: ${v}`),cooldowns:nums(values.AbilityCooldown),mana:nums(values.AbilityManaCost),categories:[`ABILITY: ${String(raw.AbilityBehavior).includes('UNIT_TARGET')?'Unit Target':'No Target'}`,`PIERCES SPELL IMMUNITY: ${raw.SpellImmunityType==='SPELL_IMMUNITY_ENEMIES_YES'?'Yes':'No'}`],icon:'',passive:false,ultimate:raw.AbilityType==='DOTA_ABILITY_TYPE_ULTIMATE',grantedOnly:true,historicalSource:{...data.source,id},sourceMaximumLevel:['bloodseeker_rupture','pudge_dismember'].includes(id)?3:4});
  programs[id]={castPoint:c=>n(c,'AbilityCastPoint',0),cooldown:c=>n(c,'AbilityCooldown',0),manaCost:c=>n(c,'AbilityManaCost',0),range:c=>n(c,'AbilityCastRange',700)/100,...p,remaining:[...p.remaining,'Historical Dota 2023-02-10 candidate; AA engine version has not been matched']};
}

register('shredder_whirling_death',{
  target:'self',
  cast:c=>{for(const t of c.enemies().filter(t=>distance(t,c.caster)<=n(c,'whirling_radius')/100)){c.damage(t,n(c,'whirling_damage'),'pure');if(!t.summoned){const primary=String(t.primaryAttribute??'strength');c.status(t,`${primary}Pct`,n(c,'duration'),-n(c,'stat_loss_pct')/100,{harmful:true,maxStacks:100});}}},
  implemented:['historical pure area damage','primary-attribute percentage reduction'],remaining:['Tree-cutting bonus has no board tree data','AA granted level absent; parent explicitly uses historical maximum level 4','Percentage stat-loss stacking conversion requires source-version validation'],
});
register('dragon_knight_breathe_fire',{
  cast:c=>{const origin={x:c.caster.x,y:c.caster.y},dx=c.target.x-origin.x,dy=c.target.y-origin.y,length=Math.hypot(dx,dy)||1,range=n(c,'range')/100,speed=n(c,'speed')/100,seen=new Set<string>(),time=range/speed,steps=Math.ceil(time*30);for(let i=1;i<=steps;i++)c.delay(Math.min(time,i/30),()=>{const front=Math.min(range,speed*i/30);for(const t of c.enemies()){const along=((t.x-origin.x)*dx+(t.y-origin.y)*dy)/length,across=Math.abs((t.x-origin.x)*dy-(t.y-origin.y)*dx)/length,width=(n(c,'start_radius')+(n(c,'end_radius')-n(c,'start_radius'))*along/range)/100;if(along<0||along>front||across>width||seen.has(t.id))continue;seen.add(t.id);c.damage(t,n(c,'damage'));c.status(t,'attackPct',n(c,'duration'),n(c,'reduction')/100,{harmful:true});}});},
  implemented:['traveling widening flame wave','historical 320 max-level damage and attack-damage reduction'],remaining:['Tree destruction and exact cone boundary collision'],
});
register('sven_storm_bolt',{
  cast:c=>c.projectile(c.target,n(c,'bolt_speed')/100,t=>{for(const victim of c.enemies().filter(x=>distance(x,t)<=n(c,'bolt_aoe')/100)){c.damage(victim,n(c,'AbilityDamage'));c.status(victim,'stun',n(c,'bolt_stun_duration'),0,{harmful:true,dispel:'strong'});}}),
  implemented:['historical-speed homing bolt','area damage and stun'],remaining:['AA granted level absent; parent explicitly uses historical maximum level 4','Projectile disjoint and terrain interaction'],
});
register('bloodseeker_rupture',{
  cast:c=>{const seconds=n(c,'duration');c.damage(c.target,c.target.hp*n(c,'hp_pct')/100,'pure',true);c.status(c.target,'rupture',seconds,n(c,'movement_damage_pct')/100,{harmful:true,dispel:'none',piercesImmunity:true,data:{lastX:c.target.x,lastY:c.target.y,damageCapDistance:n(c,'damage_cap_amount')/100}});},
  implemented:['historical current-health initial damage','movement-distance pure damage ledger'],remaining:['Original rupture movement sampling and teleport-distance exclusion semantics'],
});
register('medusa_mystic_snake',{
  cast:c=>{let stolen=0,count=0;const seen=new Set<string>(),max=n(c,'snake_jumps');const send=(t:CombatUnit,origin:{x:number;y:number})=>c.projectile(t,n(c,'initial_speed')/100*(1+count*n(c,'snake_speed_scale')/100),victim=>{seen.add(victim.id);const damage=n(c,'snake_damage')*(1+count*n(c,'snake_scale')/100),mana=Math.min(victim.mana,victim.maxMana*n(c,'snake_mana_steal')/100);c.mana(victim,-mana);stolen+=mana;c.damage(victim,damage);c.status(victim,'slow',n(c,'slow_duration'),n(c,'movement_slow')/100,{harmful:true});const petrify=n(c,'PETRIFY_DURATION',0);if(petrify>0){c.status(victim,'stun',petrify,0,{harmful:true,dispel:'strong'});c.status(victim,'physicalVulnerability',petrify,n(c,'PHYSICAL_VULNERABILITY',0)/100,{harmful:true});}count++;const next=c.enemies().filter(t=>!seen.has(t.id)&&distance(t,victim)<=n(c,'radius')/100).sort((a,b)=>distance(a,victim)-distance(b,victim)||a.id.localeCompare(b.id))[0],from={x:victim.x,y:victim.y};if(next&&count<max)c.delay(n(c,'jump_delay'),()=>send(next,from));else c.projectile(c.caster,n(c,'return_speed')/100,()=>c.mana(c.caster,stolen),from);},origin);send(c.target,{x:c.caster.x,y:c.caster.y});},
  implemented:['historical multi-target homing snake with per-bounce origin/speed/damage','stolen mana returns with actual returning projectile','AA override support for 8% mana steal and one-second petrification'],remaining:['AA granted snake level absent; parent explicitly uses historical max level 4','Target death in flight, turn-rate slow and disjoint behavior'],
});
register('pudge_dismember',{
  target:'enemy',range:1.6,castPoint:.3,channel:c=>n(c,'NO_CHANNEL',0)?0:n(c,'AbilityChannelTime'),
  cast:c=>{const target=c.target,seconds=n(c,'AbilityChannelTime'),interval=seconds/n(c,'ticks'),damage=n(c,'dismember_damage')+Number(c.caster.strength??0)*n(c,'strength_damage');c.zone({follow:true,radius:100,duration:seconds,interval,channel:true,effect:t=>{if(t.id!==target.id)return;c.status(t,'stun',interval+.01,0,{harmful:true,dispel:'strong',piercesImmunity:true});const amount=c.damage(t,damage*interval,'magical',true);c.heal(c.caster,amount);const gap=distance(t,c.caster),travel=Math.min(Math.max(0,gap-n(c,'pull_distance_limit')/100),n(c,'pull_units_per_second')/100*interval);if(travel>0)c.teleport(t,t.x+(c.caster.x-t.x)/gap*travel,t.y+(c.caster.y-t.y)/gap*travel);}});c.status(target,'stun',interval+.01,0,{harmful:true,dispel:'strong',piercesImmunity:true});},
  implemented:['historical level-three base plus strength-scaled damage','caster healing and victim pull','AA nonchanneled grant still cancels on source interruption'],remaining:['Creep-duration variant','Strong dispel on victim versus reapplication behavior','Original first-tick phase and interruption by silence versus stun'],
});

export const HISTORICAL_CHILD_PROGRAMS=programs;
export const HISTORICAL_CHILD_DEFINITIONS=definitions;

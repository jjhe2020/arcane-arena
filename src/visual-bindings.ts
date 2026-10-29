import type {AnimationClip,AssetManifest,BattleState,CombatEvent,CombatUnit,Status} from './model';
import {selectVisualLayers,tierVisualLayers,type VisualLayer,type VisualSkillArt} from './visual-layers';
import {activeVisualProjectiles,visualProjectilePosition,activeVisualWorldEffects,type VisualWorldEffect} from './combat/visual-state';
import radialCalibration from './radial-art-calibration.json';

export interface PlacedVisual {key:string;clip:AnimationClip;x:number;y:number;age:number;size:number;angle:number;z:number;loop:boolean;height?:number}
type VisualStatus=Status&{harmful?:boolean;passive?:boolean;data?:Record<string,unknown>;visualSkill?:string;visualPoints?:number};
export interface VisualSource {skill:string;visualSkill?:string;visualPoints?:number;artSkill?:string;points?:number}
const ART_ALIASES:Record<string,string>={spectre_spectral_dagger:'custom_spectre_dispersion',aa_granted_voodoo_switcheroo:'custom_witch_doctor_death_ward',dragon_knight_fireball:'dragon_knight_elder_dragon_form'};

export function resolveVisualArt(assets:AssetManifest,source:VisualSource,fallbackPoints=1){
 const own=assets.skills[source.skill],persistent=source.skill.endsWith(':persistent')?source.skill.slice(0,-11):undefined,id=own?source.skill:source.artSkill??source.visualSkill??(persistent&&assets.skills[persistent]?persistent:ART_ALIASES[source.skill]);
 const art=id?assets.skills[id] as VisualSkillArt|undefined:undefined;
 return art&&id?{id,art,points:id===source.skill?source.points??(source.visualSkill===source.skill?source.visualPoints:undefined)??fallbackPoints:source.visualPoints??source.points??fallbackPoints}:undefined;
}
function semanticStatus(layer:VisualLayer,status:VisualStatus,unit:CombatUnit,skillId:string){
 const role=layer.role,kind=status.kind.toLowerCase(),self=status.source===unit.id;
 if(skillId==='custom_sven_gods_strength')return layer.id==='immune'?kind==='magicimmune':layer.id==='strength'?kind==='attackpct':false;
 if(skillId==='dragon_knight_elder_dragon_form')return status.skill===skillId&&(layer.id==='poison'?kind==='dot':layer.id==='frost_slow'?kind==='slow':false);
 if(skillId==='templar_assassin_refraction'&&layer.id==='shield')return kind==='refraction'&&Number((status as VisualStatus&{remaining?:number}).remaining??status.value??0)>0;
 if(role==='permanent_stat_mark')return status.skill?.endsWith(':persistent')===true&&status.harmful!==true&&/strength|agility|intelligence/.test(kind)&&(status.value??0)>0;
 if(/^summon_/.test(role))return !!unit.summoned;
 if(/^target_stun$|^stun$/.test(role))return /stun|chrono|petrif/.test(kind);
 if(role.includes('root'))return /root|frostbite|overgrowth/.test(kind);
 if(role.includes('silence'))return /silence|doom|hex/.test(kind);
 if(role.includes('shield')||role==='active_damage_block')return /shield|refraction|block|barrier|physicalimmune|magicimmune/.test(kind);
 if(role.includes('immunity'))return /immune|invulnerable/.test(kind);
 if(role.includes('regeneration'))return /regen|heal/.test(kind);
 if(role.includes('charged_attacks'))return self&&/charge|jingu/.test(kind)&&kind!=='jinguHits'&&(status.value??0)>0&&status.harmful!==true;
 if(role.includes('slow')&&!role.includes('slow_break'))return /slow|cripple|chill/.test(kind);
 if(role.includes('fear'))return kind==='fear';
 if(role.includes('break'))return /break/.test(kind);
 if(role.includes('armor_debuff'))return kind==='armor'&&(status.value??0)<0;
 if(role.includes('stack')||role.includes('counter'))return /stack|counter|hits|jingu|poison|stickynapalm|warpath/.test(kind)&&Math.abs(status.value??0)>0;
 if(/^body_/.test(role))return status.harmful!==true;
 if(/^caster_|^private_caster_|^weapon_/.test(role))return self&&status.harmful!==true;
 if(/^friendly_|^ally_|^attacker_/.test(role))return status.harmful!==true;
 if(/^enemy_|^target_/.test(role))return status.harmful===true;
 return false;
}
/** An actual modifier is required. Owning an active spell alone is never
 * enough to paint a buff; a caster's permanent stats cannot create its enemy
 * debuff art. Layer IDs deduplicate the several modifiers of one effect. */
export function statusVisuals(assets:AssetManifest,units:CombatUnit[],time:number):PlacedVisual[]{
 const result=new Map<string,PlacedVisual>();
 for(const unit of units){if(unit.dead)continue;
  for(const raw of unit.statuses){const status=raw as VisualStatus;if(!status.skill||status.until<=time||status.kind==='visualLink'||status.kind==='visualBeam')continue;
   const source=units.find(u=>u.id===status.source),points=source?.skills.find(s=>s?.id===status.skill)?.points??1;
   const resolved=resolveVisualArt(assets,{...status,skill:status.skill},points);if(!resolved)continue;
   for(const layer of selectVisualLayers(resolved.art,resolved.points,'status')){
    if(!semanticStatus(layer,status,unit,resolved.id))continue;
    const key=`s:${unit.id}:${status.source}:${resolved.id}:${layer.id}`;
    result.set(key,{key,clip:layer.clip,x:unit.x,y:unit.y,age:time,size:Number(layer.clip.worldSize??3.6),angle:/weapon_|attack_buff/.test(layer.role)?unit.facing+Math.PI/2:0,z:.6,loop:true});
   }
  }
  for(const skill of unit.skills){if(!skill)continue;
   if(skill.id==='custom_monkey_king_jingu_mastery'&&Number(unit[`${skill.id}:charges`]??0)>0){const art=assets.skills[skill.id] as VisualSkillArt|undefined;if(art)for(const layer of selectVisualLayers(art,skill.points,'status',['charged'])){const key=`s:${unit.id}:${unit.id}:${skill.id}:${layer.id}`;result.set(key,{key,clip:layer.clip,x:unit.x,y:unit.y,age:time,size:Number(layer.clip.worldSize??3.6),angle:unit.facing+Math.PI/2,z:.6,loop:true});}}
   if(skill.id==='custom_troll_warlord_berserkers_rage'){
    const art=assets.skills[skill.id] as VisualSkillArt|undefined;if(!art)continue;
    const tier=skill.points>=9?'gaben':skill.points>=6?'super':'normal';
    const bands=(art.tiers?.[tier] as {runtime_delta?:{owner_health_visuals?:{bands?:{min_exclusive:number;max_inclusive:number;include_zero?:boolean;layers:string[]}[]}}}|undefined)?.runtime_delta?.owner_health_visuals?.bands;
    const ratio=unit.hp/Math.max(1,unit.maxHp),band=bands?.find(b=>(ratio>b.min_exclusive||(ratio===0&&b.include_zero))&&ratio<=b.max_inclusive);
    if(band)for(const layer of selectVisualLayers(art,skill.points,'status',band.layers)){const key=`s:${unit.id}:${unit.id}:${skill.id}:${layer.id}`;result.set(key,{key,clip:layer.clip,x:unit.x,y:unit.y,age:time,size:Number(layer.clip.worldSize??3.6),angle:0,z:.3,loop:true});}
   }
  }
 }
 return [...result.values()];
}
export function portalVisuals(assets:AssetManifest,units:CombatUnit[],time:number):PlacedVisual[]{
 const result:PlacedVisual[]=[];
 for(const unit of units){if(unit.dead)continue;
  for(const raw of unit.statuses){const status=raw as VisualStatus;if(status.kind!=='visualForm'||status.until<=time||status.data?.form!=='dissimilate'||typeof status.data.portals!=='string')continue;
   let points:unknown;try{points=JSON.parse(status.data.portals);}catch{continue;}if(!Array.isArray(points)||points.length>32)continue;
   const spec=assets.skills.custom_void_spirit_dissimilate as VisualSkillArt|undefined;if(!spec)continue;const level=unit.skills.find(s=>s?.id==='custom_void_spirit_dissimilate')?.points??1;
   const layer=selectVisualLayers(spec,level,'zone',['portal'])[0];if(!layer)continue;
   points.forEach((p,index)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;result.push({key:`portal:${unit.id}:${index}`,clip:layer.clip,x:p.x,y:p.y,age:time,size:Number(layer.clip.worldSize??5.4),angle:0,z:.13,loop:true});});
  }
 }
 return result;
}
export function movingVisuals(assets:AssetManifest,battle:BattleState,time:number):PlacedVisual[]{
 const result:PlacedVisual[]=[];
 for(const projectile of activeVisualProjectiles(battle,time)){
  const resolved=resolveVisualArt(assets,projectile,projectile.points);if(!resolved)continue;
  const layers=selectVisualLayers(resolved.art,resolved.points,'projectile',projectile.layer?[projectile.layer]:undefined);
  // Ghostship is an authored moving construct, not a damage projectile layer.
  if(projectile.layer&&!layers.length){const layer=tierVisualLayers(resolved.art,resolved.points).find(layer=>layer.id===projectile.layer);if(layer)layers.push(layer);}
  const followed=projectile.followUnit?battle.units.find(unit=>unit.id===projectile.followUnit):undefined;
  if(projectile.followUnit&&!followed)continue;
  const position=followed?{x:followed.x,y:followed.y}:visualProjectilePosition(projectile,time);
  for(const layer of layers.slice(0,2))result.push({key:`motion:${projectile.id}:${layer.id}`,clip:layer.clip,...position,age:time-projectile.createdAt,size:Number(layer.clip.worldSize??3.6),angle:projectile.angle+Math.PI/2,z:.75,loop:true});
 }
 return result;
}

/** Ring frames contain their own expansion. Fit their measured alpha radius
 * to the simulation sweep so atlas expansion is not applied a second time. */
export function worldVisuals(assets:AssetManifest,battle:BattleState,time:number):PlacedVisual[]{
 const result:PlacedVisual[]=[];
 const measurements=radialCalibration as Record<string,{meanRadius:number[];outerRadius95:number[]}>;
 const effects=battle.finished?((battle.visualWorldEffects??[]) as VisualWorldEffect[]).filter(e=>e.skill==='custom_legion_commander_duel'&&e.layer==='victory'&&e.kind==='proc'&&e.createdAt<=battle.time&&e.until>time):activeVisualWorldEffects(battle,time);
 for(const effect of effects){
  const resolved=resolveVisualArt(assets,effect,effect.points);if(!resolved)continue;
  const ids=[effect.layer,...(resolved.id==='custom_tidehunter_ravage'&&effect.layer==='eruption'?['crest']:[])];
  for(const layer of tierVisualLayers(resolved.art,resolved.points).filter(l=>ids.includes(l.id))){
   const clip=layer.clip,calibration=measurements[`${resolved.id}/${layer.id}`];let age=time-effect.createdAt,size=effect.size??Number(clip.worldSize??3.6);
   if(effect.kind==='ring'){
    if(!calibration||(effect.radius??0)<=.01)continue;
    const progress=Math.max(0,Math.min(1,effect.progress??0));let index=Math.round(progress*(clip.frames-1));
    if(resolved.id==='razor_plasma_field'){const half=clip.frames/2;index=Math.round(effect.phase==='inward'?half+progress*(clip.frames-1-half):progress*half);}
    // Transparent start/end cells carry no annulus to fit. Use the nearest
    // authored nonempty frame, with no change to collision or phase timing.
    if(!calibration.meanRadius[index]){let distance=1;while(distance<clip.frames&&!calibration.meanRadius[index]){for(const candidate of[index-distance,index+distance])if(candidate>=0&&candidate<clip.frames&&calibration.meanRadius[candidate]){index=candidate;break;}distance++;}}
    const measured=calibration.meanRadius[index];if(!measured)continue;
    age=index/clip.fps;size=effect.radius!/measured;
   }else if(effect.radius!==undefined&&calibration){const outer=Math.max(...calibration.outerRadius95);if(outer>0)size=effect.radius/outer;}
   result.push({key:`world:${effect.id}:${layer.id}`,clip,x:effect.x,y:effect.y,age,size,angle:effect.angle===undefined?0:effect.angle+Math.PI/2,z:effect.kind==='proc'?.65:.15,loop:effect.loop??false});
  }
 }
 return result;
}

/** Captured events supply positions and provenance. Casts do not stand in for
 * later area explosions, proc successes or a buff which never took effect. */
export function eventVisuals(assets:AssetManifest,event:CombatEvent,units:CombatUnit[]):PlacedVisual[]{
 if(!event.skill||!['cast','hit','heal','status'].includes(event.type))return[];
 if(event.type==='hit'&&(Number(event.amount??0)<=0||event.outcome))return[];
 const caster=units.find(u=>u.id===event.source),points=Number(event.points??caster?.skills.find(s=>s?.id===event.skill)?.points??(event.visualSkill===event.skill?event.visualPoints:undefined)??1);
 const resolved=resolveVisualArt(assets,{skill:event.skill,points,visualSkill:typeof event.visualSkill==='string'?event.visualSkill:undefined,visualPoints:Number(event.visualPoints??points)},points);if(!resolved)return[];
 let layers=event.type==='cast'?selectVisualLayers(resolved.art,resolved.points,'cast'):event.type==='hit'?selectVisualLayers(resolved.art,resolved.points,'hit'):event.type==='heal'?selectVisualLayers(resolved.art,resolved.points,'heal'):[];
 if(event.type==='heal')layers.push(...selectVisualLayers(resolved.art,resolved.points,'proc').filter(l=>l.role==='caster_feedback'));
 // Enter effects belong to a successful modifier application, including
 // acquired transformations, rather than merely owning the ability.
 if(event.type==='status'){
  const kind=String(event.status??'');
  const roles=/^(elderDragon|wolfForm|fleshGolem)$/.test(kind)?['form_enter']:/^(hex)$/.test(kind)?['target_transform_enter']:/^(soulbind|doom|dot|root|silence|shield)$/.test(kind)?['target_apply','target_enter','ally_buff_apply']:[];
  layers=selectVisualLayers(resolved.art,resolved.points,'transition').filter(l=>roles.includes(l.role));
 }
 return layers.slice(0,3).map(layer=>{
  const source=layer.anchor==='source',x=source?(event.type==='cast'?event.x:caster?.x??event.x):event.toX??event.x,y=source?(event.type==='cast'?event.y:caster?.y??event.y):event.toY??event.y;
  return{key:`event:${event.source}:${event.target??''}:${event.skill}:${layer.id}:${Math.floor((event.time+1e-8)*10)}`,clip:layer.clip,x,y,age:0,size:Number(layer.clip.worldSize??3.6),angle:source?(caster?.facing??0)+Math.PI/2:0,z:.7,loop:false};
 });
}

import type {AnimationClip,AssetManifest,CombatUnit,CombatEvent,DamageType} from './model';
import type {BattleBarrier} from './combat/barriers';
import {barrierSkillFamily} from './combat/barriers';
import {selectVisualLayers} from './visual-layers';
import {resolveVisualArt} from './visual-bindings';
import radialCalibration from './radial-art-calibration.json';

export interface BodyPresentation {clip?:AnimationClip;hidden:boolean;skill?:string;prefix?:string}
export function bodyVisibility(u:CombatUnit,viewSide:number,time:number){const has=(kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>time),concealed=(has('invisible')&&!has('revealed'))||has('undetectable');return{hidden:u.side!==viewSide&&concealed,opacity:u.side===viewSide&&concealed ? .45 : 1};}
/** Presentation only: body and socket positions share the same model scale. */
export function bodyVisualScale(u:CombatUnit,time:number):number{return u.statuses.filter(s=>s.kind==='visualScale'&&s.until>time).reduce((scale,s)=>scale*Math.max(.01,s.value??1),1);}
export const COMBAT_TEXT_LIFETIME=1.1;
/** Events are appended in simulation-time order; binary search avoids count truncation. */
export function recentCombatEvents(events:CombatEvent[],time:number,window=COMBAT_TEXT_LIFETIME):CombatEvent[]{
 let low=0,high=events.length;while(low<high){const middle=(low+high)>>>1;if(events[middle].time<time-window)low=middle+1;else high=middle;}return events.slice(low).filter(event=>event.time<=time);
}
export interface CombatTextPacket {key:string;target:string;type:'hit'|'heal';amount:number;x:number;y:number;time:number;lane:number;damageType:DamageType;critical:boolean;damageOverTime:boolean;outcome?:string}
export function combatTextEvents(events:CombatEvent[],time:number):CombatTextPacket[]{
 const packets=new Map<string,CombatTextPacket>();
 for(const [index,event] of events.entries()){if((event.type!=='hit'&&event.type!=='heal')||event.time>time||time-event.time>1.1)continue;
  const target=event.target??event.source,damageType=event.damageType??event.originDamageType??'physical',critical=!!event.flags?.critical,damageOverTime=!!event.flags?.damageOverTime,outcome=typeof event.outcome==='string'?event.outcome:undefined;
  const bucket=Math.floor((event.time+1e-8)/.35),occurrence=damageOverTime?`dot:${bucket}`:`impact:${event.sequence??`${event.time}:${index}`}`,key=`${target}:${event.type}:${damageType}:${critical}:${damageOverTime}:${event.source}:${event.attribution?.abilityId??event.skill??''}:${outcome??''}:${occurrence}`,old=packets.get(key);
  if(old){old.amount+=Number(event.amount??0);if(event.time>=old.time){old.x=event.toX??event.x;old.y=event.toY??event.y;old.time=event.time;}}
  else packets.set(key,{key,target,type:event.type,amount:Number(event.amount??0),x:event.toX??event.x,y:event.toY??event.y,time:event.time,lane:bucket%3-1,damageType,critical,damageOverTime,outcome});
 }
 const lanes=new Map<string,number>();return [...packets.values()].filter(p=>p.amount>=.5||p.outcome==='miss').map(packet=>{const index=lanes.get(packet.target)??0;lanes.set(packet.target,index+1);return{...packet,lane:packet.lane+(index%3-1)*1.4};});
}
const FORM_SKILLS:Record<string,{kind:string;prefix:(points:number)=>string}>={
 dragon_knight_elder_dragon_form:{kind:'elderDragon',prefix:p=>p>=9?'dragon_black':p>=3?'dragon_blue':p>=2?'dragon_red':'dragon_green'},
 lycan_shapeshift:{kind:'wolfForm',prefix:()=> 'wolf'},
 undying_flesh_golem:{kind:'fleshGolem',prefix:()=> 'flesh_golem'}
 ,custom_lone_druid_spirit_link:{kind:'trueForm',prefix:()=> 'truebear'}
};
const TRANSIENT_FORMS:Record<string,{skill:string;layer:string}>={
 waveform:{skill:'morphling_waveform',layer:'liquid'},
 snowball:{skill:'custom_tusk_snowball',layer:'snowball'},
 boulder:{skill:'earth_spirit_rolling_boulder',layer:'boulder'},
 rolling_boulder:{skill:'earth_spirit_rolling_boulder',layer:'boulder'},
 rollingThunder:{skill:'custom_pangolier_rolling_thunder',layer:'ball'},
 rolling_thunder:{skill:'custom_pangolier_rolling_thunder',layer:'ball'},
 supernova:{skill:'custom_phoenix_sun_ray',layer:'egg_idle'}
};
const CHILD_ART:Record<string,string>={aa_granted_voodoo_switcheroo:'custom_witch_doctor_death_ward',zuus_cloud:'zuus_lightning_bolt',clinkz_burning_army:'clinkz_searing_arrows'};
export function basicAttackClip(assets:AssetManifest,u:CombatUnit,time=0):AnimationClip|undefined{
 if(u.statuses.some(s=>s.kind==='elderDragon'&&s.until>time)){const art=assets.skills.dragon_knight_elder_dragon_form as {layers?:Record<string,AnimationClip>}|undefined;if(art?.layers?.dragon_bolt)return art.layers.dragon_bolt;}
 const sourceId=String(u.sourceSkill??''),id=CHILD_ART[sourceId]??sourceId;
 if(u.summoned&&id){const spec=assets.skills[id] as {layers?:Record<string,AnimationClip>}|undefined;const own=Object.values(spec?.layers??{}).find(c=>/^(attack_projectile|projectile)$/.test(String(c.role)));if(own)return own;}
 return assets.projectiles?.[u.role==='archer'?'arrow':'magic_bolt'];
}
const SUMMON_PREFIXES:[RegExp,string[]][]=[
 [/ancient|远古|古代/i,['ancient']],
 [/necro.*archer|死灵.*射手|死灵.*弓箭/i,['necro_archer']],
 [/necro.*warrior|死灵.*战士/i,['necro_warrior']],
 [/hawk|战鹰|雄鹰/i,['hawk']],
 [/boar|野猪|豪猪/i,['boar']],
 [/treant|树人/i,['treant']],
 [/bear|熊灵/i,['bear','spirit_bear']],
 [/zombie|僵尸/i,['zombie']],
 [/familiar|佣兽|佣兵|魔仆/i,['familiar']],
 [/golem|地狱火|傀儡/i,['golem','infernal']],
 [/skeleton|骷髅/i,['skeleton']],
 [/wolf|狼/i,['wolf']],
 [/serpent|蛇棒|蛇杖/i,['ward','serpent']],
 [/soldier|石猴|猴兵/i,['soldier']],
 [/nimbus|雷云/i,['nimbus']],
 [/spider|蜘蛛/i,['spider','spiderling']]
];
function selectAction(layers:Record<string,AnimationClip>,prefix:string,action:string){
 const normalized=action.startsWith('attack')?'attack':action==='controlled'?'disabled':action;
 return layers[`${prefix}_${normalized}`]??layers[`${prefix}_${action}`]??layers[`${prefix}_idle`]??layers[`${prefix}_flap`];
}
/** Only actual simulation states can replace a hero's body. Owning a transform
 * skill does not transform the hero before it has successfully cast. */
export function bodyPresentation(assets:AssetManifest,u:CombatUnit,action:string,time:number,sourceSkill?:string):BodyPresentation{
 const visibleStatuses=u.statuses.filter(s=>s.until>time);
 const hex=visibleStatuses.find(s=>s.kind==='hex');
 if(hex){const spec=assets.skills[hex.skill??'custom_shadow_shaman_voodoo'] as {layers?:Record<string,AnimationClip>}|undefined,prefix=hex.skill==='dazzle_shadow_wave'?'hex':'critter';const clip=selectAction(spec?.layers??{},prefix,action==='move'?'move':'idle');if(clip)return{clip,hidden:false,skill:hex.skill,prefix};}
 const visual=visibleStatuses.find(s=>s.kind==='visualForm');
 if(visual){const data=(visual as unknown as {data?:Record<string,unknown>}).data;if(data?.passenger===true||data?.hidden===true)return{hidden:true};const form=TRANSIENT_FORMS[String(data?.form??'')];if(form){const spec=assets.skills[form.skill] as {layers?:Record<string,AnimationClip>}|undefined;const clip=spec?.layers?.[form.layer];if(clip)return{clip,hidden:false,skill:form.skill,prefix:form.layer};}}
 for(const [id,form] of Object.entries(FORM_SKILLS)){
  const status=visibleStatuses.find(s=>s.kind===form.kind);if(!status)continue;
  const skill=u.skills.find(s=>s?.id===id),points=skill?.points??1;
  const spec=assets.skills[id] as {layers?:Record<string,AnimationClip>}|undefined;
  const prefix=form.prefix(points),clip=selectAction(spec?.layers??{},prefix,action);
  if(clip)return{clip,hidden:false,skill:id,prefix};
 }
 if(u.summoned){
  // Temporary approved-art reuse: the Stone Gaze mud golems have real neutral
  // unit mechanics but no dedicated body in the delivered runtime manifest.
  if(/^npc_dota_neutral_mud_golem(?:_split)?$/.test(String(u.sourceUnitType??''))){
   const id='custom_warlock_chaotic_offering',art=assets.skills[id] as {layers?:Record<string,AnimationClip>}|undefined,clip=selectAction(art?.layers??{},'golem',action);
   if(clip)return{clip:{...clip,worldSize:Number(clip.worldSize??6.4)*(u.sourceUnitType==='npc_dota_neutral_mud_golem_split'?.42:.7)},hidden:false,skill:id,prefix:'golem'};
  }
  const sourceId=String(u.sourceSkill??sourceSkill??''),id=CHILD_ART[sourceId]??sourceId;const spec=assets.skills[id] as {layers?:Record<string,AnimationClip>}|undefined;const layers=spec?.layers??{};
  if(id==='custom_visage_summon_familiars'&&visibleStatuses.some(s=>s.kind==='selfStun'&&s.skill==='visage_summon_familiars_stone_form'&&typeof(s as typeof s&{data?:Record<string,unknown>}).data?.stoneRun==='string')&&layers.familiar_stone)return{clip:layers.familiar_stone,hidden:false,skill:id,prefix:'familiar_stone'};
  const explicit=id==='custom_lycan_summon_wolves'&&u.bigBadWolf?'bigwolf':typeof u.visualBody==='string'?u.visualBody:undefined;
  if(explicit&&layers[explicit]?.role==='world_prop')return{clip:layers[explicit],hidden:false,skill:id,prefix:explicit};
  const named=SUMMON_PREFIXES.filter(([name])=>name.test(u.name)).flatMap(([,prefixes])=>prefixes);
  for(const prefix of [...(explicit?[explicit]:[]),...named]){const clip=selectAction(layers,prefix,action);if(clip)return{clip,hidden:false,skill:id,prefix};}
  const desired=u.dead?'summon_death':action.startsWith('attack')?'summon_attack':action==='move'?'summon_move':'summon_idle';
  const clip=Object.values(layers).find(c=>c.role===desired)??Object.values(layers).find(c=>c.role==='summon_body'||c.role==='summon_idle');
  if(clip)return{clip,hidden:false,skill:id};
 }
 return{hidden:false};
}

export interface BarrierPresentation {key:string;clip:AnimationClip;x:number;y:number;angle:number;age:number;width:number;height:number;loop?:boolean}
export interface LinePresentation {key:string;clip:AnimationClip;x:number;y:number;angle:number;age:number;width:number;height:number}
export interface ShadowPath {id:string;source:string;skill:string;from:{x:number;y:number};to:{x:number;y:number};createdAt:number;until:number}
export function shadowPathPresentations(assets:AssetManifest,paths:ShadowPath[],time:number):LinePresentation[]{
 const spec=assets.skills.custom_spectre_dispersion as {layers?:Record<string,AnimationClip>}|undefined,clip=spec?.layers?.shadow_path;if(!clip)return[];
 return paths.filter(p=>p.until>time).map(p=>({key:`trail:${p.id}`,clip,x:(p.from.x+p.to.x)/2,y:(p.from.y+p.to.y)/2,angle:Math.atan2(p.to.y-p.from.y,p.to.x-p.from.x)-Math.PI/2,age:time-p.createdAt,width:Number(clip.worldSize??4.8),height:Math.max(.2,Math.hypot(p.to.x-p.from.x,p.to.y-p.from.y)/.57)}));
}
/** Approved per-frame sockets are normalized in the source cell, independent
 * of desktop/mobile atlas resolution. A body without a declared emitter uses
 * its pivot rather than borrowing another profession's staff socket. */
export function actorEmitter(assets:AssetManifest,u:CombatUnit,time:number):{x:number;y:number}{
 const clips=assets.characters[`${u.role}-${u.skin}`],action=clips?.[u.action]??clips?.channel,release=clips?.cast;
 if(!action||u.summoned)return{x:u.x,y:u.y};
 const socket=(release?.events as {socket?:string}[]|undefined)?.find(e=>e.socket)?.socket;
 const frames=action.sockets as Record<string,[number,number]>[]|undefined;
 if(!socket||!frames?.length)return{x:u.x,y:u.y};
 const index=atlasFrame(action,time-u.actionStart,Boolean(action.loop)).index,point=frames[index]?.[socket];
 if(!point)return{x:u.x,y:u.y};
 const size=Number(action.worldSize??3.6)*bodyVisualScale(u,time),pivot=action.pivot??[.5,.3888889],x=(point[0]-pivot[0])*size,y=-(point[1]-pivot[1])*size,angle=u.facing+Math.PI/2;
 return{x:u.x+x*Math.cos(angle)-y*Math.sin(angle),y:u.y+x*Math.sin(angle)+y*Math.cos(angle)};
}
export function linePresentations(assets:AssetManifest,units:CombatUnit[],time:number):LinePresentation[]{
 const result:LinePresentation[]=[],used=new Set<string>();
 const line=(key:string,clip:AnimationClip,from:{x:number;y:number},to:{x:number;y:number},width:number)=>{if(used.has(key))return;used.add(key);const length=Math.hypot(to.x-from.x,to.y-from.y);if(length<.01||!Number.isFinite(length))return;result.push({key,clip,x:(from.x+to.x)/2,y:(from.y+to.y)/2,angle:Math.atan2(to.y-from.y,to.x-from.x)-Math.PI/2,age:time,width,height:length/.67});};
 const live=(id:unknown)=>units.find(u=>u.id===id&&!u.dead);
 for(const u of units){if(u.dead)continue;
  for(const raw of u.statuses){if(raw.until<=time||!raw.skill)continue;
   const status=raw as typeof raw&{data?:Record<string,unknown>;visualSkill?:string;visualPoints?:number};
   const source=live(status.source),points=source?.skills.find(s=>s?.id===status.skill)?.points??1;
   const resolved=resolveVisualArt(assets,{...status,skill:raw.skill},points);if(!resolved)continue;
   const data=status.data??{},layers=selectVisualLayers(resolved.art,resolved.points,'link',typeof data.layer==='string'?[data.layer]:undefined);
   if(status.kind==='visualBeam'){
    const clip=layers.find(l=>l.role==='directed_channel')?.clip,aimX=Number(data.aimX),aimY=Number(data.aimY);
    if(clip&&Number.isFinite(aimX)&&Number.isFinite(aimY)){const start=actorEmitter(assets,u,time),length=Number(data.length??12);line(`beam:${u.id}:${status.skill}`,clip,start,{x:start.x+aimX*length,y:start.y+aimY*length},Number(clip.worldSize??4.4)*Number(data.widthMultiplier??1));}
   }
   if(status.kind==='soulbind'){
    const clip=layers.find(l=>l.role==='connection')?.clip;if(!clip)continue;
    const anchor=live(data.anchorId??u.id),group=String(data.group??data.partnerId??'').split(',');if(!anchor)continue;
    for(const id of group){const partner=live(id);if(!partner||partner.id===anchor.id)continue;const pair=[anchor.id,partner.id].sort().join(':');line(`bind:${status.source}:${data.token??status.skill}:${pair}`,clip,anchor,partner,Number(clip.worldSize??4.8));}
   }
   if(['visualLink','spiritSiphon','staticLink','tether'].includes(status.kind)){
    if(!source)continue;
    const partner=status.kind==='tether'?live(data.partnerId):u;if(!partner)continue;
    const clip=layers.find(l=>l.role!=='directed_channel')?.clip;
    if(clip)line(`link:${source.id}:${partner.id}:${status.skill}`,clip,data.beneficiaryId===source.id?source:actorEmitter(assets,source,time),partner,Number(clip.worldSize??4.8));
   }
  }
 }
 return result;
}
/** Collision segments are simulation data. A curved ice wall has one authored
 * body per cast; a long straight ridge tiles its short authored section. */
export function barrierPresentations(assets:AssetManifest,walls:BattleBarrier[],time:number):BarrierPresentation[]{
 const result:BarrierPresentation[]=[],groups=new Set<string>();
 for(const wall of walls){
  if(wall.until<=time)continue;
  const spec=assets.skills[barrierSkillFamily(wall.skill)] as {layers?:Record<string,AnimationClip>}|undefined;
  const clip=Object.values(spec?.layers??{}).find(c=>c.role==='ground_barrier'||c.role==='world_prop');
  if(!clip)continue;
  if(wall.visual){
   const visual=wall.visual;if(groups.has(visual.group))continue;groups.add(visual.group);
   if(wall.skill==='mars_arena_of_blood'&&visual.circleRadius!==undefined){
    const samples=radialCalibration['mars_arena_of_blood/arena_wall'].meanRadius.filter(r=>r>0),measured=samples.reduce((n,r)=>n+r,0)/samples.length,size=visual.circleRadius/measured;
    result.push({key:`wall:${visual.group}`,clip,x:visual.centerX,y:visual.centerY,angle:0,age:time-wall.createdAt,width:size,height:size,loop:true});continue;
   }
   const members=walls.filter(w=>w.visual?.group===visual.group&&w.until>time);
   if(barrierSkillFamily(wall.skill)==='custom_earthshaker_fissure'&&members.every(w=>w.from.x===w.to.x&&w.from.y===w.to.y)){
    // A row of real circular cells still has finite thickness. Tile the ridge
    // across its measured axial extent; collision remains in the simulation.
    const dx=Math.cos(visual.angle),dy=Math.sin(visual.angle),bounds=members.map(w=>({at:(w.from.x-visual.centerX)*dx+(w.from.y-visual.centerY)*dy,radius:w.width/2}));
    const from=Math.min(...bounds.map(p=>p.at-p.radius)),to=Math.max(...bounds.map(p=>p.at+p.radius)),length=to-from,count=Math.max(1,Math.ceil(length/3)),width=Math.max(...members.map(w=>w.width));
    for(let i=0;i<count;i++){const at=from+(i+.5)*length/count;result.push({key:`wall:${visual.group}:${i}`,clip,x:visual.centerX+dx*at,y:visual.centerY+dy*at,angle:visual.angle-Math.PI/2,age:time-wall.createdAt,width:width/.14,height:(length/count)/.57});}
    continue;
   }
   const cosine=Math.cos(visual.angle),sine=Math.sin(visual.angle);
   const local=walls.filter(w=>w.visual?.group===visual.group).flatMap(w=>[w.from,w.to]).map(p=>({x:-(p.x-visual.centerX)*sine+(p.y-visual.centerY)*cosine,y:-(p.x-visual.centerX)*cosine-(p.y-visual.centerY)*sine}));
   const minX=Math.min(...local.map(p=>p.x)),maxX=Math.max(...local.map(p=>p.x)),minY=Math.min(...local.map(p=>p.y)),maxY=Math.max(...local.map(p=>p.y));
   // Measured opaque bounds in the approved frame: x ±.22, y -.25…+.15.
   // Fit each axis independently: Super lengthens the opening without widening
   // the closed end. This mapping never changes collision geometry.
   const width=(maxX-minX)/.44,height=(maxY-minY)/.4;
   const offsetX=(minX+maxX)/2,offsetY=(minY+maxY)/2+.05*height;
   result.push({key:`wall:${visual.group}`,clip,x:visual.centerX-sine*offsetX-cosine*offsetY,y:visual.centerY+cosine*offsetX-sine*offsetY,angle:visual.angle+Math.PI/2,age:time-wall.createdAt,width,height});
  }else{
   const dx=wall.to.x-wall.from.x,dy=wall.to.y-wall.from.y,length=Math.hypot(dx,dy),count=Math.max(1,Math.ceil(length/3));
   for(let i=0;i<count;i++){const t=(i+.5)/count;result.push({key:`wall:${wall.id}:${i}`,clip,x:wall.from.x+dx*t,y:wall.from.y+dy*t,angle:Math.atan2(dy,dx)-Math.PI/2,age:time-wall.createdAt,width:wall.width/.14,height:(length/count)/.57});}
  }
 }
 return result;
}

/** Sample within cell centers, preventing linear filtering from borrowing an
 * adjacent animation frame at atlas boundaries. */
export function atlasFrame(clip:AnimationClip,age:number,loop:boolean){
 const rows=Math.ceil(clip.frames/clip.columns),raw=Math.floor(Math.max(0,age)*clip.fps),index=loop?raw%clip.frames:Math.min(clip.frames-1,raw);
 const w=clip.frameWidth*clip.columns,h=clip.frameHeight*rows;
 return{index,repeatX:(clip.frameWidth-1)/w,repeatY:(clip.frameHeight-1)/h,
 offsetX:((index%clip.columns)*clip.frameWidth+.5)/w,
 offsetY:1-(Math.floor(index/clip.columns)*clip.frameHeight+clip.frameHeight-.5)/h};
}

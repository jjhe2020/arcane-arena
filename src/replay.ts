import {createBattle,stepBattle,battleGains,FIXED_STEP,BATTLE_TIME_LIMIT,COMBAT_VERSION,type InitialBattle,type SpellOrderInput} from './combat';
import {MECHANICS_HASH} from './config';
import {SIMULATION_REVISION} from './simulation-version';
import {GRANTED_SKILL_DEFINITIONS} from './skill-effects';
import {snapshotBattleStats} from './combat/statistics';
import {BATTLE_BOUNDS} from './arena-layout';
import type {BattleState,Player,SkillDefinition} from './model';
import version from '../package.json';

export interface ReplaySummary {
  finished:boolean;winner:number|null;duration:number;ticks:number;rng:number;survivors:number;
  stats:ReturnType<typeof snapshotBattleStats>;gains:ReturnType<typeof battleGains>;checksum:string;
}
export interface BattleReplayFile {
  format:'arcane-arena-battle';schemaVersion:1;id:string;release:string;createdAt:string;
  simulationRevision:string;mechanicsHash:string;catalogHash:string;initial:InitialBattle;
  ghostSide?:number;spellOrders:SpellOrderInput[];targetTick:number;expected:ReplaySummary;
}
export const MAX_REPLAY_BYTES=2*1024*1024;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v:unknown,min=-1e7,max=1e7):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(v:unknown,max=256):v is string=>typeof v==='string'&&v.length<=max;
const safeId=(v:unknown):v is string=>text(v,160)&&/^[a-zA-Z0-9_.:-]+$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
function canonical(v:unknown):string {
  if(Array.isArray(v))return '['+v.map(x=>canonical(x??null)).join(',')+']';
  if(record(v))return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v)??'null';
}
/** A deterministic corruption/consistency check, not a cryptographic signature. */
export function replayHash(value:unknown):string {
  const input=canonical(value);let a=2166136261,b=0x9e3779b9;
  for(let i=0;i<input.length;i++){a=Math.imul(a^input.charCodeAt(i),16777619);b=Math.imul(b^input.charCodeAt(i),2246822519);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function replayCatalogHash(definitions:SkillDefinition[]):string {
  return replayHash([...GRANTED_SKILL_DEFINITIONS,...definitions].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>[d.id,d.passive,d.ultimate,d.tags,d.categories,d.values,d.cooldowns,d.mana,d.balanceLevels,d.descriptionEn]));
}
export function replaySummary(battle:BattleState):ReplaySummary {
  return {finished:battle.finished,winner:battle.winner,duration:battle.time,ticks:Number(battle.tickCount??0),rng:battle.rng,
    survivors:battle.units.filter(u=>!u.dead&&!u.summoned&&u.side===battle.winner).length,
    stats:snapshotBattleStats(battle),gains:battleGains(battle),
    checksum:replayHash({units:battle.units,events:battle.events,rng:battle.rng,winner:battle.winner,time:battle.time})};
}
export function createReplayFile(battle:BattleState,definitions:SkillDefinition[]):BattleReplayFile {
  if(!battle.initial)throw Error('此战报没有可用的开局输入，无法补录录像');
  const initial=structuredClone(battle.initial) as InitialBattle,expected=replaySummary(battle),spellOrders=structuredClone((battle.spellOrders??[]) as SpellOrderInput[]);
  const id='replay-'+replayHash({initial,spellOrders,expected});
  return {format:'arcane-arena-battle',schemaVersion:1,id,release:`v${version.version}-${version.releaseRevision}`,createdAt:new Date().toISOString(),
    simulationRevision:SIMULATION_REVISION,mechanicsHash:MECHANICS_HASH,catalogHash:replayCatalogHash(definitions),initial,
    ...(typeof battle.ghostSide==='number'?{ghostSide:battle.ghostSide}:{}),spellOrders,targetTick:expected.ticks,expected};
}
function numericRecord(v:unknown):boolean {return record(v)&&Object.keys(v).length<=256&&Object.entries(v).every(([k,n])=>safeId(k)&&finite(n));}
function validPlayer(value:unknown,definitions:Map<string,SkillDefinition>):value is Player {
  if(!record(value)||!integer(value.id,0,7)||!text(value.name,100)||!finite(value.hp,0)||!finite(value.gold,0)||!integer(value.shopLevel,1,5)||typeof value.locked!=='boolean'||!Array.isArray(value.heroes)||value.heroes.length<1||value.heroes.length>5)return false;
  const ids=new Set<string>();
  return value.heroes.every(h=>{
    if(!record(h)||!safeId(h.id)||ids.has(h.id)||!text(h.name,100)||!['assassin','archer','mage','tank'].includes(String(h.role))||!['female','male'].includes(String(h.skin))||!finite(h.x,-BATTLE_BOUNDS.x,BATTLE_BOUNDS.x)||!finite(h.y,-BATTLE_BOUNDS.y,BATTLE_BOUNDS.y)||!Array.isArray(h.skills)||h.skills.length>4)return false;
    ids.add(h.id);
    if(['persistentAttackBonus','persistentStrengthBonus','persistentAgilityBonus','persistentIntelligenceBonus'].some(k=>h[k]!==undefined&&!finite(h[k])))return false;
    if(h.persistentBuffs!==undefined&&(!record(h.persistentBuffs)||Object.entries(h.persistentBuffs).some(([k,v])=>!safeId(k)||!numericRecord(v))))return false;
    return h.skills.every(s=>s===null||(record(s)&&safeId(s.id)&&definitions.has(s.id)&&integer(s.points,1,9)&&(s.instanceId===undefined||safeId(s.instanceId))&&(s.superRound===undefined||integer(s.superRound,1,10000))&&(s.lineage===undefined||(Array.isArray(s.lineage)&&s.lineage.length<=9&&s.lineage.every(safeId)))&&(s.persistentState===undefined||numericRecord(s.persistentState))));
  });
}
function invalid():never {throw Error('录像文件格式或开局数据无效');}
export function parseReplayFile(raw:string,definitions:SkillDefinition[]):BattleReplayFile {
  if(new TextEncoder().encode(raw).length>MAX_REPLAY_BYTES)throw Error('录像文件超过 2 MB 限制');
  let value:unknown;try{value=JSON.parse(raw);}catch{invalid();}
  if(!record(value)||value.format!=='arcane-arena-battle'||value.schemaVersion!==1||!safeId(value.id)||!text(value.release,100)||!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.release)||!text(value.createdAt,100)||!text(value.simulationRevision)||!text(value.mechanicsHash)||!text(value.catalogHash)||!record(value.initial))invalid();
  const initial=value.initial,defs=new Map(definitions.map(d=>[d.id,d]));
  if(!integer(initial.seed,0,0xffffffff+7)||!integer(initial.version,1,10000)||!text(initial.simulationRevision)||!text(initial.configHash)||!integer(initial.round,1,10000)||!validPlayer(initial.a,defs)||!validPlayer(initial.b,defs)||initial.a.id===initial.b.id)invalid();
  if(value.simulationRevision!==SIMULATION_REVISION||initial.simulationRevision!==SIMULATION_REVISION||initial.version!==COMBAT_VERSION||value.mechanicsHash!==MECHANICS_HASH||initial.configHash!==MECHANICS_HASH||value.catalogHash!==replayCatalogHash(definitions))throw Error(`录像版本或配置不兼容，请使用 ${value.release}：https://github.com/jjhe2020/arcane-arena/releases/tag/${value.release}`);
  const maxTicks=Math.ceil(BATTLE_TIME_LIMIT/FIXED_STEP)+1;
  if(!integer(value.targetTick,0,maxTicks)||!Array.isArray(value.spellOrders)||value.spellOrders.length>4096||(value.ghostSide!==undefined&&value.ghostSide!==initial.a.id&&value.ghostSide!==initial.b.id))invalid();
  let previous=0;
  for(const order of value.spellOrders){
    if(!record(order)||!integer(order.tick,previous,maxTicks)||order.tick<1||!safeId(order.unitId)||!integer(order.slot,0,63)||!safeId(order.skillId)||!['unit','point'].includes(String(order.kind)))invalid();
    if(order.kind==='unit'?!safeId(order.targetId):!record(order.position)||!finite(order.position.x,-BATTLE_BOUNDS.x,BATTLE_BOUNDS.x)||!finite(order.position.y,-BATTLE_BOUNDS.y,BATTLE_BOUNDS.y))invalid();
    previous=order.tick;
  }
  const expected=value.expected;
  if(!record(expected)||typeof expected.finished!=='boolean'||(expected.winner!==null&&expected.winner!==initial.a.id&&expected.winner!==initial.b.id)||!finite(expected.duration,0,BATTLE_TIME_LIMIT+FIXED_STEP)||expected.ticks!==value.targetTick||!integer(expected.rng,0,0xffffffff)||!integer(expected.survivors,0,10000)||!text(expected.checksum,32)||!Array.isArray(expected.stats)||!Array.isArray(expected.gains))invalid();
  return structuredClone(value) as unknown as BattleReplayFile;
}
export function beginReplay(file:BattleReplayFile,definitions:SkillDefinition[]):BattleState {
  const battle=createBattle(file.initial.a,file.initial.b,file.initial.seed,definitions,undefined,file.initial.round);
  battle.spellOrders=structuredClone(file.spellOrders);if(file.ghostSide!==undefined)battle.ghostSide=file.ghostSide;
  return battle;
}
export function verifyReplay(file:BattleReplayFile,battle:BattleState):boolean {return canonical(replaySummary(battle))===canonical(file.expected);}
/** Reconstruct closures from the frozen inputs. Yielding never changes tick order. */
export async function seekReplay(file:BattleReplayFile,tick:number,definitions:SkillDefinition[],cancelled:()=>boolean=()=>false):Promise<BattleState|null> {
  const battle=beginReplay(file,definitions),target=Math.max(0,Math.min(file.targetTick,Math.floor(tick)));
  while(Number(battle.tickCount)<target&&!battle.finished){
    const deadline=performance.now()+8;do{if(cancelled())return null;stepBattle(battle,FIXED_STEP,definitions);}while(Number(battle.tickCount)<target&&!battle.finished&&performance.now()<deadline);
    if(Number(battle.tickCount)<target&&!battle.finished)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  return cancelled()?null:battle;
}

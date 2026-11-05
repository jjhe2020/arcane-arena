import type {Hero, Player, Role, SkillDefinition} from './model';

// Power concepts and source-era values from https://www.abilityarena.com/data/gods.json.
export const GODS = {
  aghanim: {name:'Aghanim', zh:'阿哈利姆', power:'傻瓜魔法书 · 第一卷', description:'回合结算时，以 40%～60% 的概率给随机一个已拥有的技能永久加 1 点。概率随商店等级提高，连续两次成功升级会选不同技能，需要共享池中还有库存。', strategy:'尽早铺开技能，并提升商店等级。'},
  bathtimeAghanim: {name:'Bathtime Aghanim', zh:'沐浴阿哈利姆', power:'傻瓜魔法书 · 第四卷', description:'商店达到 2／4／5 级时，每场战斗会各随机挑一个对应区间的已装备技能，由 1–2／3–5／6–8 点临时提升到 3／6／9 点。', strategy:'尽快提升商店等级，保留各个升阶区间的已装备技能。'},
  bonelessAghanim: {name:'Boneless Aghanim', zh:'无骨阿哈利姆', power:'傻瓜魔法书 · 第三卷', description:'商店只出售基础技能。各级商品位为 5／7／9／10／11 个，商店升级基础价格降低 20%。', strategy:'提早升级商店，用更多基础技能商品追高点数。'},
  vacationAghanim: {name:'Vacation Aghanim', zh:'度假阿哈利姆', power:'傻瓜魔法书 · 第五卷', description:'每个新商品位有 7% 概率出售双点技能，花 4 金币获得同名技能的 2 点，商品需要共享池中还有第二份库存。', strategy:'优先购买可装配的双点商品，抓住低成本跨阶机会。'},
  sideshopMan: {name:'Sideshop Man', zh:'边路商店老板', power:'清仓大甩卖', description:'每轮首次手动刷新商店免费，出售技能时每点返还 3 金币。', strategy:'先买有价值的重复技能，再利用免费刷新寻找合适的新技能。'},
  legionCommander: {name:'Legion Commander', zh:'军团指挥官', power:'石堂长枪', description:'每次开战永久累积攻击力，按全队已装备技能每 15 点增加一档，每轮累积 4／7／10／13／16／19 点。累积值全部授予指定英雄。', strategy:'积累全队技能点数，将长枪交给攻速快的物理核心。'},
  centaur: {name:'Centaur', zh:'半人马战行者', power:'强健体魄', description:'指定英雄按当前战斗回合每轮获得 70 最大生命，反弹受到的物理普攻伤害的 35%。', strategy:'把祝福给前排坦克，搭配续航、控制与减伤。'},
  selemene: {name:'Selemene', zh:'赛莉蒙妮', power:'暗月祝福', description:'友方英雄每为技能花费 1 点魔法，全队英雄获得本场持续的 0.015% 技能伤害增幅。', strategy:'选高耗蓝主动技能、回蓝技能和法术输出。'},
  ogreMagi: {name:'Ogre Magi', zh:'食人魔魔法师', power:'多重施法', description:'指定英雄的常规主动技能有概率免费施放第二次。全队已装备技能每 20 点增加一档，概率为 35／45／55／65／75／100%。引导、切换、派生和替代普攻的技能除外。', strategy:'将多重施法授予主动技能最多的法师，优先购买可重复施放的技能。'},
  phantomAssassin: {name:'Phantom Assassin', zh:'幻影刺客', power:'魅影契约', description:'己方英雄普攻有 20% 概率造成 150% 暴击。每主动行走约 1 战场单位，暴击倍率增加 2.5 个百分点，战斗间重置。', strategy:'优先近战突进英雄、移速和普攻收益技能。'},
  kanna: {name:'Kanna', zh:'卡娜', power:'弱肉强食', description:'友方每生成一个真实召唤单位，指定英雄和所有真实召唤单位获得 5 攻速。攻速累计到本场战斗结束。', strategy:'优先召唤技能，让受祝福的物理核心从召唤数量获益。'},
} as const;

export type GodId = keyof typeof GODS;
export const GOD_IDS = Object.keys(GODS) as GodId[];
export const DEFAULT_GOD:GodId = 'aghanim';
export const GOD_OPENING_ROLE:Partial<Record<GodId,Role>> = {
  centaur:'tank',legionCommander:'archer',selemene:'mage',ogreMagi:'mage',phantomAssassin:'assassin',kanna:'archer',
};
export const GOD_SKILLS = {
  centaur:'god_centaur_retaliate', selemene:'god_selemene_dark_moon',
  legionCommander:'god_legion_stonehall_pike', ogreMagi:'god_ogre_multicast',
  phantomAssassin:'god_pa_veiled_pact', kanna:'god_kanna_prey_on_the_weak',
} as const;

export interface GodSelection {
  id:GodId;
  targetHeroId?:string;
  legionAttack?:number;
  lastUpgraded?:string;
  freeRerollUsed?:boolean;
  doubleSlots?:number[];
}

export function isGodId(id:unknown):id is GodId {
  return typeof id==='string'&&Object.hasOwn(GODS,id);
}

export function isTargetedGod(id:GodId):boolean {
  return id==='legionCommander'||id==='centaur'||id==='ogreMagi'||id==='kanna';
}

export function validGodSelection(value:unknown, heroes:unknown[], shop:unknown, ids:Set<string>):boolean {
  if(value===undefined)return true;
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const god=value as Record<string,unknown>;
  if(!isGodId(god.id))return false;
  if(god.targetHeroId!==undefined&&(!isTargetedGod(god.id)||typeof god.targetHeroId!=='string'||!heroes.some(h=>h&&typeof h==='object'&&(h as {id?:unknown}).id===god.targetHeroId)))return false;
  if(god.legionAttack!==undefined&&(god.id!=='legionCommander'||typeof god.legionAttack!=='number'||!Number.isInteger(god.legionAttack)||god.legionAttack<0||god.legionAttack>190000))return false;
  if(god.lastUpgraded!==undefined&&(god.id!=='aghanim'||typeof god.lastUpgraded!=='string'||!ids.has(god.lastUpgraded)))return false;
  if(god.freeRerollUsed!==undefined&&(god.id!=='sideshopMan'||typeof god.freeRerollUsed!=='boolean'))return false;
  if(god.doubleSlots!==undefined&&(god.id!=='vacationAghanim'||!Array.isArray(shop)||!Array.isArray(god.doubleSlots)||new Set(god.doubleSlots).size!==god.doubleSlots.length||god.doubleSlots.some(slot=>!Number.isInteger(slot)||slot<0||slot>=shop.length||typeof shop[slot]!=='string')))return false;
  return true;
}

export function godTarget(player:Player):Hero|undefined {
  return player.heroes.find(hero=>hero.id===player.god?.targetHeroId)??player.heroes[0];
}

export function equippedGodPoints(player:Player):number {
  return player.heroes.reduce((sum,hero)=>sum+hero.skills.reduce((points,skill)=>points+(skill?.points??0),0),0);
}

export function legionAttackForRound(points:number):number {return 4+3*Math.min(5,Math.floor(points/15));}
export function ogreMulticastChance(points:number):number {return [.35,.45,.55,.65,.75,1][Math.min(5,Math.floor(points/20))];}
export const BONELESS_SHOP_SLOTS = [5,7,9,10,11] as const;
export const VACATION_DOUBLE_PRICE = 4;

function skillText(def:SkillDefinition):string {
  return [def.nameEn,...def.tags,...def.categories,def.descriptionEn].join(' ').toLowerCase();
}

const attackSkill=/attack speed|attack damage|critical|lifesteal|attack range|attack modifier/;
const defenseSkill=/armor|health|shield|damage reduc|taunt|heal|lifesteal|stun/;
const summonSkill=/\bsummons?\b|summon(?:ing|ed)|\b(?:treant|golem|familiar|skeleton|wolf|ward|eidolon)s?\b/;
const manaSkill=/mana regen|restore[s]? mana|restores? .* mana|mana restoration|mana cost|replenish/;
const mobilitySkill=/blink|movement speed|move speed|charge|leap|dash/;

export function godSkillScore(id:GodId|undefined,def:SkillDefinition,role:Role,blessed:boolean):number {
  const text=skillText(def),physical=role==='archer'||role==='assassin';
  switch(id){
    case 'bonelessAghanim':return def.passive?4:2;
    case 'legionCommander':return (physical&&attackSkill.test(text)?11:0)+(blessed&&attackSkill.test(text)?8:0);
    case 'centaur':return role==='tank'&&defenseSkill.test(text)?(blessed?22:12):0;
    case 'selemene':return (manaSkill.test(text)?13:0)+(!def.passive&&role==='mage'?6+Math.min(12,Math.max(0,...def.mana)/18):0);
    case 'ogreMagi':return !def.passive&&role==='mage'&&!/channel|toggle/.test(text)?(blessed?21:10):0;
    case 'phantomAssassin':return (physical&&attackSkill.test(text)?11:0)+(role==='assassin'&&mobilitySkill.test(text)?17:0);
    case 'kanna':return (summonSkill.test(text)?24:0)+(physical&&attackSkill.test(text)?(blessed?13:6):0);
    default:return 0;
  }
}

export function godTargetScore(id:GodId,hero:Hero,catalog:ReadonlyMap<string,SkillDefinition>):number {
  const roleScore:Record<Role,number>=id==='centaur'?{tank:40,assassin:8,archer:0,mage:2}:id==='ogreMagi'?{mage:28,tank:4,assassin:6,archer:0}:{archer:27,assassin:25,tank:5,mage:0};
  return roleScore[hero.role]+hero.skills.reduce((score,stack)=>{
    const def=stack&&catalog.get(stack.id);if(!stack||!def)return score;
    const text=skillText(def);
    const fit=id==='centaur'?defenseSkill.test(text):id==='ogreMagi'?!def.passive&&!/channel|toggle/.test(text):attackSkill.test(text);
    return score+(fit?4+stack.points:0);
  },0);
}

import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {buffCatalogCoverage,buffRemainingFraction,combatUnitBuffs,heroPersistentBuffs} from '../src/buffs';
import {buffDetailsHTML,unitBuffsHTML} from '../src/buffs-ui';
import type {CombatUnit,Hero,Player,SkillDefinition} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';
import {createBattle,stepBattle} from '../src/combat';
import skillCatalog from '../public/data/skills.json';

const definition=(id:string,name=id):SkillDefinition=>({id,name,nameEn:name,description:'',descriptionEn:'',tags:[],super:'',gaben:'',values:[],cooldowns:[],mana:[],categories:[],icon:`/art/${id}.webp`,passive:false,ultimate:false});
const unit=(statuses:EffectStatus[]=[])=>({id:'0:h1',name:'单位',role:'mage',skin:'male',side:0,skills:[],statuses} as unknown as CombatUnit);
const timed=(kind:string,options:Partial<EffectStatus>={}):EffectStatus=>({kind,skill:'skill',source:'1:h2',appliedAt:0,until:10,...options});
const hero=(state:Record<string,number>):Hero=>({id:'h1',name:'英雄',role:'mage',skin:'male',x:0,y:0,skills:[{id:'skill',points:6,persistentState:state}]});

describe('共享 Buff 展示投影',()=>{
 it('组合机制聚合为一个来源效果，各分量准确显示，源技能图标保留',()=>{
  const buffs=combatUnitBuffs(unit([timed('attackSpeed',{value:50}),timed('haste',{value:.2})]),5,[definition('skill','强化')],[{id:'1:h2',name:'敌方来源'} as CombatUnit]);
  expect(buffs).toHaveLength(1);expect(buffs[0]).toMatchObject({name:'强化',icon:'/art/skill.webp',sourceName:'敌方来源',stacks:1,lifecycle:'timed'});expect(buffs[0].effects).toEqual(['攻击速度 +50。','移动速度提高 +20%。']);expect(buffRemainingFraction(buffs[0],5)).toBe(.5);
 });
 it('不同来源/技能实例、正负和临时永久效果分开，快照不被投影修改',()=>{
  const u=unit([timed('agility',{value:3,maxStacks:100}),timed('agility',{value:3,maxStacks:100,source:'2:h3'}),timed('agility',{value:-1,harmful:true}),timed('agility',{value:3,attribution:{abilityId:'skill',skillInstanceId:'other'}}),timed('agility',{value:2,skill:'skill:persistent',until:1e6})]),before=JSON.stringify(u);
  const buffs=combatUnitBuffs(u,1,[definition('skill')]);expect(buffs).toHaveLength(5);expect(buffs.filter(b=>b.lifecycle==='permanent')).toHaveLength(1);expect(buffs.filter(b=>b.polarity==='negative')).toHaveLength(1);expect(JSON.stringify(u)).toBe(before);
 });
 it('独立属性叠层只计算一次层数，边框指向最早到期的那层',()=>{
  const statuses=['strength','agility','intelligence'].flatMap(kind=>[timed(kind,{maxStacks:100,value:-1,harmful:true}),timed(kind,{maxStacks:100,value:-1,harmful:true,appliedAt:2,until:12})]);
  const buffs=combatUnitBuffs(unit(statuses),5,[definition('skill')]);expect(buffs).toHaveLength(1);expect(buffs[0]).toMatchObject({stacks:2,appliedAt:0,expiresAt:10,independentStacks:true});expect(buffs[0].effects).toEqual(['力量 -2。','敏捷 -2。','智力 -2。']);expect(buffRemainingFraction(buffs[0],5)).toBe(.5);
 });
 it('计数值、消耗次数与分条叠层分别读取，不按组件数量算层',()=>{
  expect(combatUnitBuffs(unit([timed('fierySoul',{value:4}),timed('attackSpeed',{value:120})]),1,[definition('skill')])[0].stacks).toBe(4);
  expect(combatUnitBuffs(unit([timed('refraction',{value:8,remaining:3})]),1,[definition('skill')])[0].stacks).toBe(3);
  expect(combatUnitBuffs(unit([timed('warpath',{value:1,maxStacks:6}),timed('warpath',{value:1,maxStacks:6})]),1,[definition('skill')])[0].stacks).toBe(2);
 });
 it('隐藏内部标记，过期状态消失；未收录状态保留诊断信息',()=>{
  const buffs=combatUnitBuffs(unit([timed('slardarPrepared'),timed('stun',{until:1}),timed('newEngineEffect')]),2,[definition('skill')]);expect(buffs).toHaveLength(1);expect(buffs[0].unknown).toBe(true);expect(buffCatalogCoverage(['stun','newEngineEffect']).unknown).toEqual(['newEngineEffect']);
 });
 it('光环与永久状态边框高亮，普通长持续技能仍然倒计时',()=>{
  const buffs=combatUnitBuffs(unit([timed('attackPct',{skill:'vengefulspirit_command_aura',until:.2,value:.3}),timed('stun',{until:120}),timed('armor',{presentation:{lifecycle:'permanent'},until:120,value:3})]),.1,[definition('skill')]);
  const aura=buffs.find(b=>b.lifecycle==='aura')!,permanent=buffs.find(b=>b.lifecycle==='permanent')!,stun=buffs.find(b=>b.effects.some(e=>e.includes('不能移动、攻击')))!;expect(aura).toBeDefined();expect(buffRemainingFraction(aura,.15)).toBe(1);expect(buffRemainingFraction(permanent,60)).toBe(1);expect(buffRemainingFraction(stun,60)).toBe(.5);expect(buffRemainingFraction(stun,120)).toBe(0);
 });
 it('永久技能成长在布阵中显示，战斗时不重复计算已有状态，原始数据不改写',()=>{
  const h=hero({'skill:agility':6}),before=JSON.stringify(h);expect(heroPersistentBuffs(h,[definition('skill')])[0]).toMatchObject({lifecycle:'permanent',effects:['敏捷 +6'],persistsAcrossRounds:true});
  const u=unit([timed('agility',{skill:'skill:persistent',until:1e6,value:6}),timed('agility',{value:3,maxStacks:100})]);u.skillState={'skill:agility':6};const buffs=combatUnitBuffs(u,2,[definition('skill')]);expect(buffs).toHaveLength(2);expect(buffs.filter(b=>b.lifecycle==='permanent')).toHaveLength(1);expect(JSON.stringify(h)).toBe(before);
 });
 it('普通独立召唤模板不展示从主人复制来的永久账本，幻象仍保留继承展示',()=>{
  const summon=unit([timed('armor',{skill:'native_aura',value:3})]);summon.summoned=true;summon.skillState={'skill:attack':30};summon.persistentBuffs={skill:{intelligence:2}};summon.attributes={permanent:{intelligence:2}};
  expect(combatUnitBuffs(summon,1,[definition('skill')])).toHaveLength(1);expect(combatUnitBuffs(summon,1,[definition('skill')])[0].skillId).toBe('native_aura');
  summon.illusion=true;expect(combatUnitBuffs(summon,1,[definition('skill')]).some(b=>b.persistsAcrossRounds)).toBe(true);
 });
 it('持续刷新属性组件使用同一来源run的真实倒计时，共享目标保留原始时长',()=>{
  const caster=unit([{kind:'overcharge',skill:'wisp_overcharge',source:'0:h1',appliedAt:0,until:10,value:1,data:{overchargeCaskRun:'run-1'}},{kind:'attackSpeed',skill:'wisp_overcharge',source:'0:h1',appliedAt:5,until:5.1,value:100,data:{overchargeCaskRun:'run-1'}}]);
  const ally={...unit([{kind:'regen',skill:'wisp_overcharge',source:'0:h1',appliedAt:5,until:5.1,value:10,data:{overchargeCaskRun:'run-1'}}]),id:'0:h2'};
  const own=combatUnitBuffs(caster,5,[definition('wisp_overcharge')],[caster,ally]),shared=combatUnitBuffs(ally,5,[definition('wisp_overcharge')],[caster,ally]);expect(own).toHaveLength(1);expect(shared).toHaveLength(1);for(const b of[own[0],shared[0]])expect(buffRemainingFraction(b,5)).toBe(.5);expect(shared[0].expiresAt).toBe(10);
 });
 it('英雄级永久属性来源与旧存档汇总不重复，负面永久属性可见',()=>{
  const h=hero({});h.persistentIntelligenceBonus=-4;h.persistentBuffs={skill:{intelligence:-2}};const buffs=heroPersistentBuffs(h,[definition('skill')]);expect(buffs).toHaveLength(2);expect(buffs.every(b=>b.polarity==='negative')).toBe(true);expect(buffs.map(b=>b.effects[0])).toEqual(['智力 -2','智力 -2']);
 });
 it('详情HTML转义名称和效果，完整展示说明且临时永久用语区分',()=>{
  const b=combatUnitBuffs(unit([timed('stun',{harmful:true})]),1,[definition('skill','<script>')])[0],html=buffDetailsHTML(b,5);expect(html).toContain('&lt;script&gt;');expect(html).toContain('剩余 5.0 秒');expect(html).toContain('不能移动、攻击或施法');expect(unitBuffsHTML([b],5)).toContain('data-buff-key=');expect(unitBuffsHTML([b],5)).toContain('--buff-elapsed:180deg');
 });
});

describe('状态目录覆盖',()=>{
 it('真实230项技能的初始化和自然战斗动态状态均有目录记录',()=>{
  const defs=skillCatalog as SkillDefinition[],kinds=new Set<string>();
  const player=(side:number,id:string,points:number):Player=>({id:side,name:`P${side}`,hp:100,gold:0,shopLevel:3,locked:false,shop:[],reserve:[],heroes:[0,1].map(i=>({id:`h${side}-${i}`,name:`h${side}-${i}`,role:'mage',skin:'male',x:i*2,y:-1,skills:side===0&&i===0?[{id,points}]:[]}))});
  for(const points of[3,6,9])for(const def of defs){const b=createBattle(player(0,def.id,points),player(1,def.id,points),7021,defs);for(const u of b.units){u.hp=50000;u.maxHp=100000;u.mana=u.maxMana=100000;}
   for(let tick=0;tick<90&&!b.finished;tick++){for(const u of b.units)for(const status of u.statuses)kinds.add(status.kind);stepBattle(b,1/30,defs);}
  }
  expect(kinds.size).toBeGreaterThan(70);expect(buffCatalogCoverage(kinds).unknown).toEqual([]);
 },30000);
 it('所有显式状态创建种类均有名称、说明及显式内部隐藏记录',()=>{
  const kinds=new Set<string>();
  const strings=(node:ts.Node)=>{if(ts.isStringLiteral(node))kinds.add(node.text);else if(ts.isConditionalExpression(node)){strings(node.whenTrue);strings(node.whenFalse);}};
  const scan=(filename:string)=>{const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);const walk=(node:ts.Node)=>{if(ts.isCallExpression(node)){const callee=node.expression;if(ts.isPropertyAccessExpression(callee)&&callee.name.text==='status'&&node.arguments[1])strings(node.arguments[1]);if(ts.isIdentifier(callee)&&['flag','buff','debuff','status'].includes(callee.text)){const arg=node.arguments[callee.text==='buff'||callee.text==='debuff'?2:1];if(arg)strings(arg);}}if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='kind')strings(node.initializer);ts.forEachChild(node,walk);};walk(source);};
  const visit=(directory:string)=>{for(const item of fs.readdirSync(directory)){const filename=path.join(directory,item);if(fs.statSync(filename).isDirectory())visit(filename);else if(filename.endsWith('.ts')&&!filename.endsWith('.test.ts'))scan(filename);}};visit('src');
  expect(kinds.size).toBeGreaterThan(200);expect(buffCatalogCoverage(kinds).unknown).toEqual([]);
 });
});

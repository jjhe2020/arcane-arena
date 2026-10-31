import {ArenaRenderer} from './renderer';
import {beginReplay,seekReplay,verifyReplay,type BattleReplayFile} from './replay';
import {FIXED_STEP,stepBattle,getCombatStats} from './combat';
import {ROLES,type AssetManifest,type BattleState,type CombatUnit,type SkillDefinition} from './model';
import {snapshotBattleStats} from './combat/statistics';
import {unitStatisticsDetails} from './combat/statistics-ui';
import {skillIconURL} from './skill-icons';
import {combatUnitBuffs} from './buffs';
import {GRANTED_SKILL_DEFINITIONS} from './skill-effects';
import {patchUnitBuffs} from './buff-ui';
import './replay.css';

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class ReplayViewer {
  private root?:HTMLElement;private renderer?:ArenaRenderer;private file?:BattleReplayFile;private battle?:BattleState;
  private paused=true;private speed=1;private accumulator=0;private last=0;private lastPanel=0;private raf=0;private generation=0;private seeking=false;private scrubbing=false;private selected='';private observer?:ResizeObserver;private verifiedBattle?:BattleState;private verified=false;private statisticsOpen=new Set<string>();
  private keydown=(event:KeyboardEvent)=>{if(!this.active)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close();}else if(event.code==='Space'&&!(event.target instanceof HTMLInputElement)){event.preventDefault();event.stopImmediatePropagation();this.paused=!this.paused;this.updateControls();}};
  private visibility=()=>{if(document.hidden){this.paused=true;this.updateControls();}};
  get active(){return !!this.root;}
  get state(){return this.battle;}
  private get displayDefinitions(){return [...new Map([...GRANTED_SKILL_DEFINITIONS,...this.definitions].map(d=>[d.id,d])).values()];}
  constructor(private assets:AssetManifest,private definitions:SkillDefinition[],private onEnter:()=>void,private onExit:()=>void){}
  open(file:BattleReplayFile,scene=0){
    if(this.active)this.close();this.file=file;this.battle=beginReplay(file,this.definitions);this.paused=true;this.speed=1;this.accumulator=0;this.selected=this.battle.units[0]?.id??'';this.onEnter();
    try{this.root=document.createElement('section');this.root.className='replay-viewer';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','战斗录像回放');
    this.root.innerHTML=`<header class="replay-heading"><div><strong>战斗录像 · 第 ${file.initial.round} 回合</strong><span>${esc(file.initial.a.name)} VS ${esc(file.initial.b.name)} · ${esc(file.release)}</span></div><button data-replay="close">退出回放</button></header><div class="replay-body"><div class="replay-stage"><canvas aria-label="录像战场，点击单位查看详情"></canvas></div><aside class="replay-info"><div class="replay-unit-core"></div><h3>状态效果</h3><div class="unit-buffs"></div><details class="replay-statistics"><summary>当前伤害统计</summary><div></div></details></aside></div><footer class="replay-controls"><button data-replay="restart">从头播放</button><button data-replay="play">▶ 播放</button><button data-replay="speed">1×</button><label>时间 <input aria-label="录像时间定位" type="range" min="0" max="${file.targetTick}" value="0" step="1"></label><output>0.0 / ${(file.targetTick*FIXED_STEP).toFixed(1)}s</output><span class="replay-validation" role="status">等待播放校验</span></footer>`;
    document.body.append(this.root);const canvas=this.root.querySelector('canvas')!;this.renderer=new ArenaRenderer(canvas,this.assets,{isolated:true});this.renderer.definitions=this.displayDefinitions;this.renderer.mode='spectate';this.renderer.selected=this.selected;void this.renderer.setArena(scene);
    this.observer=new ResizeObserver(()=>this.renderer?.layout());this.observer.observe(canvas.parentElement!);this.renderer.layout();
    this.root.addEventListener('click',event=>{const action=(event.target as HTMLElement).closest<HTMLElement>('[data-replay]')?.dataset.replay;if(action==='close'){this.close();return;}if(action==='play'){if(Number(this.battle?.tickCount)>=file.targetTick)void this.seek(0,true);else this.paused=!this.paused;}if(action==='speed')this.speed=this.speed===1?2:this.speed===2?4:1;if(action==='restart')void this.seek(0,true);this.updateControls();});
    const slider=this.root.querySelector('input')!;slider.addEventListener('pointerdown',()=>{this.scrubbing=true;this.paused=true;});slider.addEventListener('pointerup',()=>{this.scrubbing=false;});slider.addEventListener('pointercancel',()=>{this.scrubbing=false;});slider.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){this.scrubbing=true;this.paused=true;}});slider.addEventListener('keyup',()=>{this.scrubbing=false;});
    slider.addEventListener('change',event=>{const tick=Number((event.target as HTMLInputElement).value);this.scrubbing=false;void this.seek(tick,false);});
    this.root.addEventListener('toggle',event=>{const element=event.target;if(element instanceof HTMLDetailsElement&&element.isConnected&&element.dataset.replayStat){if(element.open)this.statisticsOpen.add(element.dataset.replayStat);else this.statisticsOpen.delete(element.dataset.replayStat);}},true);
    canvas.addEventListener('pointerdown',event=>{if(!this.battle||!this.renderer)return;const position=this.renderer.unproject(event.clientX,event.clientY),nearest=this.battle.units.map(unit=>({unit,distance:Math.hypot(unit.x-position.x,unit.y-position.y)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<1.8){this.selected=nearest.unit.id;this.renderer.selected=this.selected;this.updatePanel();}});
    document.addEventListener('keydown',this.keydown,true);document.addEventListener('visibilitychange',this.visibility);this.root.querySelector<HTMLButtonElement>('[data-replay=close]')!.focus();this.last=performance.now();this.updatePanel();this.raf=requestAnimationFrame(this.frame);
    }catch(error){this.close();throw error;}
  }
  close(){
    if(!this.root)return;this.generation++;cancelAnimationFrame(this.raf);this.observer?.disconnect();document.removeEventListener('keydown',this.keydown,true);document.removeEventListener('visibilitychange',this.visibility);this.renderer?.dispose();this.renderer=undefined;this.root.remove();this.root=undefined;this.battle=undefined;this.file=undefined;this.verifiedBattle=undefined;this.seeking=false;this.scrubbing=false;this.onExit();
  }
  private async seek(tick:number,play:boolean){
    if(!this.file)return;const generation=++this.generation;this.seeking=true;this.paused=true;this.updateControls();
    try{const battle=await seekReplay(this.file,tick,this.definitions,()=>generation!==this.generation||!this.root);if(!battle)return;this.battle=battle;this.accumulator=0;this.paused=!play;this.last=performance.now();this.updatePanel();}
    finally{if(generation===this.generation){this.seeking=false;this.updateControls();}}
  }
  private frame=(now:number)=>{
    if(!this.root||!this.renderer||!this.file||!this.battle)return;const dt=Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;
    if(!this.paused&&!this.seeking){this.accumulator+=dt*this.speed;let count=0;while(this.accumulator>=FIXED_STEP&&count++<16&&Number(this.battle.tickCount)<this.file.targetTick&&!this.battle.finished){stepBattle(this.battle,FIXED_STEP,this.definitions);this.accumulator-=FIXED_STEP;}if(this.battle.finished||Number(this.battle.tickCount)>=this.file.targetTick){this.paused=true;this.accumulator=0;}}
    this.renderer.draw(this.file.initial.a.heroes,this.file.initial.b.heroes,this.battle,this.file.initial.a.id,dt,this.paused?1:Math.min(1,this.accumulator/FIXED_STEP));
    if(now-this.lastPanel>150){this.updatePanel();this.lastPanel=now;}this.updateControls();this.raf=requestAnimationFrame(this.frame);
  };
  private updateControls(){
    if(!this.root||!this.battle||!this.file)return;this.root.querySelector('[data-replay=play]')!.textContent=this.seeking?'定位中…':this.paused?'▶ 播放':'Ⅱ 暂停';this.root.querySelector('[data-replay=speed]')!.textContent=`${this.speed}×`;
    const slider=this.root.querySelector<HTMLInputElement>('input')!;if(!this.scrubbing)slider.value=String(this.battle.tickCount??0);this.root.querySelector('output')!.textContent=`${(this.scrubbing?Number(slider.value)*FIXED_STEP:this.battle.time).toFixed(1)} / ${(this.file.targetTick*FIXED_STEP).toFixed(1)}s`;
    const complete=Number(this.battle.tickCount)>=this.file.targetTick||this.battle.finished,status=this.root.querySelector<HTMLElement>('.replay-validation')!;
    if(complete){if(this.verifiedBattle!==this.battle){this.verifiedBattle=this.battle;this.verified=verifyReplay(this.file,this.battle);}status.textContent=this.verified?'✓ 重放校验一致':'⚠ 重放校验不一致，请保留录像排查';status.dataset.verified=String(this.verified);}else{status.textContent=this.seeking?'正在重建战斗…':'点击任意单位查看状态';delete status.dataset.verified;}
  }
  private updatePanel(){
    if(!this.root||!this.battle)return;const unit=this.battle.units.find(u=>u.id===this.selected)??this.battle.units[0];if(!unit)return;this.selected=unit.id;this.renderer!.selected=unit.id;const stats=getCombatStats(unit),owner=this.battle.units.find(u=>u.id===unit.owner),byId=new Map(this.displayDefinitions.map(d=>[d.id,d]));
    this.root.querySelector('.replay-unit-core')!.innerHTML=`<div class="unit-heading" data-unit-id="${esc(unit.id)}"><div><h2>${esc(unit.name)}</h2><small>${unit.side===this.file!.initial.a.id?'我方':'敌方'} · ${ROLES[unit.role].name}${unit.summoned?' · 召唤物':''}${unit.illusion?' · 幻象':''}${unit.dead?' · 已阵亡':''}</small></div></div>${owner?`<p>来源：${esc(owner.name)}</p>`:''}<div class="healthbar"><i style="width:${Math.max(0,unit.hp/Math.max(1,unit.maxHp))*100}%"></i><span>${Math.round(unit.hp)} / ${Math.round(unit.maxHp)}</span></div><div class="manabar"><i style="width:${Math.max(0,unit.mana/Math.max(1,unit.maxMana))*100}%"></i><span>${Math.round(unit.mana)} / ${Math.round(unit.maxMana)}</span></div><dl class="unit-stats">${[['攻击',Math.round(stats.attack)],['护甲',stats.armor.toFixed(1)],['攻击间隔',stats.attackInterval.toFixed(2)+'s'],['射程',stats.range.toFixed(1)],['力量',Math.round(Number(unit.strength??0))],['敏捷',Math.round(Number(unit.agility??0))],['智力',Math.round(Number(unit.intelligence??0))]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><h3>装备技能</h3><div class="equipped-list">${unit.skills.map(skill=>{if(!skill)return '';const definition=byId.get(skill.id)??this.definitions.find(d=>d.id===skill.id),url=definition?skillIconURL(definition):'';return `<span class="skill-slot" title="${esc(definition?.name??skill.id)}">${url?`<img class="sprite-icon" src="${esc(url)}" alt="${esc(definition?.name)}">`:esc((definition?.name??skill.id).slice(0,2))}<b class="skill-level">${skill.points}</b></span>`;}).join('')}</div>`;
    patchUnitBuffs(this.root.querySelector<HTMLElement>('.unit-buffs')!,combatUnitBuffs(unit,this.battle.time,this.displayDefinitions,this.battle.units),this.battle.time);
    const rows=snapshotBattleStats(this.battle),names=new Map(this.displayDefinitions.map(d=>[d.id,d.name]));this.root.querySelector('.replay-statistics>div')!.innerHTML=rows.map(row=>`<details data-replay-stat="${esc(row.id)}" ${this.statisticsOpen.has(row.id)?'open':''}><summary>${esc(row.name)} · ${Math.round(row.damage)}</summary>${unitStatisticsDetails(row,'damage',names,new Set())}</details>`).join('');
  }
}

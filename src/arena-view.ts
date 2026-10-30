import type {BattleState, CombatUnit} from './model';

export type ArenaViewMode = 'formation'|'spectate';
export const BATTLE_INTRO_DURATION = 1.2;
const CAMERA_DURATION = .65;
const SHADE_END = .85;
const ENEMY_END = 1.1;
const clamp01 = (value:number) => Math.max(0,Math.min(1,value));
const smooth = (value:number) => {const t=clamp01(value);return t*t*(3-2*t);};

/** Render time only. This state never enters a battle snapshot or replay. */
export class ArenaViewTransition {
  mode:ArenaViewMode='formation';
  blend=0;
  private from=0;
  private elapsed=CAMERA_DURATION;
  private introElapsed=BATTLE_INTRO_DURATION;
  private bodiesReady=true;
  setMode(mode:ArenaViewMode){if(mode===this.mode)return;this.from=this.blend;this.elapsed=0;this.mode=mode;}
  beginBattleIntro(){this.setMode('spectate');this.introElapsed=0;this.bodiesReady=false;}
  advance(dt:number,bodiesReady=true){const step=Math.max(0,Number.isFinite(dt)?dt:0);this.elapsed=Math.min(CAMERA_DURATION,this.elapsed+step);if(!this.battleIntroReady){this.bodiesReady=bodiesReady;const limit=bodiesReady?BATTLE_INTRO_DURATION:SHADE_END;this.introElapsed=Math.min(limit,this.introElapsed+step);}const target=this.mode==='formation'?0:1;this.blend=this.from+(target-this.from)*smooth(this.elapsed/CAMERA_DURATION);}
  get battleIntroReady(){return this.introElapsed>=BATTLE_INTRO_DURATION;}
  get introProgress(){return this.introElapsed/BATTLE_INTRO_DURATION;}
  get shade(){return !this.battleIntroReady&&this.mode==='spectate'?1-smooth((this.introElapsed-CAMERA_DURATION)/(SHADE_END-CAMERA_DURATION)):1-this.blend;}
  get enemyOpacity(){return this.battleIntroReady?1:smooth((this.introElapsed-SHADE_END)/(ENEMY_END-SHADE_END));}
  diagnostics(){return{mode:this.mode,blend:this.blend,shade:this.shade,enemyOpacity:this.enemyOpacity,battleIntroReady:this.battleIntroReady,bodiesReady:this.bodiesReady};}
}

/** The first participant is authored on the lower half. Rotate the whole world
 * for the second participant, including effects and picking, without rewriting
 * simulation positions, directions, modifiers, events, or projectile data. */
export function battleViewRotation(battle:BattleState|undefined,viewSide:number):number {
  const initial=battle?.initial as {a?:{id:number};b?:{id:number}}|undefined;
  return initial?.b?.id===viewSide?Math.PI:0;
}
export function viewPoint(x:number,y:number,rotation:number){return rotation===Math.PI?{x:-x,y:-y}:{x,y};}
export function isCelebrating(battle:BattleState|undefined,unit:CombatUnit){return !!battle?.finished&&battle.winner!==null&&unit.side===battle.winner&&!unit.dead&&unit.hp>0;}

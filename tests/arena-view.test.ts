import {describe,expect,it} from 'vitest';
import {ArenaViewTransition,BATTLE_INTRO_DURATION,battleViewRotation,viewPoint,isCelebrating} from '../src/arena-view';
import type {BattleState,CombatUnit} from '../src/model';

describe('战场展示与入场时间',()=>{
  it('开战先扩大镜头，再消去边界遮罩，再出现敌人，最后允许推进模拟',()=>{
    const view=new ArenaViewTransition();view.beginBattleIntro();
    expect(view.battleIntroReady).toBe(false);expect(view.shade).toBe(1);expect(view.enemyOpacity).toBe(0);
    view.advance(.3);expect(view.blend).toBeGreaterThan(0);expect(view.blend).toBeLessThan(1);expect(view.shade).toBe(1);expect(view.enemyOpacity).toBe(0);
    view.advance(.35);expect(view.blend).toBe(1);expect(view.shade).toBe(1);
    view.advance(.1);expect(view.shade).toBeGreaterThan(0);expect(view.shade).toBeLessThan(1);expect(view.enemyOpacity).toBe(0);
    view.advance(.15);expect(view.shade).toBe(0);expect(view.enemyOpacity).toBeGreaterThan(0);expect(view.enemyOpacity).toBeLessThan(1);expect(view.battleIntroReady).toBe(false);
    view.advance(BATTLE_INTRO_DURATION);expect(view.enemyOpacity).toBe(1);expect(view.battleIntroReady).toBe(true);
  });
  it('普通切换双向平滑，可从当前镜头位置逆向切换，不创建战斗等待',()=>{
    const view=new ArenaViewTransition();view.setMode('spectate');view.advance(.3);const middle=view.blend;
    expect(view.battleIntroReady).toBe(true);view.setMode('formation');expect(view.blend).toBe(middle);
    view.advance(.2);expect(view.blend).toBeGreaterThan(0);expect(view.blend).toBeLessThan(middle);view.advance(1);expect(view.blend).toBe(0);expect(view.shade).toBe(1);expect(view.battleIntroReady).toBe(true);
  });
  it('冷启动身体未加载时停在敌方淡入前，资源就绪后完整淡入才允许开战',()=>{
    const view=new ArenaViewTransition();view.beginBattleIntro();view.advance(.7,false);expect(view.blend).toBe(1);
    view.advance(5,false);expect(view.shade).toBe(0);expect(view.enemyOpacity).toBe(0);expect(view.battleIntroReady).toBe(false);expect(view.diagnostics().bodiesReady).toBe(false);
    const held=view.introProgress;view.advance(2,false);expect(view.introProgress).toBe(held);
    view.advance(.1,true);expect(view.enemyOpacity).toBeGreaterThan(0);expect(view.enemyOpacity).toBeLessThan(1);expect(view.battleIntroReady).toBe(false);
    view.advance(.3,true);expect(view.enemyOpacity).toBe(1);expect(view.battleIntroReady).toBe(true);
    // Readiness belongs only to the explicit round entry, never later views.
    view.setMode('formation');view.advance(.7,false);expect(view.battleIntroReady).toBe(true);expect(view.blend).toBe(0);
  });
  it('依据初始参与者映射视角，不依赖战斗中英雄移动或死亡',()=>{
    const battle={initial:{a:{id:2},b:{id:5}},units:[{side:5,y:-7,dead:true}]} as unknown as BattleState;
    const original=structuredClone(battle);expect(battleViewRotation(battle,2)).toBe(0);expect(battleViewRotation(battle,5)).toBe(Math.PI);
    const p=viewPoint(3,8,battleViewRotation(battle,5));expect(p).toEqual({x:-3,y:-8});expect(viewPoint(p.x,p.y,Math.PI)).toEqual({x:3,y:8});expect(battle).toEqual(original);
  });
  it('庆祝仅属于已结束战斗的存活胜者，平局和落败者不庆祝',()=>{
    const unit={side:5,hp:4,dead:false} as CombatUnit,battle={finished:true,winner:5} as BattleState;
    expect(isCelebrating(battle,unit)).toBe(true);expect(isCelebrating({...battle,finished:false},unit)).toBe(false);
    expect(isCelebrating({...battle,winner:null},unit)).toBe(false);expect(isCelebrating({...battle,winner:2},unit)).toBe(false);expect(isCelebrating(battle,{...unit,dead:true})).toBe(false);expect(isCelebrating(battle,{...unit,hp:0})).toBe(false);
  });
});

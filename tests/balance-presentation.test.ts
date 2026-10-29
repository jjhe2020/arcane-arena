import {describe,it,expect} from 'vitest';
import {skillBalanceHTML} from '../src/balance-presentation';
import type {SkillDefinition} from '../src/model';
describe('player-facing compiled balance values',()=>{
 it('shows effective upgraded damage rather than the old reference numbers',()=>{
  const row=(pointTier:number,damage:number)=>({pointTier,castPoint:.3,backswing:.5,cooldown:12,mana:100,range:6,params:{DAMAGE:damage},program:{}});
  const d={id:'test',balanceLevels:{1:row(1,100),2:row(2,200),3:row(3,300),6:row(6,420),9:row(9,550)},balanceParamLabels:{DAMAGE:'伤害'},values:['DAMAGE: 90 / 180 / 360']} as unknown as SkillDefinition;
  const html=skillBalanceHTML(d);expect(html).toContain('当前有效技能数值');expect(html).toContain('伤害');expect(html).toContain('420');expect(html).toContain('550');expect(html).not.toContain('360');expect(html).not.toContain('编译');
 });
 it('escapes designer-provided labels and preserves native rank headings',()=>{
  const row={pointTier:4,castPoint:0,backswing:0,cooldown:0,mana:0,range:0,params:{DAMAGE:0},program:{}};
  const d={id:'child',balanceDomain:'native',balanceLevels:{4:row},balanceParamLabels:{DAMAGE:'<script>坏字段</script>'}} as unknown as SkillDefinition;
  const html=skillBalanceHTML(d);expect(html).toContain('4级');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('<td>0</td>');
 });
});

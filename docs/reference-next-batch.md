# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C2源码检查点已开始40项，190项未开始，当前战场范围整项通过5项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. 恢复类别：真实Feast仍调用普通治疗，Rain会把340治疗放大为425；历史2019修复说明Feast应使用吸血恢复类别。需开放显式恢复类别给技能调用方，分别验证基础Feast、共享Feast和对应吸血增强/抑制，不能仅因引擎已分三类就宣称所有治疗调用方已迁移。
2. `settlement-engine.json`保留五项具体边界：法术吸血的特殊目标与继承、HP移除调用方与其余伤害否定优先级、一般延期吸血时机、攻击吸血的特殊伤害修正、恢复调用方分类。已经通过的FP+Shield/BT/Rum和普通小兵系数不再列为未实现；它们也不替代其它组合证据。
3. 已审40项剩余44条要求继续逐条闭合。包括首25项的多来源光环/状态优先级；Arctic短DOT/历史近战资格、Huskar精确历史指数、Rage/BH轨迹、竞技场方向减速与运动例外、Spirit回返AI、Step措辞与顺序、血怒穿免疫和多来源、蚀脑复制Super与延期/过量基数。
4. 下一批只读预研分工：攻击修饰（Burning Spear、Chaos Strike、Counter Helix、Coup de Grace、Curse of Avernus）；运动/场域（Burning Barrage、Burrowstrike、Charge of Darkness、Chronosphere、Chakram）；召唤/恢复（Call of the Wild、Chaotic Offering、Chemical Rage、Cold Embrace、Corrosive Skin）。C2已冻结，不把预研当结果证明；下一模拟修订开始后再合入实现与新表字段。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`覆写；必须检查最终执行函数。C2新攻击形态最终覆写在`src/combat/attack-modes.ts`。
- `src/combat.ts`显式点目标、状态移除/区域结束生命周期、运动查询、攻击准备/命中前/攻击点钩子以及独立伤害实例事件，均与统计ID和有效结算账本分离。
- `npm run reference:verify`执行具名结果并核对代码、配置、逐组来源指纹。C2全量819项与专用326项、构建和生产检查已通过，详情见`docs/r6-validation.md`。修改后需要重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C2是进行中的源码提交，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

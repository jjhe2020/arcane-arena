# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C3源码检查点已开始55项，175项未开始，当前战场范围整项通过6项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. C3基础Feast与共享Feast已显式调用吸血恢复，真实基础Feast+Rain+吸血增强结果通过。其它恢复调用方、共享Feast归属/攻击组成仍需独立验收，不把一项结果当全部迁移完成。
2. `settlement-engine.json`保留9项具体边界：原有特殊目标/延迟/HP移除/吸血调用方之外，新增原生召唤profile、瞬时攻击修饰资格、固定/可变暴击排序及开战被动生效先后。开战统计清空问题已修，防御顺序差异是另一个实际缺失。
3. 已审55项剩余67条要求逐条闭合；包括多来源光环优先级、历史资格/轨迹、法术屏障、反伤致死时点、原生子技能继承及AA升级精确时序等。各组JSON保留具体条款，不用宽泛注册或数值压力测试替代。
4. C4只读预研：原生召唤物能力/BaseAS/BAT/攻击点/弹速/转身单位；Chain Frost、Chakra Magic、Corrosive Haze、Crippling Fear、Culling Blade；Death Pulse、Death Ward、Decay、Demonic Cleanse、Demonic Purge。C3冻结，不把预研当结果；下一模拟修订再合入实现与配置。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`覆写；必须检查最终执行函数。C2新攻击形态最终覆写在`src/combat/attack-modes.ts`。
- `src/combat.ts`显式点目标、状态移除/区域结束生命周期、运动查询、攻击准备/命中前/攻击点钩子以及独立伤害实例事件，均与统计ID和有效结算账本分离。
- `npm run reference:verify`执行具名结果并核对代码、配置、逐组来源指纹。C3全量972项与专用478项、构建和生产检查已通过，详情见`docs/r6-validation.md`。修改后需要重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C3是进行中的源码提交，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

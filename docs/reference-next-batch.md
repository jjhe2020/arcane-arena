# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C5源码检查点已开始80项，150项未开始，当前战场范围整项通过7项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. C3基础Feast与共享Feast已显式调用吸血恢复，真实基础Feast+Rain+吸血增强结果通过。其它恢复调用方、共享Feast归属/攻击组成仍需独立验收，不把一项结果当全部迁移完成。
2. 56条共用要求仍有11条未闭合。C4原13模板创建/攻速/动画与开战立即区域防御顺序、C5显式攻击修饰契约和位移结束回调已有有限结果；其它召唤/幻象继承、转身加速度、直接初始化/同时触发优先级、恢复/延期/HP移除等仍需核验。原有限结果不扩为全引擎通过。
3. 已审80项剩余123条具名要求逐条闭合。既有冰柱/链霜续跳、脉轮追溯与死亡路由、Haze多来源、特殊英雄奖励、Decay再生等边界仍在；C5增加Luminosity治疗顺序/基数和飞行期消费、强暴击竞争、瞬时攻击开始资格、Dispersion历史HPLOSS例外、Soul Catcher原AA等级/时点、短版Doom末跳等具体条款。
4. C5追加攻击和连续运动已实际落地，最终52项专项；反伤/恶魔54项、大地/决斗47项。普通攻击开始与instant modifier资格不能混用；通用暴击beginning与CK的during attack point措辞仍需按caller裁定。Starbreaker Super前摇0.2保留工作值，不能从自由运动兼容推导为完整原生Shard的0.1。
5. C6只读第一组：Elder Dragon Form、Empower、Enchant Totem、Epicenter、Essence Flux。候选缺口包括攻击类型/溅射分类、强化的被动光环生命周期、Totem释放/命中期消费、瞬移距离触发上限与施法触发资格。Empower旧目录global aura和官方Season2开战施放说明存在版本冲突，先对齐目录及历史证据。
6. C6只读第二组：Essence Shift、Eye of the Storm、Fade Bolt、False Promise、Feast。已有延期/恢复有限结果不替代这些技能的完整条款验收；逐项研究身份快照、独立来源、攻击/法术分类和S/G原型，再集中迁表与实现。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`覆写；必须检查最终执行函数。C2新攻击形态最终覆写在`src/combat/attack-modes.ts`。
- `src/combat.ts`显式点目标、状态移除/区域结束生命周期、运动查询、攻击准备/命中前/攻击点钩子以及独立伤害实例事件，均与统计ID和有效结算账本分离。
- `npm run reference:verify`执行具名结果并核对代码、配置、逐组来源与实际技能目录/配置编译脚本指纹。文件收集还包含账本引用的非`reference-`测试。C5全量1254项与专用768项、构建和生产检查已通过，详情见`docs/r6-validation.md`。修改后需要重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C5是进行中的源码检查点，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

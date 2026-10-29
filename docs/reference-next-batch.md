# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C4源码检查点已开始65项，165项未开始，当前战场范围整项通过7项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. C3基础Feast与共享Feast已显式调用吸血恢复，真实基础Feast+Rain+吸血增强结果通过。其它恢复调用方、共享Feast归属/攻击组成仍需独立验收，不把一项结果当全部迁移完成。
2. 51条共用要求仍有11条未闭合。C4原13模板创建/攻速/动画与开战立即区域防御顺序已有有限结果；其它召唤/幻象继承、转身加速度、直接初始化效果/同时触发优先级、特殊恢复/延期/HP移除等仍需核验。原有限结果不扩为全引擎通过。
3. 已审65项剩余84条具名要求逐条闭合。新增组还保留冰柱/链霜目标死亡续跳、脉轮追溯窗口与死亡路由、Haze多来源/死亡、Fear被动时钟、Culling特殊英雄奖励、死亡守卫次级弹道躲避后续、Decay再生与原型50%差异、授予Purge默认值等具体边界。
4. C5追加攻击预研：Time Lock应在历史0.4秒后结算第二击/附伤并允许原生攻击效果，远程需真实弹体；Moment of Courage还需攻击开始资格、当前目标及未攻击时准备；Specialist Array应随主弹体释放且排除修饰。当前诊断已复现主攻击miss不触发额外弹体、false路径泄漏通用暴击。Luminosity另有ward计数、Break下预充能与Starbreaker按波计数缺口。只读矩阵在ignored `output/c5-instant-procs/`，22项是候选用例，不计已通过Vitest。通用暴击beginning与CK的during attack point措辞需按caller裁定，不能无证统一改时点。
5. C5另两组只读研究：Dispersion、Dispose、Disruption、Dissimilate、Doom；Double Edge、Dragon Slave、Duel、Earth Splitter、Earthshock。Dispersion现有事后有效承伤回调不足以表达前置反射/致死顺序；Doom Gaben需真实self目标资格。下一模拟修订再合入实现与配置，不修改C4证明。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`覆写；必须检查最终执行函数。C2新攻击形态最终覆写在`src/combat/attack-modes.ts`。
- `src/combat.ts`显式点目标、状态移除/区域结束生命周期、运动查询、攻击准备/命中前/攻击点钩子以及独立伤害实例事件，均与统计ID和有效结算账本分离。
- `npm run reference:verify`执行具名结果并核对代码、配置、逐组来源与实际技能目录/配置编译脚本指纹。C4全量1100项与专用606项、构建和生产检查已通过，详情见`docs/r6-validation.md`。修改后需要重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C4是进行中的源码提交，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C6源码检查点已开始95项，135项未开始，当前战场范围整项通过7项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. C3基础Feast与共享Feast已显式调用吸血恢复，真实基础Feast+Rain+吸血增强结果通过。其它恢复调用方、共享Feast归属/攻击组成仍需独立验收，不把一项结果当全部迁移完成。
2. 56条共用要求仍有11条未闭合。C4原13模板与开战区域顺序、C5攻击修饰契约/位移结束、C6原生龙形复制/真实副体引导/FP等待/吸血过量Tether已有有限结果；其它召唤继承、转身加速度、初始化优先级、恢复/延期/HP移除仍需核验。有限结果不扩为全引擎通过。
3. 已审95项剩余182条具名要求逐条闭合。C5旧边界仍在，C6新增精确条款见三组账本及`docs/r6-c6-progress.md`；特别区分来源未知与已知实际缺失，不能把可证但未实现的例外搁为source_pending。
4. C7第一组：Flak Cannon、Flame Guard、Flesh Golem、Flesh Heap、Focus Fire。重点发射/命中时点、无修饰副弹/有修饰Side Gunner、护盾阶段、攻击类型和永久收益。Focus Fire持续时间与动态距离仍需真实核验；负号表达式的初步疑点已由P取绝对值排除，不作为缺失。Flame Guard旧AA100%与2023native70%存在数值/版本分歧，应保AA并核验旧盾阶段。
5. C7第二组：Fortune's End、Freezing Field、Frost Arrows、Frost Shield、Frostbite。真实诊断已发现弹体/驱散目标资格、冰箭次级攻击、盾重施时钟、Frostbite0.25秒与英雄召唤分类。Freezing Super其它施法必终止的静态猜测已被隔离实际结果否定，不据此新增无必要API；强控清理仍要实测。
6. C7第三组：Fury Swipes、Gaben's Strength、Ghostship、Glaives of Wisdom、Global Silence。攻击附伤组成、属性/蓝量、反伤和延迟HP设置、不可伤目标资格与S/G完整值优先。Ghostship AA目录与Season4公告的Super方向冲突须版本对照，不擅换规则。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`覆写；必须检查最终执行函数。C2新攻击形态最终覆写在`src/combat/attack-modes.ts`。
- `src/combat.ts`显式点目标、状态移除/区域结束生命周期、运动查询、攻击准备/命中前/攻击点钩子以及独立伤害实例事件，均与统计ID和有效结算账本分离。
- `npm run reference:verify`执行具名结果并核对代码、配置、逐组来源与实际技能目录/配置编译脚本指纹。文件收集还包含账本引用的非`reference-`测试。C6全量1472项与专项986项、构建和生产检查已通过，详情见`docs/r6-validation.md`。修改后需要重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C6是进行中的源码检查点，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

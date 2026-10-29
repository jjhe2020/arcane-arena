# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C10源码检查点已开始155项，75项未开始，当前战场范围整项通过7项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. 61条共用要求仍有11条未闭合。C9主伤快照及C10有限同击类型、Marksmanship发射判定、法力盾阶段、弹道续跳结果已绑定。普通暴击完整随机试验仍在攻击点，取消攻击/交错随机时点为实际缺失；不能用Marksmanship的独立发射结果关闭它。转身加速度和原生全局寻路仍未认证。
2. 已开始155项的496条未闭合要求继续逐条处理，实际缺失与待证分开。恢复/延期/HPLOSS、召唤继承、初始化及具体边界见账本与`docs/r6-c10-progress.md`。AA数值和具名已确认自定义保留，AA category标签不是自定义Lua证据；非数值机制优先Wiki。C10已单列四项驱散metadata冲突，不能再笼统声称所有AA标签优先于Wiki。
3. C11第一组：Overcharge、Overgrowth、Overload、Overpower、Paralyzing Cask。只读入口ignored `output/c11-overcharge-cask/`。核对Tether加成/共享恢复、真实无目标和动态目标、攻击充能消费/弹射、根与攻击点、眩晕/小兵时长及原生升级原型。不得将原有部分子能力结果冒称父技能已核验。
4. C11第二组：Phantasm、Phantom Strike、Phase Shift、Pierce the Veil、Plague Ward。只读入口ignored `output/c11-phantom-ward/`。重点幻象分裂/替换/继承、瞬移攻击及吸血、隐藏与瞬时攻击时序、原生转换攻击例外、守卫原生躯体/魔免/毒性继承及Super/Gaben。
5. C11第三组：Plasma Field、Poison Attack、Press The Attack、Primal Roar、Pulse Nova。只读入口ignored `output/c11-plasma-pulse/`，已有14项修前实际诊断与来源。重点移动中心与往返资格、先减抗后主伤和魔免、受益者选择、主次目标推离/免疫/驱散、真实toggle与起始周期。新增toggleOff须核对实际资源、固定关断冷却及不中断引导，不能以反复免费虚拟cast替代普通动作。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`及验收组覆写；必须检查最终执行函数。C10最后三组入口为`applyManaMirrorAcceptance`、`applyMistFlareAcceptance`、`applyNatureOmniAcceptance`。
- `src/combat.ts`显式运动、实际执行者、攻击主伤快照、条件附伤、动作资格、状态/区域结束生命周期和独立伤害事件，均与统计ID及有效账本分离。
- `npm run reference:verify`执行账本实际引用的测试文件并核对代码、配置、逐组来源与实际技能目录/编译脚本指纹。C10全量2404项、来源1915项及构建/生产结果见`docs/r6-validation.md`。修改后重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C10是进行中的源码检查点，尚未创建r6 Release。C11目前仅只读研究，尚未实施或编辑数值。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

# 原作验收接续点

完整目标不变：完成230主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项原作验收。C9源码检查点已开始140项，90项未开始，当前战场范围整项通过7项；准确计数见`public/data/reference-acceptance.json`。不以检查点代替全部目标。

## 已明确的后续实现

1. 57条共用要求仍有11条未闭合。C9已修Glaives攻击开始数值快照：飞行中主伤/弹速变化、主击偷智、Jingu普通附伤与Shredder固定伤害有真实组合结果。完整暴击随机试验仍在攻击点，取消攻击/交错随机时点为实际缺失，不能把数值快照修复当全部攻击开始机制通过。
2. 已审140项的403条未闭合技能要求继续逐条处理，实际缺失与待证分开。恢复/延期/HPLOSS、召唤继承、转身加速度、初始化优先级及各组具体边界见账本与`docs/r6-c9-progress.md`。C9引擎复活用例不代表已核验目录Reincarnation。
3. C10第一组：Mana Break、Mana Drain、Mana Shield、Meat Hook、Mirror Image。只读预研在ignored `output/c10-mana-mirror/`；原生闪烁碎片KV已找到为`antimage_mana_overload`，不得继续宣称历史快照缺失。重点同攻击包条件附伤、魔免/幻象资格、魔抗前法力盾、幻象处决/真视、冻结钩索和原生分身阶段；保留AA数值与自定义。
4. C10第二组：Mist Coil、Moon Glaives、Mortimer Kisses、Multishot、Mystic Flare。只读预研在ignored `output/c10-mist-flare/`。重点自身消耗与抵挡顺序、攻击快照与重访、火球时序和引导、AA攻击修饰声明、区域受害者资格与独立场域。预研中的Jingu组合缺口已由C9修复，不要重复回退。
5. C10第三组：Nature's Attendants、Nature's Call（`custom_furion_force_of_nature`）、Nether Swap、Nethertoxin、Omnislash。继续检查原生施法阶段、治疗/召唤继承、显式换位来源、周期/Break及攻击发起技能归属，先取得历史来源并复现当前结果。

## 已有工作入口

- `src/skill-effects.ts`最终注册会叠加多个`src/combat/main-*`及验收组覆写；必须检查最终执行函数。C9最后三组入口为`applyLivingFieldAcceptance`、`applyInnerLaserAcceptance`、`applyLeechShredderAcceptance`。
- `src/combat.ts`显式运动、实际执行者、攻击主伤快照、条件附伤、动作资格、状态/区域结束生命周期和独立伤害事件，均与统计ID及有效账本分离。
- `npm run reference:verify`执行账本实际引用的测试文件并核对代码、配置、逐组来源与实际技能目录/编译脚本指纹。C9全量2168项、来源1680项及构建/生产结果见`docs/r6-validation.md`。修改后重建证据，不沿用旧绿灯。
- Excel仍是平衡数值唯一编辑入口；同批由一位编辑者集中写入并手动编译，避免相互覆盖。删除的无效旧参数不要重新作为可编辑列加回。配置完整性与来源缺口分别记录。

C9是进行中的源码检查点，尚未创建r6 Release。后续改变重放行为时更新模拟修订；全部目标或明确完成的开发版本仍须按AGENTS.md完成发布及附件核验。

# r6 C3 源码检查点

C3已完成本批实现和验证：全量972项、来源专项478项、配置一致性、构建与生产检查通过。模拟修订为`arena-2026-10-29-c3-r6`，配置hash为`602d5b2015dedb3ededd2706849876c0961d55eeb10aeede716f7de7702b015d`。C2基点为`ee77fcfb1002f36b80c8caee9a10309012a52e4b`。本文件记录源码检查点，不是230项全量原作终验说明，未创建r6发布tag。

## 当前分工与入口

- `proc-acceptance.ts`：Burning Spear、Chaos Strike、Counter Helix、Coup de Grace、Curse of Avernus；对应`reference-proc-acceptance.test.ts`。已在最终registry接入。
- `summon-restoration-acceptance.ts`：Call of the Wild、Chaotic Offering、Chemical Rage、Cold Embrace、Corrosive Skin；对应`reference-summon-restoration.test.ts`。已接入，实际源证据与Excel由同一编辑者集中迁移。
- `mobility-fields-acceptance.ts`：Burning Barrage、Burrowstrike、Charge of Darkness、Chronosphere、Chakram。已接最终registry与四项原生授予定义。新增Second Chakram、两种Return及独立Caustic，授予目录由69扩为73，仍与AA点数表隔离。
- 根代理持有`combat.ts`、`skill-effects.ts`公共接口和最终注册。三个组在各自新模块、测试、来源账本内工作；Excel只由配置组编辑和手动编译，避免覆盖。

## 已接的共用机制

- 每发攻击独立`AttackRecord`，攻击点保存暴击/随机结果，普通远程弹道闭包传至命中；`criticalAttack`、`attackInstanceKey`、`criticalSourceKey`可供程序使用。`attackCritical`是布尔值，倍率在record中，避免非暴击的1倍倍率被误认为暴击。
- 普通攻击替换只在释放准备一次；破坏/叠加筛选统一用于相关减伤、魔抗和吸血提供者。独立状态身份可用`data.instanceKey`，同组择强另外声明，身份隔离不意味着伤害或减速自动叠加。
- `onCastStart`只通知当前技能；`onSpellOrder`通知本体其它技能，带unit/point/none订单类型，供冲锋取消目标施法订单。
- `cooldownStart: effectEnd`释放时保留冷却快照，由运行锁防重复施法，界面冷却不提前倒数。`startCooldown()`只启动一次；`resetCooldown()`令运行锁失效并清零，随后结束回调不会覆盖重置。
- `trySpellBlock`消费真实抵挡；线性攻击弹道也声明并经过竞技场拦截；`cancelMotion`与`data.blockedMotionSkills`分别负责取消当前运动和拒绝明确的新运动。`motionRoot`只阻止普通走路。
- `affectsInvulnerable`仅由有证据的具体程序声明；伤害仍走无敌判断。`onAffectedUnitDeath`保留状态来源/点数/归属并允许施法者已死。`dispelBattleStatuses`是既有真实驱散函数的导出别名。
- `procsOnCast: false`跳过施法触发及Arcane Curse惩罚；`allowZeroCooldown`供已证实零冷却的Return声明。不据此推断其偷技能资格。
- `EffectContext.heal`可显式传heal/regen/lifesteal。基础Feast和共享Feast已改为吸血恢复；实际基础Feast+Rain+吸血增强结果通过，但Feast其它攻击组成/共享归属仍须独立审查。

## 本批结果与接续

1. 三组分别50、47、53个具名结果通过；来源验证总计478项。55技能已开始、6项当前范围整项通过，175项未审。502条技能要求中67条、18条共用要求中9条未闭合。Coup保留非暴击不触发Fan反例；没有可靠依据的字段仍不替换工作值。
2. Excel集中迁移15项主技能及相关子技能，核对1370旧行+6新行、2658参数映射，清除64项废弃program参数；11表样式/行高/冻结零变化。语义及工作簿摘要见`artifacts/r6-c3-config-validation.json`。
3. Offering旧回归验证死亡后的延迟生成，保留有存活队友的实际战斗前提；“最后英雄死亡即终战”的原作边界仍未闭合。Burrowstrike旧回归按有来源的终点跳变修正，同时保留中途命中和充能检查。
4. 全量整局发现并修复开战统计明细清空问题，新增真实Acid双方初始化顺序和恢复一致性回归。另记录开战伤害/被动防御顺序为独立缺失，不因统计修复而关闭。
5. 构建后4175生产服务的资源、浏览器、真实技能统计、固定账本统计页面和UI完整性8/8通过，桌面与手机截图已检查。详情见`docs/r6-validation.md`。
6. C4只读研究已开始：原生召唤物攻击/运动profile；Chain Frost、Chakra Magic、Corrosive Haze、Crippling Fear、Culling Blade；Death Pulse、Death Ward、Decay、Demonic Cleanse、Demonic Purge。研究结果不计为当前通过，下一修订实现并重建证明。

完整230项目标保持进行中，不能将此文件当作完成、暂停或阻塞声明。

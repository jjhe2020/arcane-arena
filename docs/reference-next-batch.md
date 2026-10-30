# 原作验收接续点

完整目标保持：230项主技能及授予效果的机制、时序、Super/Gaben和相关组合逐项验收。C16以C15提交f044fac88e4ec99ea07553a2b92ad4049f225aa1为基线，230已开始、0未审、整项通过7。不得把全目录开始审查视作全原作完成。

r7在C16基线224ba7f之上落实用户新增的六项商店/图标/回合等级/难度要求；这不关闭C17下列原作缺口。当前模拟修订arena-2026-10-30-shop-heroes-r7，配置hashb66448385b8795ff430ec120ac14a2265a2bb948a06b6fdf237436adaa92a017。单位表改为用户选定的历史职业一级与成长，技能及经济工作簿字节不变。原先依赖旧高生命/魔法的固定预算测试已显式固定夹具；新测试仍须用真实等级/资源检查释放资格，不能假设法师一级有1000魔法。新增技能先暂存，同名升级可绕过满暂存。

r7首次云端UI完整性因暂停面板重建失败，未创建Release；r8追加内容未变时保留DOM的修复及4倍CPU限速回归，实际交付按docs/r8-validation.md核验。当前模拟修订arena-2026-10-30-shop-heroes-r8，平衡配置hash不变。

## C17优先范围

先读最终注册程序、完整AA字段及历史证据，再做真实before。已有API或旧账本表述过时先核对实际结果，不为凑缺口重复实现。

| 方向 | 具体接续 |
| --- | --- |
| 静电场真实接触 | Fortune、ChainFrost、MagicMissile、Cask、PrimalRoar、ManaVoid、Sharpshooter的状态先行路径；按各自实际抵挡与接触时点使用声明式contact，不统一代理所有status。 |
| 几何/运动接触 | Boomerang单位与地面分开、Fissure主伤与Aftershock分开、Snowball实际碰撞、IcePath首次接触；只在实际命中处理，不提前到施法释放。 |
| 延迟/标记与原生演员 | Finger250ms credit marker、Familiar自身是否实际拥有Field、IceBlast路径frostbite与落点、Frostbite/TimeLock延迟包；不得用即时wrapper改变异步时点或把拥有者被动授予召唤物。 |
| 结算与继承 | Luminosity与真实强暴击/变量暴击、远程就绪分配、部分屏障/朗姆/非致死；Jingu已复制属性但精确时钟/继承allowlist仍待证。 |
| 几何与版本证据 | Fissure初始推开、首格/端点算式、Boomerang近400三角顶点；LifeBreak与NetherSwap魂缚中间时序冲突。两个2023Guide请求429已停，勿重复换别名。 |

可读C16来源/账本和ignored output/c16-damage-intake/static-contact-inventory.json；后者是18条人工定位候选，非全目录已完成证明。不可达冬之诅咒、树木/视野/高低地与真实缺失分别分类，不编补偿收益。

## 当前协议与证据

- 真实queueSpellOrder显式unit/point，持久journal复原未执行输入及替换前摇；AI默认模式保持。普通追击只有一份运动预算并让位于合法施法。转身仍为已公开匀速候选。
- damageWithEffects仅声明一次真实接触；onBeforeAttackHealthCommit读取单次真实解析阶段，不重抽随机/格挡或再耗屏障。未到达阶段为空而非伪造零。
- 接收状态执行路由保留提供者/点数/归属；移除、过期、新生、取消及效果专用子施法各有边界。偷技多提供者组合尚未全部覆盖。
- Chakra、共用Magma、大树波动、四职业Jingu属性及来源死亡/实际驱散有真结果。Lance纯展示假施法/假弹与IceBlast爆炸、Arena单整圈均有实际画面；14段Arena碰撞仍是工程近似。
- 230主/109授予/18参考/1455档/2629参数/33单位/4职业。当前Excel与编译输出见r7验证说明，Excel依旧唯一平衡源，不手改generated。C16的原配置hash及当时工作簿证据保留在C16文档。

最终3949全仓、3457来源结果和64镜头、7生产报告见docs/r6-c16-progress.md与artifacts/r6-c16-validation.json。3453技能要求中2619具来源和当前结果、834开放；189共用要求中52开放。任何src/tests/config/acceptance或vite测试配置变化均须刷新proof。

r7为4010全仓、3457来源与8份生产报告；本次没有重跑C16的64镜头，不把旧画面当作当前源码新取证。新商店/等级画面与当前指纹见docs/r7-validation.md、artifacts/r7-validation.json。

开发画面取证期间禁止build/reference verify/公开报告重生成，全部browser关净后才做最终检查。r6留作源码检查点；r9按用户新增功能、面板修复及验收时序修正发布开发版，原作全量验收目标继续保留。版本完成后遵照AGENTS核实提交、ZIP与校验报告附件再交付。

实际交付接续为r9：r8云端旧冒烟在未暂停时比较可变技能数组失败，源码快照隔离经复核无共享；r9先冻结全部战斗再比较，固定种子并按弹窗出现完成真实长按。r7/r8未创建Release、tag不移动。当前模拟修订arena-2026-10-30-shop-heroes-r9，配置hash不变；完整验证见docs/r9-validation.md。

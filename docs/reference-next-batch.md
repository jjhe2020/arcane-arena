# 原作验收接续点

完整目标不变：230项主技能及其授予效果的机制、时序、Super/Gaben和相关组合逐项验收。C15以C14提交bd1362979d697e6573515575b2cf155350b45a84为基线，最后15项已进入具名审查；230已开始、0未审、整项通过仍为7。不得把“全目录开始审查”当作“全目录原作终验完成”。

## C16 优先回查范围

下一阶段先读取现有最终注册程序、完整AA字段、历史来源与结构化缺口，做真实before，再决定最窄修正；不要仅凭旧账本文字重复实现已经存在的共用API。

| 方向 | 优先条目 |
| --- | --- |
| 运动与订单 | Boomerang地面/近点路径；Fissure分段碰撞及实际边缘；LifeBreak魂缚与长追击；NetherSwap三方魂缚顺序；MeatHook来源死亡/特定屏障 |
| 触发与召唤 | Chakra施法者死后状态路由与其余充能族；Cookie/Kisses/SpitOut共用燃烧；GreaterTreant原生102–114波动；Jingu职业克隆身份/动画 |
| 结算与表现 | Luminosity先治疗及结算基数；StaticField全部触发减益顺序；IceBlast独占击杀优先；SpiritLance既有幻象假弹表现；Trample自动追击走位 |

这是现有条款的接续清单，不是新增主技能。若已有功能只缺具名结果，补实际组合；若缺原AA Lua或精确历史证据，保工作行为并单列source_pending。平面地图、外部不可达实体、用户未要求的手动操作界面与实际实现缺失分别分类，不编替代收益。

## C15 已落地协议与边界

- 接受法术包有前置阶段，能读取主伤害前HP，护盾全吸收和FalsePromise仍只有一次原始事件；不能据此关闭所有“减益先于StaticField”的调用方条款。
- 白字专用bonus、含暴击的真实cleave基数和非攻击flat-average公式分开；nativeTide使用真实slot冷却，显式实例不按id误取另一槽。
- root/leash分别声明；outOfGame独立于hidden视觉；同一投掷controller可变落点/限实际段速度/死后继续；线性波可显式跟随来源平移。
- Smoke单来源blind为PRD，强制命中不耗trial；多来源准确率/致盲/闪避顺序仍是明确工作策略。Assassinate可单弹因不可侦测失锁，不删除其它弹。
- Unleash明确解除普通AS及.12保护，真实ChemicalRage组合已测；30Hz与极高攻速仍是工程边界。
- Ray非channel，独立G太阳、1.4秒Toss、真实Stop/Steal组合已测；离散采样、原AA太阳与HornToss全部例外仍待证。Tricks“更长前摇”数字未知，保.3工作值。
- Uproar公开0冷却与独立7秒候选停用期分开；AA是否继承隐藏钟仍pending。图层资格只随真实临时状态，不用永久属性冒充。
- 33原生模板都有显式等级；920场真实目录battle的普通召唤观察已补Boar/Golem/Sun身份。Jingu克隆仍没有原生模板，其职业快照/动画仍开放。

## 配置与验证约定

唯一表作者汇总机器spec、手动compile。C15配置hash为3dd65647f71209f382bf22f4a9b6b00d0e593bde592b07b6b0986b1b52466a94；230主、109授予、18参考、1455档、2626参数、33单位、4职业。12页样式/真筛选保持，经济本字节不变。原生真实等级、AA完整档与效果wrapper不可混用；Smoke仅实际调用4级行有明确AA2秒覆盖，其余原生基线留存。

最终汇总见docs/r6-c15-progress.md和artifacts/r6-c15-validation.json。3831全仓、3339来源检查已通过；结构化计数3439条技能要求中2603具来源及结果，836未闭合；110共用要求中14开放。后续有任何src/tests/config/acceptance变动都须刷新proof。

开发画面取证时禁止build、reference:verify和公开报告重生成；所有浏览器确认关闭后才进行最终proof和生产构建。每个完整源码检查点验证后提交推送，r6当前未建tag/Release；版本真正完成时按AGENTS.md核实提交、ZIP及报告后发布。

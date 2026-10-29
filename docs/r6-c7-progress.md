# r6 C7：攻击附伤、恢复与冰霜控制

本批是继续230项原作验收的源码检查点。C6基线提交为`23d84055aff0d0e07270229bbc0cf800d706d1e3`；r6尚未创建tag或发布Release，不能将本批分项结果称为全部原作终验。

## 实现入口

- `src/combat/flak-flesh-acceptance.ts`：Flak Cannon、Flame Guard、Flesh Golem、Flesh Heap、Focus Fire。区分攻击开始/释放/命中，Flak副弹不带攻击修饰，Side Gunner带修饰并有原生近战距离限制；旧AA100%火盾在魔抗前消耗，辐耀独立使用物品效果语义；Golem改为近战，实际禁锢幻象只复制剩余变身且不重复加属性；Focus按攻击开始快照减主伤，不削减独立附伤。
- `src/combat/frost-control-acceptance.ts`：Fortune's End、Freezing Field、Frost Arrows、Frost Shield、Frostbite。包括不可躲避气运弹体、基本驱散的实际受体、免费原生四级Flames/一级Rain子结算与统计、每秒四跳Frostbite、冰盾100ms首跳与重施唯一时钟、从主目标命中位置飞出的分裂攻击，以及冰霜领域的独立光环/爆炸时钟和中断清理。
- `src/combat/fury-global-acceptance.ts`：Fury Swipes、Gaben's Strength、Ghostship、Glaives of Wisdom、Global Silence。Fury为同一攻击包内的非暴击条件附伤，独立接受法强而不重复减免/格挡；Glaives先窃智后纯粹伤害，临时源智力改变保留魔法比例，永久正负智力均进入双方跨回合/存档；幽灵船有真实航路和每秒还款账本，全域静默的受体资格与原生Curse子效果分开处理。
- `src/combat.ts`：新增每发攻击弹速/起点、单次躲避回调与当前弹体更新队列取消、显式历史盾阶段、英雄攻击减伤资格、永久属性增减、幻象临时属性基线重定位、具名乘法减疗及原始类型/提供者账本。各入口按声明启用，不将一个技能的例外套给所有技能。

## 配置与展示

最终配置hash：`2e2760c9c65a5febc198cc2837a0f1973b82b6e0cdd6ea378560177d38e960a4`。230主技能、76授予效果、21原生参考、1379等级行、2662参数、14单位模板、四职业。20个配置域统一迁移，原1374等级行按白名单核对，新增Flames原生1–4级及Rain原生1级；清除92个失效/重复参数。单位表新增原生等级列和Zombie模板，职业、经济及其它未授权有效值保持不变。9处新增参数说明补齐中文，时间为毫秒，距离及弹速保留Dota原生单位。

`scripts/c7-render-smoke.mjs`以真实开发模块的`createBattle/stepBattle`观察Golem、航行幽灵船、Tidal Wave和Frost分裂弹。桌面/移动各四场景检查图集加载、变身身体、弹体位置和渲染不改变冻结模拟。观察夹具的高生命/静止单位不属于原作性能或全量时序证明；生产UI另有独立冒烟。

`tests/projectile-disjoint-lifecycle.test.ts`的两个合成程序夹具专门验证引擎队列重入：首弹命中取消同帧后续弹一次，回调新建弹不被误删，以及隐身躲避冻结原弹坐标。它们不冒称Magic Missile原作行为证据。

## 精确边界

- 本批三组均有尚未闭合的具名要求。完整目录、每项来源、已知实际缺失与待补证分别见生成的`docs/skill-reference-status.md`和三组来源账本。
- Flame Guard的AA100%吸收与7.31后native70%是明确版本/数值差异；保留AA数值。7.33盾阶段变更不能独自证明它与False Promise、Borrowed Time及Refraction的全部历史优先级。
- 原生条目明确Glaives弹射伤害在攻击开始计算，当前仍在主击命中时保存主伤快照；此为有来源的实际缺失。Frost分裂附伤随50%缩放为明确的AA工作解释，不因数值测试通过而宣称原AA Lua已恢复。
- Ghostship的静态AA说明与官方Season4修复公告方向冲突，本批采用具名修复的向自身阵营方向；Hangover首笔在到期后一秒、不同提供者优先级，以及无敌/False Promise期间SetHealth的精确处理仍分开标明，不借10次/1秒的记载扩大为全部通过。
- 原生转身加速度、平面场地以外的视野/树木/地形分支及其他来源缺口继续保留；当前仍使用已声明的匀速转身工作模型。

实际最终检查与当前计数见`docs/r6-validation.md`。后续C8仅做忽略目录中的资料研究，当前批验证后再开始改动运行代码。

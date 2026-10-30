# 原作验收接续点

完整目标不变：230项主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项验收。最新C14以C13提交cc20fe438c1ec657b85f77ec22c2a033ce1a42d9为基线；215已开始、15未审、7整项通过。本批记录见docs/r6-c14-progress.md和artifacts/r6-c14-validation.json，不以检查点代替全部目标。

## C15 后续范围

以下是当前实际尚未开始逐条审查的15项。可先在ignored output做只读来源与真实before诊断，正式实现仍须核对最终注册程序、完整AA字段和当前配置。

- 运动与范围：震荡波（custom_magnataur_shockwave）、奔袭冲撞（centaur_stampede）、烈日炙烤（custom_phoenix_sun_ray）、投掷（custom_tiny_toss）、踏（primal_beast_trample）。
- 攻击与节奏：瞄准（custom_sniper_take_aim）、潮汐使者（kunkka_tidebringer）、绝杀秘技（custom_riki_tricks_of_the_trade）、怒拳破（marci_unleash）、风行（custom_windrunner_windrun）。
- 被动与伤害状态：静电场（custom_zuus_static_field）、粘性燃油（batrider_sticky_napalm）、咤（primal_beast_uproar）、瘴气（venomancer_venomous_gale）、恐怖波动（vengefulspirit_wave_of_terror）。

现有其它技能使用这些真实技能的某个组合，不代表所有条款已经审过。全目录开始审查后，还须按逐项状态回查实际缺失、来源待补和未完结果，不把230项“已开始”当作230项“整项通过”。

## 已明确边界

- C14有3196条技能要求：2423有来源和当前结果、773未闭合；100共用要求中14未闭合。范围外与不可达外部技能分支单列。
- 必须读取AA完整字段，尤其differences、AI、notes。C13已修Quill无人范围也施放、Goo取消前摇及增加距离，并纠正Goo被误称目录外；不能用原生/现代数值覆盖AA明确自定义。
- C14已实现攻击开始抽取和Walrus主动/被动优先，旧point-only缺口已消除。Chaos准确首帧、变量/固定优先、Luminosity消费/在途预留和其它修饰随机顺序仍有独立证据门。
- 偷技具有独立前摇上限、平减CD、刷新、死亡和通用充能保存。Windrun真实调用方验证重偷不重置；其它自定义充能、Realm忘技后在途载荷、AA6/9继承及25秒原文疑义不能泛放行。既有0.2秒CD下限仍为工作规则。
- Barrage与Searing同页合包冲突、Spear双半秒延迟与24跳总额冲突均保留。不能通过凑总额或放大暴击掩盖。
- Mjollnir5阈值/部分目标条件、Visage/Lycan未取得的精确历史页、BigWolf五倍属性范围、平面地图及不可达外部组合维持具体边界，不造迷雾/树木/高低地替代收益。

## 配置与验证约定

Excel由唯一作者汇总机器spec后编译。最终hash fe8fa08c8ae11f34ca24d214772ca307863d54cef1dedabcb366c4cb8f017f7e；104授予、18参考、1439档、2637参数、30单位。12实际筛选与样式保持、经济本字节不变。原生等级、技术wrapper与AA点数不得混用。

变更后重新跑全仓和reference:verify；浏览器全部关闭后才能构建。reference:verify会更新公开报告，不能在开发模块取证中触发HMR。当前97文件3568项全仓、61文件3077项来源、76场画面和7生产报告均通过；指纹1f16c6a20f9e6d82475170a2780b3cc60ce56622eae7bd4d9c7f29cccaf4deaa。

每个完整源码检查点验证后提交推送。r6尚无tag/Release；全部目标达成或形成明确完成的开发版本时按AGENTS.md发布并核对提交、ZIP及校验附件。

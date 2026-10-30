# 原作验收接续点

完整目标不变：230项主技能及其授予效果的机制、动作时序、Super/Gaben和相关组合逐项验收。最新已验证源码检查点C13以C12提交7b2122b038e7ceac0bbc3a752b74938fb223ffe1为基线；200项已开始、30项未审、7项整项通过。完整证据见docs/r6-c13-progress.md、artifacts/r6-c13-validation.json和当前逐项状态，不以检查点代替全部目标。

## C14只读接续

后续三组计划如下，现阶段资料与真实before诊断只保存在ignored output，不修改C13已验证源码。

- 召唤与变身：召唤佣兽（custom_visage_summon_familiars）、熊灵伙伴（custom_lone_druid_spirit_bear）、召狼（custom_lycan_summon_wolves）、变身（lycan_shapeshift）、吸血灵魂（custom_skeleton_king_vampiric_aura）。

- 目标与控制：技能窃取（custom_rubick_spell_steal）、魂断（terrorblade_sunder）、真空（dark_seer_vacuum）、一箭穿心（custom_hoodwink_sharpshooter）、暗影之境（custom_dark_willow_shadow_realm）。

- 攻击与短时状态：灼热之箭（clinkz_searing_arrows）、暗影之舞（slark_shadow_dance）、无影拳（ember_spirit_sleight_of_fist）、战神迅矛（custom_mars_spear_of_mars）、灵魂之矛（custom_phantom_lancer_spirit_lance）。

根代理另须解决普通暴击完整随机试验发生于攻击开始的实际缺口，含Walrus手动/被动优先、同一record、免CD/hooks与strongest-first。完整只读方案和真实诊断位于output/c14-critical-intake；未实现或关闭此门。变量/固定暴击和Luminosity消费的原作证据仍单独待补。

## 再后15项

震荡波（custom_magnataur_shockwave）、奔袭冲撞（centaur_stampede）、静电场（custom_zuus_static_field）、粘性燃油（batrider_sticky_napalm）、烈日炙烤（custom_phoenix_sun_ray）、瞄准（custom_sniper_take_aim）、潮汐使者（kunkka_tidebringer）、投掷（custom_tiny_toss）、踏（primal_beast_trample）、绝杀秘技（custom_riki_tricks_of_the_trade）、怒拳破（marci_unleash）、咤（primal_beast_uproar）、瘴气（venomancer_venomous_gale）、恐怖波动（vengefulspirit_wave_of_terror）、风行（custom_windrunner_windrun）。

## 已明确的边界与约定

- C13共有2925条技能要求：2217条具当前来源和结果、708未闭合；89条共用要求中14条未闭合。实际缺失、来源待补、工作解释及不可达外部技能组合分开，不把资料可用或窄例通过当成整技能终验。
- AA必须读取完整字段，包括differences、AI、notes及显式自定义。C13纠正Goo取消前摇/提高范围和Quill无人范围也施放，不能再把Wiki原版覆盖明确AA差异。C12误写Goo目录外也已纠正；声称目录不存在前实际查询完整230目录及授予域。
- Excel仍由一位作者汇总机器spec后手动编译。最终hash f90bd827844472d5a4ed12630e312bdcea12c99c7d02b6e33843925f5553b7b8；12真实table筛选已补，格式变化不改canonical数值hash。删除的旧死参数不得回流。
- 当前平面竞技场范围不增加迷雾、树木或高低地补偿。全局寻路、转身加速度、完整继承/吸血/反射/屏障和偷技生命周期仍按具名边界逐条核验。

## 验证与发布

最终registry会叠加历史程序与验收覆写，诊断必须看最终真实函数。修改后重建npm run reference:verify的代码、配置和账本指纹，不沿用旧通过。每个源码检查点完成全仓、构建、生产及受影响专项后提交推送。r6没有tag或Release；全部目标达成或形成明确完成的开发版本时，按AGENTS.md发布并核验附件。

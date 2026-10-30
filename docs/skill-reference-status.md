# 技能原作逐项验收

目录 230 项；已开始 215 项；完整逐项通过 7 项。
当前代码下，2423 条具名结果测试要求通过，2423 条同时具备逐条来源绑定；另有14项跨技能引擎要求未闭合。测试证据与当前代码一致。

这里的“审查中”不表示整项通过。完整规则、版本冲突、升级来源和具名测试见逐组 JSON；运行 `npm run reference:verify` 更新代码指纹与实际 Vitest 证据。所有未审查技能均保留在表内。

| 技能 | 状态 | 机制/时序/Super/Gaben/组合的已核查条款 | 未解决项 | 证据 |
|---|---|---|---:|---|
| 酸性喷雾 (Acid Spray) | 审查中 | 3 / 6 / 1 / 2 / 12 | 1 | [审查记录](../references/dota-wiki/acceptance/projectiles-and-fields.json) |
| 爆栗出击 (Acorn Shot) | 审查中 | 1 / 1 / 1 / 1 / 1 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 锚击 (Anchor Smash) | 审查中 | 1 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 上古封印 (Ancient Seal) | 审查中 | 2 / 3 / 2 / 3 / 4 | 1 | [审查记录](../references/dota-wiki/acceptance/projectiles-and-fields.json) |
| 无光之盾 (Aphotic Shield) | 审查中 | 0 / 1 / 1 / 0 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 弧形闪电 (Arc Lightning) | 审查中 | 5 / 4 / 1 / 2 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/projectiles-and-fields.json) |
| 奥术光环 (Arcane Aura) | 审查中 | 1 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 奥法鹰隼 (Arcane Bolt) | 审查中 | 5 / 3 / 3 / 3 / 9 | 4 | [审查记录](../references/dota-wiki/acceptance/projectiles-and-fields.json) |
| 严寒烧灼 (Arctic Burn) | 审查中 | 2 / 1 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/attack-modes.json) |
| 热血竞技场 (Arena Of Blood) | 审查中 | 1 / 2 / 1 / 1 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/fields-dashes-channels.json) |
| 灵体游魂 (Astral Spirit) | 审查中 | 1 / 3 / 1 / 2 / 3 | 1 | [审查记录](../references/dota-wiki/acceptance/fields-dashes-channels.json) |
| 太虚之径 (Astral Step) | 审查中 | 2 / 2 / 1 / 1 / 5 | 2 | [审查记录](../references/dota-wiki/acceptance/fields-dashes-channels.json) |
| 衰退光环 (Atrophy Aura) | 审查中 | 2 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 深海重击 (Bash of the Deep) | 逐项通过 | 1 / 2 / 1 / 1 / 4 | 0 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 弹幕冲击 (Battery Assault) | 逐项通过 | 1 / 3 / 1 / 1 / 2 | 0 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 战斗专注 (Battle Trance) | 逐项通过 | 3 / 2 / 1 / 1 / 6 | 0 | [审查记录](../references/dota-wiki/acceptance/attack-modes.json) |
| 狂战士之血 (Berserker's Blood) | 审查中 | 2 / 1 / 1 / 1 / 1 | 1 | [审查记录](../references/dota-wiki/acceptance/attack-modes.json) |
| 狂战士之怒 (Berserker's Rage) | 审查中 | 3 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/attack-modes.json) |
| 黑洞 (Black Hole) | 审查中 | 0 / 3 / 1 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/fields-dashes-channels.json) |
| 剑刃风暴 (Blade Fury) | 审查中 | 2 / 1 / 1 / 1 / 2 | 1 | [审查记录](../references/dota-wiki/acceptance/attack-modes.json) |
| 爆破起飞！ (Blast Off!) | 逐项通过 | 1 / 2 / 2 / 2 / 8 | 0 | [审查记录](../references/dota-wiki/acceptance/fields-dashes-channels.json) |
| 闪烁 (Blink) | 审查中 | 0 / 0 / 0 / 0 / 1 | 1 | [审查记录](../references/dota-wiki/acceptance/projectiles-and-fields.json) |
| 嗜血术 (Bloodlust) | 逐项通过 | 1 / 3 / 1 / 1 / 2 | 0 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 血怒 (Bloodrage) | 审查中 | 1 / 1 / 1 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 回光返照 (Borrowed Time) | 审查中 | 1 / 0 / 0 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 棒击大地 (Boundless Strike) | 审查中 | 1 / 1 / 1 / 1 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 蚀脑 (Brain Sap) | 审查中 | 1 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 炽烈火雨 (Burning Barrage) | 审查中 | 0 / 1 / 1 / 1 / 6 | 1 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
| 沸血之矛 (Burning Spear) | 审查中 | 4 / 2 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/proc-acceptance.json) |
| 掘地穿刺 (Burrowstrike) | 审查中 | 0 / 1 / 1 / 1 / 8 | 1 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
| 野性呼唤 (Call of the Wild) | 审查中 | 2 / 1 / 2 / 1 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/summon-restoration.json) |
| 连环霜冻 (Chain Frost) | 审查中 | 5 / 2 / 1 / 1 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/control-execution.json) |
| 查克拉魔法 (Chakra Magic) | 审查中 | 1 / 2 / 1 / 2 / 2 | 5 | [审查记录](../references/dota-wiki/acceptance/control-execution.json) |
| 锯齿飞轮 (Chakram) | 审查中 | 0 / 1 / 2 / 1 / 9 | 3 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
| 混沌一击 (Chaos Strike) | 审查中 | 3 / 1 / 1 / 2 / 3 | 2 | [审查记录](../references/dota-wiki/acceptance/proc-acceptance.json) |
| 混乱献祭 (Chaotic Offering) | 审查中 | 3 / 1 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/summon-restoration.json) |
| 暗影冲刺 (Charge of Darkness) | 审查中 | 0 / 1 / 1 / 2 / 6 | 3 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
| 化学狂暴 (Chemical Rage) | 审查中 | 1 / 1 / 1 / 0 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/summon-restoration.json) |
| 时间结界 (Chronosphere) | 审查中 | 0 / 1 / 1 / 0 / 6 | 3 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
| 极寒之拥 (Cold Embrace) | 逐项通过 | 2 / 1 / 1 / 2 / 4 | 0 | [审查记录](../references/dota-wiki/acceptance/summon-restoration.json) |
| 侵蚀雾霭 (Corrosive Haze) | 审查中 | 2 / 2 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/control-execution.json) |
| 腐蚀皮肤 (Corrosive Skin) | 审查中 | 2 / 1 / 1 / 1 / 4 | 1 | [审查记录](../references/dota-wiki/acceptance/summon-restoration.json) |
| 反击螺旋 (Counter Helix) | 审查中 | 2 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/proc-acceptance.json) |
| 恩赐解脱 (Coup de Grace) | 审查中 | 3 / 1 / 1 / 2 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/proc-acceptance.json) |
| 伤残恐惧 (Crippling Fear) | 审查中 | 1 / 2 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/control-execution.json) |
| 淘汰之刃 (Culling Blade) | 审查中 | 3 / 2 / 1 / 1 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/control-execution.json) |
| 魔霭诅咒 (Curse of Avernus) | 审查中 | 3 / 2 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/proc-acceptance.json) |
| 诅咒王冠 (Cursed Crown) | 审查中 | 0 / 1 / 0 / 1 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 黑暗契约 (Dark Pact) | 审查中 | 0 / 1 / 0 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 死亡脉冲 (Death Pulse) | 审查中 | 1 / 1 / 1 / 1 / 3 | 1 | [审查记录](../references/dota-wiki/acceptance/death-demonic.json) |
| 死亡守卫 (Death Ward) | 审查中 | 2 / 2 / 1 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/death-demonic.json) |
| 腐朽 (Decay) | 审查中 | 2 / 1 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/death-demonic.json) |
| 邪恶净愈 (Demonic Cleanse) | 审查中 | 1 / 1 / 1 / 0 / 3 | 1 | [审查记录](../references/dota-wiki/acceptance/death-demonic.json) |
| 邪恶净化 (Demonic Purge) | 逐项通过 | 2 / 1 / 1 / 1 / 6 | 0 | [审查记录](../references/dota-wiki/acceptance/death-demonic.json) |
| 折射 (Dispersion) | 审查中 | 5 / 1 / 1 / 1 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/reflection-demon.json) |
| 过肩摔 (Dispose) | 审查中 | 2 / 3 / 1 / 1 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/reflection-demon.json) |
| 崩裂禁锢 (Disruption) | 审查中 | 1 / 3 / 2 / 1 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/reflection-demon.json) |
| 异化 (Dissimilate) | 审查中 | 1 / 1 / 1 / 1 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/reflection-demon.json) |
| 末日 (Doom) | 审查中 | 2 / 3 / 1 / 3 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/reflection-demon.json) |
| 双刃剑 (Double Edge) | 审查中 | 1 / 2 / 3 / 2 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/edge-earth.json) |
| 龙族血统 (Dragon Blood) | 审查中 | 1 / 1 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 龙破斩 (Dragon Slave) | 审查中 | 1 / 1 / 1 / 2 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/edge-earth.json) |
| 决斗 (Duel) | 审查中 | 4 / 1 / 0 / 1 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/edge-earth.json) |
| 裂地沟壑 (Earth Splitter) | 审查中 | 1 / 1 / 2 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/edge-earth.json) |
| 震撼大地 (Earthshock) | 审查中 | 2 / 1 / 3 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/edge-earth.json) |
| 古龙形态 (Elder Dragon Form) | 审查中 | 3 / 12 / 2 / 1 / 6 | 5 | [审查记录](../references/dota-wiki/acceptance/dragon-echo.json) |
| 授予力量 (Empower) | 审查中 | 3 / 2 / 1 / 1 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/dragon-echo.json) |
| 强化图腾 (Enchant Totem) | 审查中 | 1 / 5 / 1 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/dragon-echo.json) |
| 地震 (Epicenter) | 审查中 | 1 / 5 / 3 / 1 / 2 | 2 | [审查记录](../references/dota-wiki/acceptance/dragon-echo.json) |
| 精华变迁 (Essence Flux) | 审查中 | 1 / 3 / 1 / 2 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/dragon-echo.json) |
| 能量转移 (Essence Shift) | 审查中 | 2 / 4 / 3 / 0 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/restoration-identity.json) |
| 风暴之眼 (Eye of the Storm) | 审查中 | 1 / 4 / 1 / 1 / 7 | 3 | [审查记录](../references/dota-wiki/acceptance/restoration-identity.json) |
| 弱化能流 (Fade Bolt) | 审查中 | 1 / 0 / 1 / 1 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/restoration-identity.json) |
| 虚妄之诺 (False Promise) | 审查中 | 0 / 1 / 2 / 2 / 6 | 4 | [审查记录](../references/dota-wiki/acceptance/restoration-identity.json) |
| 盛宴 (Feast) | 审查中 | 5 / 0 / 9 / 1 / 5 | 9 | [审查记录](../references/dota-wiki/acceptance/restoration-identity.json) |
| 野性驱使 (Feral Impulse) | 审查中 | 1 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 热血战魂 (Fervor) | 审查中 | 2 / 1 / 1 / 1 / 0 | 5 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 魔爪 (Fiend's Grip) | 审查中 | 1 / 3 / 3 / 1 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/fire-fissure.json) |
| 炽魂 (Fiery Soul) | 审查中 | 1 / 2 / 1 / 1 / 7 | 1 | [审查记录](../references/dota-wiki/acceptance/fire-fissure.json) |
| 死亡之指 (Finger of Death) | 审查中 | 2 / 1 / 2 / 1 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/fire-fissure.json) |
| 龙炎饼干 (Firesnap Cookie) | 审查中 | 0 / 2 / 0 / 1 / 9 | 3 | [审查记录](../references/dota-wiki/acceptance/fire-fissure.json) |
| 沟壑 (Fissure) | 审查中 | 1 / 2 / 1 / 4 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/fire-fissure.json) |
| 高射火炮 (Flak Cannon) | 审查中 | 6 / 1 / 2 / 0 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/flak-flesh.json) |
| 烈火罩 (Flame Guard) | 审查中 | 1 / 4 / 0 / 0 / 7 | 7 | [审查记录](../references/dota-wiki/acceptance/flak-flesh.json) |
| 血肉傀儡 (Flesh Golem) | 审查中 | 2 / 1 / 6 / 1 / 7 | 5 | [审查记录](../references/dota-wiki/acceptance/flak-flesh.json) |
| 腐肉堆积 (Flesh Heap) | 审查中 | 1 / 1 / 2 / 0 / 6 | 5 | [审查记录](../references/dota-wiki/acceptance/flak-flesh.json) |
| 集中火力 (Focus Fire) | 审查中 | 3 / 2 / 2 / 1 / 11 | 3 | [审查记录](../references/dota-wiki/acceptance/flak-flesh.json) |
| 气运之末 (Fortune's End) | 审查中 | 0 / 2 / 4 / 3 / 9 | 4 | [审查记录](../references/dota-wiki/acceptance/frost-control.json) |
| 极寒领域 (Freezing Field) | 审查中 | 1 / 3 / 4 / 4 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/frost-control.json) |
| 霜冻之箭 (Frost Arrows) | 审查中 | 3 / 0 / 1 / 4 / 9 | 8 | [审查记录](../references/dota-wiki/acceptance/frost-control.json) |
| 冰霜魔盾 (Frost Shield) | 审查中 | 0 / 5 / 1 / 1 / 10 | 4 | [审查记录](../references/dota-wiki/acceptance/frost-control.json) |
| 冰封禁制 (Frostbite) | 审查中 | 0 / 2 / 1 / 4 / 5 | 4 | [审查记录](../references/dota-wiki/acceptance/frost-control.json) |
| 怒意狂击 (Fury Swipes) | 审查中 | 4 / 1 / 1 / 1 / 5 | 1 | [审查记录](../references/dota-wiki/acceptance/fury-global.json) |
| G 胖力量 (Gaben's Strength) | 审查中 | 1 / 3 / 1 / 1 / 2 | 1 | [审查记录](../references/dota-wiki/acceptance/fury-global.json) |
| 幽灵船 (Ghostship) | 审查中 | 2 / 4 / 1 / 1 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/fury-global.json) |
| 智慧之刃 (Glaives of Wisdom) | 审查中 | 1 / 3 / 1 / 4 / 9 | 4 | [审查记录](../references/dota-wiki/acceptance/fury-global.json) |
| 全领域静默 (Global Silence) | 审查中 | 1 / 3 / 1 / 1 / 3 | 2 | [审查记录](../references/dota-wiki/acceptance/fury-global.json) |
| 神之谴戒 (God's Rebuke) | 审查中 | 4 / 1 / 1 / 1 / 10 | 4 | [审查记录](../references/dota-wiki/acceptance/god-gust.json) |
| 黄泉颤抖 (Grave Chill) | 审查中 | 3 / 1 / 1 / 1 / 3 | 2 | [审查记录](../references/dota-wiki/acceptance/god-gust.json) |
| 长大 (Grow) | 审查中 | 1 / 1 / 1 / 2 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/god-gust.json) |
| 守护天使 (Guardian Angel) | 审查中 | 1 / 1 / 2 / 0 / 6 | 3 | [审查记录](../references/dota-wiki/acceptance/god-gust.json) |
| 狂风 (Gust) | 审查中 | 3 / 1 / 1 / 1 / 6 | 6 | [审查记录](../references/dota-wiki/acceptance/god-gust.json) |
| G 胖之手:  (Hand of Gaben) | 审查中 | 7 / 4 / 1 / 3 / 2 | 8 | [审查记录](../references/dota-wiki/acceptance/hand-ice.json) |
| 天国恩赐 (Heavenly Grace) | 审查中 | 5 / 0 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/hand-ice.json) |
| 妖术 (Hex) | 审查中 | 4 / 1 / 0 / 0 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/hand-ice.json) |
| 凤凰冲击 (Icarus Dive) | 审查中 | 7 / 5 / 4 / 1 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/hand-ice.json) |
| 冰晶爆轰 (Ice Blast) | 审查中 | 6 / 6 / 1 / 1 / 15 | 11 | [审查记录](../references/dota-wiki/acceptance/hand-ice.json) |
| 冰封路径 (Ice Path) | 审查中 | 3 / 3 / 0 / 4 / 2 | 7 | [审查记录](../references/dota-wiki/acceptance/ice-inner.json) |
| 冰晶 (Ice Shards) | 审查中 | 1 / 3 / 1 / 1 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/ice-inner.json) |
| 推进 (Impetus) | 审查中 | 2 / 1 / 0 / 0 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/attack-trigger.json) |
| 阎刃 (Infernal Blade) | 审查中 | 2 / 5 / 0 / 1 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/ice-inner.json) |
| 墨涌 (Ink Swell) | 审查中 | 2 / 5 / 3 / 1 / 2 | 5 | [审查记录](../references/dota-wiki/acceptance/ice-inner.json) |
| 野性之心 (Inner Beast) | 审查中 | 4 / 3 / 1 / 1 / 7 | 3 | [审查记录](../references/dota-wiki/acceptance/ice-inner.json) |
| 心炎 (Inner Fire) | 审查中 | 4 / 2 / 0 / 0 / 5 | 5 | [审查记录](../references/dota-wiki/acceptance/inner-laser.json) |
| 极度饥渴 (Insatiable Hunger) | 审查中 | 0 / 2 / 0 / 0 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/inner-laser.json) |
| 如意棒法 (Jingu Mastery) | 审查中 | 7 / 3 / 0 / 0 / 5 | 10 | [审查记录](../references/dota-wiki/acceptance/inner-laser.json) |
| 海妖外壳 (Kraken Shell) | 审查中 | 2 / 1 / 0 / 0 / 6 | 4 | [审查记录](../references/dota-wiki/acceptance/inner-laser.json) |
| 激光 (Laser) | 审查中 | 6 / 2 / 0 / 0 / 2 | 9 | [审查记录](../references/dota-wiki/acceptance/inner-laser.json) |
| 寄生种子 (Leech Seed) | 审查中 | 3 / 3 / 1 / 1 / 8 | 7 | [审查记录](../references/dota-wiki/acceptance/leech-shredder.json) |
| 牺牲 (Life Break) | 审查中 | 4 / 2 / 1 / 2 / 9 | 6 | [审查记录](../references/dota-wiki/acceptance/leech-shredder.json) |
| 生命汲取 (Life Drain) | 审查中 | 3 / 4 / 2 / 2 / 12 | 6 | [审查记录](../references/dota-wiki/acceptance/leech-shredder.json) |
| 雷击 (Lightning Bolt) | 审查中 | 3 / 1 / 2 / 2 / 12 | 4 | [审查记录](../references/dota-wiki/acceptance/leech-shredder.json) |
| 霹雳铁手 (Lil' Shredder) | 审查中 | 4 / 3 / 2 / 1 / 3 | 9 | [审查记录](../references/dota-wiki/acceptance/leech-shredder.json) |
| 活体护甲 (Living Armor) | 审查中 | 0 / 3 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/living-field.json) |
| 月光 (Lucent Beam) | 审查中 | 1 / 3 / 1 / 0 / 3 | 5 | [审查记录](../references/dota-wiki/acceptance/living-field.json) |
| 熠熠生辉 (Luminosity) | 审查中 | 5 / 0 / 1 / 1 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/attack-trigger.json) |
| 月之祝福 (Lunar Blessing) | 审查中 | 1 / 1 / 1 / 10 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/living-field.json) |
| 魔法箭 (Magic Missile) | 审查中 | 2 / 1 / 1 / 2 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/living-field.json) |
| 磁场 (Magnetic Field) | 审查中 | 1 / 2 / 0 / 2 / 5 | 4 | [审查记录](../references/dota-wiki/acceptance/living-field.json) |
| 法力损毁 (Mana Break) | 审查中 | 1 / 1 / 5 / 1 / 9 | 3 | [审查记录](../references/dota-wiki/acceptance/mana-mirror.json) |
| 法力吸取 (Mana Drain) | 审查中 | 1 / 1 / 1 / 4 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/mana-mirror.json) |
| 魔法护盾 (Mana Shield) | 审查中 | 1 / 0 / 0 / 3 / 13 | 5 | [审查记录](../references/dota-wiki/acceptance/mana-mirror.json) |
| 肉钩 (Meat Hook) | 审查中 | 1 / 1 / 1 / 0 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/mana-mirror.json) |
| 镜像 (Mirror Image) | 审查中 | 1 / 0 / 1 / 4 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/mana-mirror.json) |
| 迷雾缠绕 (Mist Coil) | 审查中 | 2 / 4 / 0 / 0 / 5 | 5 | [审查记录](../references/dota-wiki/acceptance/mist-flare.json) |
| 勇气之霎 (Moment of Courage) | 审查中 | 2 / 0 / 0 / 1 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/attack-trigger.json) |
| 月刃 (Moon Glaives) | 审查中 | 3 / 2 / 0 / 0 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/mist-flare.json) |
| 蜥蜴绝吻 (Mortimer Kisses) | 审查中 | 2 / 7 / 0 / 0 / 3 | 8 | [审查记录](../references/dota-wiki/acceptance/mist-flare.json) |
| 数箭齐发 (Multishot) | 审查中 | 3 / 2 / 0 / 0 / 6 | 10 | [审查记录](../references/dota-wiki/acceptance/mist-flare.json) |
| 神秘之耀 (Mystic Flare) | 审查中 | 2 / 8 / 0 / 0 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/mist-flare.json) |
| 自然之助 (Nature's Attendants) | 审查中 | 3 / 3 / 3 / 1 / 4 | 5 | [审查记录](../references/dota-wiki/acceptance/nature-omni.json) |
| 自然的呼唤 (Nature's Call) | 审查中 | 3 / 2 / 0 / 1 / 2 | 6 | [审查记录](../references/dota-wiki/acceptance/nature-omni.json) |
| 移形换位 (Nether Swap) | 审查中 | 3 / 1 / 1 / 2 / 6 | 5 | [审查记录](../references/dota-wiki/acceptance/nature-omni.json) |
| 幽冥剧毒 (Nethertoxin) | 审查中 | 3 / 3 / 2 / 2 / 4 | 4 | [审查记录](../references/dota-wiki/acceptance/nature-omni.json) |
| 无敌斩 (Omnislash) | 审查中 | 3 / 2 / 2 / 1 / 8 | 9 | [审查记录](../references/dota-wiki/acceptance/nature-omni.json) |
| 过载 (Overcharge) | 审查中 | 1 / 1 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/overcharge-cask.json) |
| 疯狂生长 (Overgrowth) | 审查中 | 2 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/overcharge-cask.json) |
| 超负荷 (Overload) | 审查中 | 1 / 2 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/overcharge-cask.json) |
| 超强力量 (Overpower) | 审查中 | 1 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/overcharge-cask.json) |
| 麻痹药剂 (Paralyzing Cask) | 审查中 | 1 / 1 / 1 / 2 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/overcharge-cask.json) |
| 魅影之袭 (Phantasm) | 审查中 | 4 / 1 / 1 / 1 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/phantom-ward.json) |
| 幻影突袭 (Phantom Strike) | 审查中 | 3 / 1 / 0 / 0 / 7 | 2 | [审查记录](../references/dota-wiki/acceptance/phantom-ward.json) |
| 相位转移 (Phase Shift) | 审查中 | 2 / 1 / 2 / 2 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/phantom-ward.json) |
| 越界 (Pierce the Veil) | 审查中 | 2 / 1 / 1 / 4 / 5 | 4 | [审查记录](../references/dota-wiki/acceptance/phantom-ward.json) |
| 瘟疫守卫 (Plague Ward) | 审查中 | 5 / 1 / 0 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/phantom-ward.json) |
| 等离子场 (Plasma Field) | 审查中 | 7 / 1 / 2 / 2 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/plasma-pulse.json) |
| 毒性攻击 (Poison Attack) | 审查中 | 8 / 1 / 3 / 2 / 3 | 7 | [审查记录](../references/dota-wiki/acceptance/plasma-pulse.json) |
| 强攻 (Press The Attack) | 审查中 | 6 / 3 / 2 / 1 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/plasma-pulse.json) |
| 原始咆哮 (Primal Roar) | 审查中 | 4 / 7 / 3 / 2 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/plasma-pulse.json) |
| 脉冲新星 (Pulse Nova) | 审查中 | 7 / 9 / 1 / 2 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/plasma-pulse.json) |
| 捶 (Pulverize) | 审查中 | 3 / 2 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/pulverize-ravage.json) |
| 洗礼 (Purification) | 审查中 | 2 / 1 / 1 / 1 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/pulverize-ravage.json) |
| 刺针扫射 (Quill Spray) | 审查中 | 2 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/pulverize-ravage.json) |
| 狂暴 (Rage) | 审查中 | 2 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/pulverize-ravage.json) |
| 毁灭 (Ravage) | 审查中 | 1 / 1 / 1 / 1 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/pulverize-ravage.json) |
| 活性护甲 (Reactive Armor) | 审查中 | 6 / 2 / 1 / 1 / 4 | 3 | [审查记录](../references/dota-wiki/acceptance/reactive-refraction.json) |
| 实相裂隙 (Reality Rift) | 审查中 | 3 / 2 / 2 / 1 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/reactive-refraction.json) |
| 死神镰刀 (Reaper's Scythe) | 审查中 | 4 / 2 / 1 / 0 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/reactive-refraction.json) |
| 回身踢 (Rebound) | 审查中 | 2 / 3 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/reactive-refraction.json) |
| 折光 (Refraction) | 审查中 | 4 / 1 / 1 / 1 / 3 | 2 | [审查记录](../references/dota-wiki/acceptance/reactive-refraction.json) |
| 共鸣脉冲 (Resonant Pulse) | 审查中 | 7 / 2 / 3 / 5 / 0 | 7 | [审查记录](../references/dota-wiki/acceptance/resonant-arrow.json) |
| 巨石翻滚 (Rolling Boulder) | 审查中 | 5 / 0 / 1 / 2 / 7 | 8 | [审查记录](../references/dota-wiki/acceptance/resonant-arrow.json) |
| 滚雷 (Rolling Thunder) | 审查中 | 5 / 5 / 2 / 4 / 2 | 7 | [审查记录](../references/dota-wiki/acceptance/resonant-arrow.json) |
| 腐烂 (Rot) | 审查中 | 9 / 2 / 5 / 13 / 1 | 9 | [审查记录](../references/dota-wiki/acceptance/resonant-arrow.json) |
| 月神之箭 (Sacred Arrow) | 审查中 | 6 / 4 / 6 / 3 / 1 | 7 | [审查记录](../references/dota-wiki/acceptance/resonant-arrow.json) |
| 灼热之箭 (Searing Arrows) | 审查中 | 8 / 0 / 4 / 6 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/attack-state.json) |
| 暗影之舞 (Shadow Dance) | 审查中 | 6 / 4 / 1 / 6 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/attack-state.json) |
| 暗影之境 (Shadow Realm) | 审查中 | 2 / 5 / 0 / 1 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/control-target.json) |
| 暗影波 (Shadow Wave) | 审查中 | 7 / 3 / 2 / 8 / 2 | 5 | [审查记录](../references/dota-wiki/acceptance/restoration-link.json) |
| 变身 (Shapeshift) | 审查中 | 1 / 1 / 1 / 1 / 1 | 5 | [审查记录](../references/dota-wiki/acceptance/summon-lineage.json) |
| 一箭穿心 (Sharpshooter) | 审查中 | 5 / 6 / 1 / 2 / 5 | 6 | [审查记录](../references/dota-wiki/acceptance/control-target.json) |
| 震荡波 (Shockwave) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 健体术 (Sidekick) | 审查中 | 10 / 0 / 3 / 1 / 0 | 4 | [审查记录](../references/dota-wiki/acceptance/restoration-link.json) |
| 无影拳 (Sleight of Fist) | 审查中 | 4 / 1 / 1 / 0 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/attack-state.json) |
| 雪球 (Snowball) | 审查中 | 6 / 2 / 1 / 1 / 5 | 4 | [审查记录](../references/dota-wiki/acceptance/motion-release.json) |
| 噬魂 (Soul Rip) | 审查中 | 10 / 2 / 1 / 7 / 4 | 6 | [审查记录](../references/dota-wiki/acceptance/restoration-link.json) |
| 缚魂 (Soulbind) | 审查中 | 0 / 0 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 战神迅矛 (Spear of Mars) | 审查中 | 10 / 3 / 4 / 1 / 0 | 6 | [审查记录](../references/dota-wiki/acceptance/attack-state.json) |
| 技能窃取 (Spell Steal) | 审查中 | 2 / 3 / 0 / 1 / 8 | 5 | [审查记录](../references/dota-wiki/acceptance/control-target.json) |
| 尖刺外壳 (Spiked Carapace) | 审查中 | 1 / 0 / 0 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 灵魂之矛 (Spirit Lance) | 审查中 | 7 / 2 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/attack-state.json) |
| 幽魂链接 (Spirit Link) | 审查中 | 7 / 2 / 1 / 6 / 7 | 6 | [审查记录](../references/dota-wiki/acceptance/restoration-link.json) |
| 吸魂巫术 (Spirit Siphon) | 审查中 | 6 / 5 / 1 / 4 / 5 | 6 | [审查记录](../references/dota-wiki/acceptance/restoration-link.json) |
| 撕裂大地 (Split Earth) | 审查中 | 2 / 3 / 1 / 1 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/motion-release.json) |
| 奔袭冲撞 (Stampede) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 星破天惊 (Starbreaker) | 审查中 | 3 / 6 / 4 / 1 / 5 | 4 | [审查记录](../references/dota-wiki/acceptance/attack-trigger.json) |
| 静电场 (Static Field) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 静电连接 (Static Link) | 审查中 | 2 / 1 / 1 / 1 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 粘性燃油 (Sticky Napalm) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 石化凝视 (Stone Gaze) | 审查中 | 1 / 1 / 1 / 1 / 0 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 召唤佣兽 (Summon Familiars) | 审查中 | 4 / 5 / 1 / 2 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/summon-lineage.json) |
| 熊灵伙伴 (Summon Spirit Bear) | 审查中 | 5 / 6 / 1 / 3 / 10 | 6 | [审查记录](../references/dota-wiki/acceptance/summon-lineage.json) |
| 召狼 (Summon Wolves) | 审查中 | 3 / 2 / 1 / 2 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/summon-lineage.json) |
| 烈日炙烤 (Sun Ray) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 魂断 (Sunder) | 审查中 | 1 / 2 / 0 / 1 / 7 | 2 | [审查记录](../references/dota-wiki/acceptance/control-target.json) |
| 虚张声势 (Swashbuckle) | 审查中 | 1 / 1 / 1 / 1 / 1 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 摔角行家 (Tag Team) | 审查中 | 0 / 5 / 1 / 2 / 8 | 3 | [审查记录](../references/dota-wiki/acceptance/aura-armor.json) |
| 瞄准 (Take Aim) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 羁绊 (Tether) | 审查中 | 1 / 2 / 1 / 2 / 3 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 潮汐使者 (Tidebringer) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 时间锁定 (Time Lock) | 审查中 | 3 / 2 / 0 / 1 / 2 | 5 | [审查记录](../references/dota-wiki/acceptance/attack-trigger.json) |
| 时间漫游 (Time Walk) | 审查中 | 1 / 0 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 洪流 (Torrent) | 审查中 | 5 / 2 / 1 / 1 / 1 | 5 | [审查记录](../references/dota-wiki/acceptance/motion-release.json) |
| 投掷 (Toss) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 踏 (Trample) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 绝杀秘技 (Tricks of the Trade) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 怒拳破 (Unleash) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 咤 (Uproar) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 真空 (Vacuum) | 审查中 | 2 / 4 / 1 / 1 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/control-target.json) |
| 吸血灵魂 (Vampiric Spirit) | 审查中 | 2 / 3 / 1 / 3 / 1 | 5 | [审查记录](../references/dota-wiki/acceptance/summon-lineage.json) |
| 复仇光环 (Vengeance Aura) | 审查中 | 4 / 0 / 1 / 4 / 3 | 3 | [审查记录](../references/dota-wiki/acceptance/aura-armor.json) |
| 瘴气 (Venomous Gale) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 粘稠鼻液 (Viscous Nasal Goo) | 审查中 | 3 / 1 / 0 / 0 / 5 | 3 | [审查记录](../references/dota-wiki/acceptance/aura-armor.json) |
| 海象神拳！ (Walrus PUNCH!) | 审查中 | 1 / 1 / 1 / 1 / 2 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 战吼 (Warcry) | 审查中 | 1 / 4 / 1 / 2 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/aura-armor.json) |
| 战意 (Warpath) | 审查中 | 3 / 2 / 1 / 2 / 2 | 3 | [审查记录](../references/dota-wiki/acceptance/aura-armor.json) |
| 恐怖波动 (Wave of Terror) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 波浪形态 (Waveform) | 审查中 | 5 / 1 / 1 / 1 / 4 | 2 | [审查记录](../references/dota-wiki/acceptance/motion-release.json) |
| 野性之斧 (Wild Axes) | 审查中 | 3 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/motion-release.json) |
| 风行 (Windrun) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |

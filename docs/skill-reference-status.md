# 技能原作逐项验收

目录 230 项；已开始 65 项；完整逐项通过 7 项。
当前代码下，519 条具名结果测试要求通过，519 条同时具备逐条来源绑定；另有11项跨技能引擎要求未闭合。测试证据与当前代码一致。

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
| 回光返照 (Borrowed Time) | 审查中 | 1 / 0 / 0 / 0 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 棒击大地 (Boundless Strike) | 审查中 | 1 / 1 / 1 / 1 / 3 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 蚀脑 (Brain Sap) | 审查中 | 1 / 1 / 1 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/bash-battery-buffs.json) |
| 炽烈火雨 (Burning Barrage) | 审查中 | 0 / 1 / 1 / 1 / 7 | 1 | [审查记录](../references/dota-wiki/acceptance/mobility-fields.json) |
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
| 折射 (Dispersion) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 过肩摔 (Dispose) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 崩裂禁锢 (Disruption) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 异化 (Dissimilate) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 末日 (Doom) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 双刃剑 (Double Edge) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 龙族血统 (Dragon Blood) | 审查中 | 1 / 1 / 1 / 1 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 龙破斩 (Dragon Slave) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 决斗 (Duel) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 裂地沟壑 (Earth Splitter) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 震撼大地 (Earthshock) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 古龙形态 (Elder Dragon Form) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 授予力量 (Empower) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 强化图腾 (Enchant Totem) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 地震 (Epicenter) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 精华变迁 (Essence Flux) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 能量转移 (Essence Shift) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 风暴之眼 (Eye of the Storm) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 弱化能流 (Fade Bolt) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 虚妄之诺 (False Promise) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 盛宴 (Feast) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 野性驱使 (Feral Impulse) | 审查中 | 1 / 1 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 热血战魂 (Fervor) | 审查中 | 2 / 1 / 1 / 1 / 0 | 5 | [审查记录](../references/dota-wiki/acceptance/auras-and-growth.json) |
| 魔爪 (Fiend's Grip) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 炽魂 (Fiery Soul) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 死亡之指 (Finger of Death) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 龙炎饼干 (Firesnap Cookie) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 沟壑 (Fissure) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 高射火炮 (Flak Cannon) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 烈火罩 (Flame Guard) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 血肉傀儡 (Flesh Golem) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 腐肉堆积 (Flesh Heap) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 集中火力 (Focus Fire) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 气运之末 (Fortune's End) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 极寒领域 (Freezing Field) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 霜冻之箭 (Frost Arrows) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 冰霜魔盾 (Frost Shield) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 冰封禁制 (Frostbite) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 怒意狂击 (Fury Swipes) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| G 胖力量 (Gaben's Strength) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 幽灵船 (Ghostship) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 智慧之刃 (Glaives of Wisdom) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 全领域静默 (Global Silence) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 神之谴戒 (God's Rebuke) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 黄泉颤抖 (Grave Chill) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 长大 (Grow) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 守护天使 (Guardian Angel) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 狂风 (Gust) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| G 胖之手:  (Hand of Gaben) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 天国恩赐 (Heavenly Grace) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 妖术 (Hex) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 凤凰冲击 (Icarus Dive) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 冰晶爆轰 (Ice Blast) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 冰封路径 (Ice Path) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 冰晶 (Ice Shards) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 推进 (Impetus) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 阎刃 (Infernal Blade) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 墨涌 (Ink Swell) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 野性之心 (Inner Beast) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 心炎 (Inner Fire) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 极度饥渴 (Insatiable Hunger) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 如意棒法 (Jingu Mastery) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 海妖外壳 (Kraken Shell) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 激光 (Laser) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 寄生种子 (Leech Seed) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 牺牲 (Life Break) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 生命汲取 (Life Drain) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 雷击 (Lightning Bolt) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 霹雳铁手 (Lil' Shredder) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 活体护甲 (Living Armor) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 月光 (Lucent Beam) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 熠熠生辉 (Luminosity) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 月之祝福 (Lunar Blessing) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 魔法箭 (Magic Missile) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 磁场 (Magnetic Field) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 法力损毁 (Mana Break) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 法力吸取 (Mana Drain) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 魔法护盾 (Mana Shield) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 肉钩 (Meat Hook) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 镜像 (Mirror Image) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 迷雾缠绕 (Mist Coil) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 勇气之霎 (Moment of Courage) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 月刃 (Moon Glaives) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 蜥蜴绝吻 (Mortimer Kisses) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 数箭齐发 (Multishot) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 神秘之耀 (Mystic Flare) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 自然之助 (Nature's Attendants) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 自然的呼唤 (Nature's Call) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 移形换位 (Nether Swap) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 幽冥剧毒 (Nethertoxin) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 无敌斩 (Omnislash) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 过载 (Overcharge) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 疯狂生长 (Overgrowth) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 超负荷 (Overload) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 超强力量 (Overpower) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 麻痹药剂 (Paralyzing Cask) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 魅影之袭 (Phantasm) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 幻影突袭 (Phantom Strike) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 相位转移 (Phase Shift) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 越界 (Pierce the Veil) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 瘟疫守卫 (Plague Ward) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 等离子场 (Plasma Field) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 毒性攻击 (Poison Attack) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 强攻 (Press The Attack) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 原始咆哮 (Primal Roar) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 脉冲新星 (Pulse Nova) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 捶 (Pulverize) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 洗礼 (Purification) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 刺针扫射 (Quill Spray) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 狂暴 (Rage) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 毁灭 (Ravage) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 活性护甲 (Reactive Armor) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 实相裂隙 (Reality Rift) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 死神镰刀 (Reaper's Scythe) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 回身踢 (Rebound) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 折光 (Refraction) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 共鸣脉冲 (Resonant Pulse) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 巨石翻滚 (Rolling Boulder) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 滚雷 (Rolling Thunder) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 腐烂 (Rot) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 月神之箭 (Sacred Arrow) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 灼热之箭 (Searing Arrows) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 暗影之舞 (Shadow Dance) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 暗影之境 (Shadow Realm) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 暗影波 (Shadow Wave) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 变身 (Shapeshift) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 一箭穿心 (Sharpshooter) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 震荡波 (Shockwave) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 健体术 (Sidekick) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 无影拳 (Sleight of Fist) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 雪球 (Snowball) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 噬魂 (Soul Rip) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 缚魂 (Soulbind) | 审查中 | 0 / 0 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 战神迅矛 (Spear of Mars) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 技能窃取 (Spell Steal) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 尖刺外壳 (Spiked Carapace) | 审查中 | 1 / 0 / 0 / 1 / 1 | 2 | [审查记录](../references/dota-wiki/acceptance/defense-and-dispel.json) |
| 灵魂之矛 (Spirit Lance) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 幽魂链接 (Spirit Link) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 吸魂巫术 (Spirit Siphon) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 撕裂大地 (Split Earth) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 奔袭冲撞 (Stampede) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 星破天惊 (Starbreaker) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 静电场 (Static Field) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 静电连接 (Static Link) | 审查中 | 2 / 1 / 1 / 1 / 1 | 3 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 粘性燃油 (Sticky Napalm) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 石化凝视 (Stone Gaze) | 审查中 | 1 / 1 / 1 / 1 / 0 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 召唤佣兽 (Summon Familiars) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 熊灵伙伴 (Summon Spirit Bear) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 召狼 (Summon Wolves) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 烈日炙烤 (Sun Ray) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 魂断 (Sunder) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 虚张声势 (Swashbuckle) | 审查中 | 1 / 1 / 1 / 1 / 1 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 摔角行家 (Tag Team) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 瞄准 (Take Aim) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 羁绊 (Tether) | 审查中 | 1 / 2 / 1 / 2 / 2 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 潮汐使者 (Tidebringer) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 时间锁定 (Time Lock) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 时间漫游 (Time Walk) | 审查中 | 1 / 0 / 1 / 1 / 1 | 4 | [审查记录](../references/dota-wiki/acceptance/links-and-gaze.json) |
| 洪流 (Torrent) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 投掷 (Toss) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 踏 (Trample) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 绝杀秘技 (Tricks of the Trade) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 怒拳破 (Unleash) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 咤 (Uproar) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 真空 (Vacuum) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 吸血灵魂 (Vampiric Spirit) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 复仇光环 (Vengeance Aura) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 瘴气 (Venomous Gale) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 粘稠鼻液 (Viscous Nasal Goo) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 海象神拳！ (Walrus PUNCH!) | 审查中 | 1 / 1 / 1 / 1 / 1 | 6 | [审查记录](../references/dota-wiki/acceptance/instant-attacks.json) |
| 战吼 (Warcry) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 战意 (Warpath) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 恐怖波动 (Wave of Terror) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 波浪形态 (Waveform) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 野性之斧 (Wild Axes) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |
| 风行 (Windrun) | 未逐项审查 | 0 / 0 / 0 / 0 / 0 | 1 | 待取证 |

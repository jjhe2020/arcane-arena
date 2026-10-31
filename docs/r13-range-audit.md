# r13 全量技能范围核对

范围：230个主技能五档、109个可执行授予技能原生档；18个参考技能单列。完整机器可读记录见 `artifacts/r13-range-audit.json`。当前Valve官方127位英雄/734技能数据另存 `references/dota-wiki/r13-current-valve-range-snapshot.json`，每响应记录取得时间与SHA256；官方未给补丁号，因此不猜补丁号。

采用AA历史基准，保留Super/Gaben明确改动；当前Dota在各档currentDotaComparison单列数值与差异，不直接覆盖历史技能；AA升级没有同名原生等级时明确标注，天赋/神杖/魔晶/命石上下文保留。100 Dota单位=1世界单位，地图比例保持原值。

每档记录最终注册程序的真实文件/行、几何调用表达式与回调指纹、配置距离参数与语义、AA/历史Valve数值、来源与未决条款、实际4秒引擎探测的施法/命中/区域/渲染证据。数值相同、执行稳定和实际出现不等同于边界保真通过；没有发生的效果如实记零。

等离子场采用700（基础）/1100（AA Super、Gaben）的扩展距离。现有伤害环内缘=105起始偏移+当前扩展距离，外缘=内缘+100环宽；因此基础最远外缘为905，升级最远外缘为1305，单位均为Dota单位。本项目共享40单位受击体积另外参与碰撞，不能把700/1100称为实际总命中半径。
几何来源是[2023-02-15 Razor历史Wiki快照](https://web.archive.org/web/20230215191830id_/https://dota2.fandom.com/wiki/Razor)：其标题明确使用Max Extension Radius，并说明105起始偏移、扩展700后到805、再计100宽度可到905。已有原始HTML的SHA256已再次核对为44acfa7f20e152ab28ad737af84843096a7c4253aebc00ec717d1cb90b813519，与references/dota-wiki/plasma-pulse-source-snapshot.json一致。历史636速度下往返700约为2.201秒，与当前Valve官方数据中的2.2秒相容；这项算式只是相容性推断，当前官方radius=700字段本身没有说明完整环边界。
该历史资料同时说明原作图像落后伤害环105。本版按用户要求，将主要5–95% alpha带对齐当前实际伤害环的内外边界；保留装饰光晕，光晕不参与判定。这是本项目的显示改进，并不宣称复制原作图像偏移。区域贴图也不再用固定素材worldSize覆盖实时半径。
仍保留PF-P01等未决项：原版hull与环宽的精确碰撞约定、跨越环/中心的瞬移边界、原AA Lua及其准确版本均未闭合；AA增加400与此历史几何的组合仍是注明来源的工作解释。当前Valve数据仅作另列对照，不能据此声称本项目最远905/1305边缘及额外40受击体积已经原版实测认证。

|技能|域|档数|有施法档数|距离参数项|历史来源|当前Valve映射|范围未决项|
|---|---|---:|---:|---:|---|---|---:|
|酸性喷雾 (custom_alchemist_acid_spray)|aa|5|4|5|固定Valve KV|alchemist_acid_spray|0|
|爆栗出击 (hoodwink_acorn_shot)|aa|5|5|10|固定Valve KV|hoodwink_acorn_shot|1|
|锚击 (tidehunter_anchor_smash)|aa|5|5|5|固定Valve KV|tidehunter_anchor_smash|0|
|上古封印 (custom_skywrath_mage_ancient_seal)|aa|5|5|5|固定Valve KV|skywrath_mage_ancient_seal|0|
|无光之盾 (custom_abaddon_aphotic_shield)|aa|5|5|5|固定Valve KV|abaddon_aphotic_shield|0|
|弧形闪电 (custom_zuus_arc_lightning)|aa|5|5|5|固定Valve KV|zuus_arc_lightning|0|
|奥术光环 (crystal_maiden_brilliance_aura)|aa|5|0|0|固定Valve KV|crystal_maiden_brilliance_aura|0|
|奥法鹰隼 (custom_skywrath_mage_arcane_bolt)|aa|5|5|0|固定Valve KV|skywrath_mage_arcane_bolt|0|
|严寒烧灼 (winter_wyvern_arctic_burn)|aa|5|5|10|固定Valve KV|winter_wyvern_arctic_burn|0|
|热血竞技场 (mars_arena_of_blood)|aa|5|5|20|固定Valve KV|mars_arena_of_blood|0|
|灵体游魂 (custom_elder_titan_ancestral_spirit)|aa|5|5|5|固定Valve KV|elder_titan_ancestral_spirit|0|
|太虚之径 (void_spirit_astral_step)|aa|5|5|15|固定Valve KV|void_spirit_astral_step|1|
|衰退光环 (custom_abyssal_underlord_atrophy_aura)|aa|5|0|5|固定Valve KV|abyssal_underlord_atrophy_aura|1|
|深海重击 (custom_slardar_bash_of_the_deep)|aa|5|0|0|固定Valve KV|slardar_bash|0|
|弹幕冲击 (custom_clockwerk_battery_assault)|aa|5|5|5|固定Valve KV|rattletrap_battery_assault|0|
|战斗专注 (troll_warlord_battle_trance)|aa|5|5|5|固定Valve KV|troll_warlord_battle_trance|0|
|狂战士之血 (huskar_berserkers_blood)|aa|5|0|0|固定Valve KV|huskar_berserkers_blood|0|
|狂战士之怒 (custom_troll_warlord_berserkers_rage)|aa|5|5|10|固定Valve KV|troll_warlord_berserkers_rage|1|
|黑洞 (enigma_black_hole)|aa|5|5|5|固定Valve KV|enigma_black_hole|1|
|剑刃风暴 (custom_juggernaut_blade_fury)|aa|5|2|10|固定Valve KV|juggernaut_blade_fury|0|
|爆破起飞！ (techies_suicide)|aa|5|5|5|固定Valve KV|techies_suicide|0|
|闪烁 (custom_queenofpain_blink)|aa|5|5|5|固定Valve KV|queenofpain_blink|1|
|嗜血术 (ogre_magi_bloodlust)|aa|5|5|0|固定Valve KV|ogre_magi_bloodlust|0|
|血怒 (bloodseeker_bloodrage)|aa|5|5|5|固定Valve KV|bloodseeker_bloodrage|0|
|回光返照 (abaddon_borrowed_time)|aa|5|0|10|固定Valve KV|abaddon_borrowed_time|0|
|棒击大地 (custom_monkey_king_boundless_strike)|aa|5|5|10|固定Valve KV|monkey_king_boundless_strike|3|
|蚀脑 (custom_bane_brain_sap)|aa|5|5|5|固定Valve KV|bane_brain_sap|0|
|炽烈火雨 (clinkz_strafe)|aa|5|5|10|固定Valve KV|clinkz_strafe|0|
|沸血之矛 (custom_huskar_burning_spear)|aa|5|0|5|固定Valve KV|huskar_burning_spear|0|
|掘地穿刺 (sandking_burrowstrike)|aa|5|5|10|固定Valve KV|sandking_burrowstrike|0|
|野性呼唤 (custom_beastmaster_call_of_the_wild)|aa|5|5|15|固定Valve KV|未匹配，明确缺失|0|
|连环霜冻 (custom_lich_chain_frost)|aa|5|5|10|固定Valve KV|lich_chain_frost|0|
|查克拉魔法 (keeper_of_the_light_chakra_magic)|aa|5|1|0|固定Valve KV|keeper_of_the_light_chakra_magic|1|
|锯齿飞轮 (custom_shredder_chakram)|aa|5|5|15|固定Valve KV|shredder_chakram|1|
|混沌一击 (custom_chaos_knight_chaos_strike)|aa|5|0|5|固定Valve KV|chaos_knight_chaos_strike|1|
|混乱献祭 (custom_warlock_chaotic_offering)|aa|5|5|20|固定Valve KV|warlock_rain_of_chaos|0|
|暗影冲刺 (custom_spirit_breaker_charge_of_darkness)|aa|5|5|15|固定Valve KV|spirit_breaker_charge_of_darkness|1|
|化学狂暴 (alchemist_chemical_rage)|aa|5|5|0|固定Valve KV|alchemist_chemical_rage|0|
|时间结界 (custom_faceless_void_chronosphere)|aa|5|5|5|固定Valve KV|faceless_void_chronosphere|0|
|极寒之拥 (custom_winter_wyvern_cold_embrace)|aa|5|5|5|固定Valve KV|winter_wyvern_cold_embrace|0|
|侵蚀雾霭 (custom_slardar_amplify_damage)|aa|5|5|15|固定Valve KV|slardar_amplify_damage|0|
|腐蚀皮肤 (viper_corrosive_skin)|aa|5|0|10|固定Valve KV|viper_corrosive_skin|0|
|反击螺旋 (custom_axe_counter_helix)|aa|5|0|5|固定Valve KV|axe_counter_helix|0|
|恩赐解脱 (custom_phantom_assassin_coup_de_grace)|aa|5|0|0|固定Valve KV|phantom_assassin_coup_de_grace|0|
|伤残恐惧 (night_stalker_crippling_fear)|aa|5|5|10|固定Valve KV|night_stalker_crippling_fear|0|
|淘汰之刃 (custom_axe_culling_blade)|aa|5|0|5|固定Valve KV|axe_culling_blade|0|
|魔霭诅咒 (custom_abaddon_curse_of_avernus)|aa|5|0|0|固定Valve KV|abaddon_frostmourne|0|
|诅咒王冠 (custom_dark_willow_cursed_crown)|aa|5|5|25|固定Valve KV|dark_willow_cursed_crown|0|
|黑暗契约 (custom_slark_dark_pact)|aa|5|5|5|固定Valve KV|slark_dark_pact|0|
|死亡脉冲 (custom_necrolyte_death_pulse)|aa|5|5|5|固定Valve KV|necrolyte_death_pulse|1|
|死亡守卫 (custom_witch_doctor_death_ward)|aa|5|5|10|固定Valve KV|witch_doctor_death_ward|0|
|腐朽 (custom_undying_decay)|aa|5|5|5|固定Valve KV|undying_decay|0|
|邪恶净愈 (custom_shadow_demon_demonic_cleanse)|aa|5|5|0|固定Valve KV|shadow_demon_demonic_cleanse|0|
|邪恶净化 (custom_shadow_demon_demonic_purge)|aa|5|5|0|固定Valve KV|shadow_demon_demonic_purge|0|
|折射 (custom_spectre_dispersion)|aa|5|0|10|固定Valve KV|spectre_dispersion|0|
|过肩摔 (marci_grapple)|aa|5|2|10|固定Valve KV|marci_grapple|1|
|崩裂禁锢 (custom_shadow_demon_disruption)|aa|5|5|0|固定Valve KV|shadow_demon_disruption|0|
|异化 (custom_void_spirit_dissimilate)|aa|5|5|15|固定Valve KV|void_spirit_dissimilate|2|
|末日 (custom_doom_bringer_doom)|aa|5|5|5|固定Valve KV|doom_bringer_doom|0|
|双刃剑 (centaur_double_edge)|aa|5|5|5|固定Valve KV|centaur_double_edge|1|
|龙族血统 (custom_dragon_knight_dragon_blood)|aa|5|0|0|固定Valve KV|dragon_knight_dragon_blood|1|
|龙破斩 (custom_lina_dragon_slave)|aa|5|5|15|固定Valve KV|lina_dragon_slave|0|
|决斗 (custom_legion_commander_duel)|aa|5|5|5|固定Valve KV|legion_commander_duel|0|
|裂地沟壑 (elder_titan_earth_splitter)|aa|5|5|5|固定Valve KV|elder_titan_earth_splitter|1|
|震撼大地 (custom_ursa_earthshock)|aa|5|5|15|固定Valve KV|ursa_earthshock|0|
|古龙形态 (dragon_knight_elder_dragon_form)|aa|5|5|10|固定Valve KV|dragon_knight_elder_dragon_form|0|
|授予力量 (custom_magnataur_empower)|aa|5|4|15|固定Valve KV|magnataur_empower|1|
|强化图腾 (custom_earthshaker_enchant_totem)|aa|5|5|5|固定Valve KV|earthshaker_enchant_totem|1|
|地震 (custom_sandking_epicenter)|aa|5|5|20|固定Valve KV|sandking_epicenter|1|
|精华变迁 (custom_obsidian_destroyer_equilibrium)|aa|5|0|10|固定Valve KV|obsidian_destroyer_equilibrium|0|
|能量转移 (custom_slark_essence_shift)|aa|5|0|0|固定Valve KV|slark_essence_shift|0|
|风暴之眼 (custom_razor_eye_of_the_storm)|aa|5|5|5|固定Valve KV|razor_eye_of_the_storm|0|
|弱化能流 (rubick_fade_bolt)|aa|5|5|5|固定Valve KV|rubick_fade_bolt|1|
|虚妄之诺 (oracle_false_promise)|aa|5|5|5|固定Valve KV|oracle_false_promise|0|
|盛宴 (life_stealer_feast)|aa|5|0|0|固定Valve KV|life_stealer_feast|0|
|野性驱使 (custom_lycan_feral_impulse)|aa|5|0|5|固定Valve KV|lycan_feral_impulse|0|
|热血战魂 (troll_warlord_fervor)|aa|5|0|0|固定Valve KV|troll_warlord_fervor|0|
|魔爪 (custom_bane_fiends_grip)|aa|5|5|5|固定Valve KV|bane_fiends_grip|0|
|炽魂 (custom_lina_fiery_soul)|aa|5|0|0|固定Valve KV|lina_fiery_soul|0|
|死亡之指 (custom_lion_finger_of_death)|aa|5|5|5|固定Valve KV|lion_finger_of_death|0|
|龙炎饼干 (custom_snapfire_firesnap_cookie)|aa|5|5|15|固定Valve KV|snapfire_firesnap_cookie|0|
|沟壑 (custom_earthshaker_fissure)|aa|5|5|35|固定Valve KV|earthshaker_fissure|2|
|高射火炮 (gyrocopter_flak_cannon)|aa|5|5|15|固定Valve KV|gyrocopter_flak_cannon|0|
|烈火罩 (custom_ember_spirit_flame_guard)|aa|5|5|10|固定Valve KV|ember_spirit_flame_guard|0|
|血肉傀儡 (undying_flesh_golem)|aa|5|5|5|固定Valve KV|undying_flesh_golem|0|
|腐肉堆积 (custom_pudge_flesh_heap)|aa|5|5|5|固定Valve KV|pudge_flesh_heap|0|
|集中火力 (custom_windrunner_focusfire)|aa|5|5|5|固定Valve KV|windrunner_focusfire|0|
|气运之末 (custom_oracle_fortunes_end)|aa|5|5|5|固定Valve KV|oracle_fortunes_end|1|
|极寒领域 (custom_crystal_maiden_freezing_field)|aa|5|5|20|固定Valve KV|crystal_maiden_freezing_field|2|
|霜冻之箭 (custom_drow_ranger_frost_arrows)|aa|5|0|10|固定Valve KV|drow_ranger_frost_arrows|0|
|冰霜魔盾 (lich_frost_shield)|aa|5|5|5|固定Valve KV|lich_frost_shield|1|
|冰封禁制 (crystal_maiden_frostbite)|aa|5|5|5|固定Valve KV|crystal_maiden_frostbite|0|
|怒意狂击 (ursa_fury_swipes)|aa|5|0|0|固定Valve KV|ursa_fury_swipes|0|
|G 胖力量 (custom_sven_gods_strength)|aa|5|5|0|固定Valve KV|sven_gods_strength|0|
|幽灵船 (kunkka_ghostship)|aa|5|5|10|固定Valve KV|kunkka_ghostship|1|
|智慧之刃 (custom_silencer_glaives_of_wisdom)|aa|5|0|10|固定Valve KV|silencer_glaives_of_wisdom|2|
|全领域静默 (custom_silencer_global_silence)|aa|5|5|0|固定Valve KV|silencer_global_silence|0|
|神之谴戒 (mars_gods_rebuke)|aa|5|5|10|固定Valve KV|mars_gods_rebuke|0|
|黄泉颤抖 (custom_visage_grave_chill)|aa|5|5|10|固定Valve KV|visage_grave_chill|0|
|长大 (tiny_grow)|aa|5|0|0|固定Valve KV|tiny_grow|0|
|守护天使 (custom_omniknight_guardian_angel)|aa|5|5|5|固定Valve KV|omniknight_guardian_angel|0|
|狂风 (custom_drow_ranger_wave_of_silence)|aa|5|5|10|固定Valve KV|drow_ranger_wave_of_silence|0|
|G 胖之手:  (chen_hand_of_god)|aa|5|5|0|固定Valve KV|chen_hand_of_god|0|
|天国恩赐 (custom_omniknight_repel)|aa|5|5|0|固定Valve KV|未匹配，明确缺失|0|
|妖术 (custom_shadow_shaman_voodoo)|aa|5|5|5|固定Valve KV|shadow_shaman_voodoo|1|
|凤凰冲击 (phoenix_icarus_dive)|aa|5|5|15|固定Valve KV|phoenix_icarus_dive|2|
|冰晶爆轰 (custom_ancient_apparition_ice_blast)|aa|5|5|15|固定Valve KV|ancient_apparition_ice_blast|0|
|冰封路径 (jakiro_ice_path)|aa|5|5|10|固定Valve KV|jakiro_ice_path|0|
|冰晶 (custom_tusk_ice_shards)|aa|5|5|30|固定Valve KV|tusk_ice_shards|0|
|推进 (enchantress_impetus)|aa|5|0|5|固定Valve KV|enchantress_impetus|0|
|阎刃 (doom_bringer_infernal_blade)|aa|5|5|5|固定Valve KV|doom_bringer_infernal_blade|0|
|墨涌 (custom_grimstroke_ink_swell)|aa|5|5|5|固定Valve KV|grimstroke_spirit_walk|0|
|野性之心 (custom_beastmaster_inner_beast)|aa|5|0|15|固定Valve KV|beastmaster_inner_beast|0|
|心炎 (custom_huskar_inner_fire)|aa|5|5|10|固定Valve KV|huskar_inner_fire|0|
|极度饥渴 (broodmother_insatiable_hunger)|aa|5|5|0|固定Valve KV|broodmother_insatiable_hunger|0|
|如意棒法 (custom_monkey_king_jingu_mastery)|aa|5|0|15|固定Valve KV|monkey_king_jingu_mastery|1|
|海妖外壳 (tidehunter_kraken_shell)|aa|5|0|0|固定Valve KV|tidehunter_kraken_shell|0|
|激光 (custom_tinker_laser)|aa|5|5|10|固定Valve KV|tinker_laser|0|
|寄生种子 (custom_treant_leech_seed)|aa|5|5|10|固定Valve KV|treant_leech_seed|1|
|牺牲 (custom_huskar_life_break)|aa|5|5|5|固定Valve KV|huskar_life_break|0|
|生命汲取 (custom_pugna_life_drain)|aa|5|5|5|固定Valve KV|pugna_life_drain|1|
|雷击 (zuus_lightning_bolt)|aa|5|5|10|固定Valve KV|zuus_lightning_bolt|0|
|霹雳铁手 (custom_snapfire_lil_shredder)|aa|5|5|5|固定Valve KV|snapfire_lil_shredder|3|
|活体护甲 (treant_living_armor)|aa|5|5|5|固定Valve KV|treant_living_armor|0|
|月光 (custom_luna_lucent_beam)|aa|5|5|10|固定Valve KV|luna_lucent_beam|0|
|熠熠生辉 (custom_dawnbreaker_luminosity)|aa|5|0|5|固定Valve KV|dawnbreaker_luminosity|1|
|月之祝福 (luna_lunar_blessing)|aa|5|0|5|固定Valve KV|luna_lunar_blessing|0|
|魔法箭 (custom_vengefulspirit_magic_missile)|aa|5|5|0|固定Valve KV|vengefulspirit_magic_missile|0|
|磁场 (arc_warden_magnetic_field)|aa|5|5|10|固定Valve KV|arc_warden_magnetic_field|0|
|法力损毁 (antimage_mana_break)|aa|5|0|0|固定Valve KV|antimage_mana_break|0|
|法力吸取 (custom_lion_mana_drain)|aa|5|5|15|固定Valve KV|lion_mana_drain|0|
|魔法护盾 (custom_medusa_mana_shield)|aa|5|0|0|固定Valve KV|medusa_mana_shield|0|
|肉钩 (custom_pudge_meat_hook)|aa|5|5|5|固定Valve KV|pudge_meat_hook|0|
|镜像 (custom_naga_siren_mirror_image)|aa|5|5|5|固定Valve KV|naga_siren_mirror_image|0|
|迷雾缠绕 (custom_abaddon_death_coil)|aa|5|5|5|固定Valve KV|abaddon_death_coil|1|
|勇气之霎 (legion_commander_moment_of_courage)|aa|5|0|0|固定Valve KV|legion_commander_moment_of_courage|0|
|月刃 (custom_luna_moon_glaive)|aa|5|0|5|固定Valve KV|luna_moon_glaive|0|
|蜥蜴绝吻 (custom_snapfire_mortimer_kisses)|aa|5|5|10|固定Valve KV|snapfire_mortimer_kisses|0|
|数箭齐发 (custom_drow_ranger_multishot)|aa|5|5|10|固定Valve KV|drow_ranger_multishot|2|
|神秘之耀 (custom_skywrath_mage_mystic_flare)|aa|5|5|10|固定Valve KV|skywrath_mage_mystic_flare|1|
|自然之助 (custom_enchantress_natures_attendants)|aa|5|5|10|固定Valve KV|enchantress_natures_attendants|2|
|自然的呼唤 (custom_furion_force_of_nature)|aa|5|5|0|固定Valve KV|furion_force_of_nature|1|
|移形换位 (vengefulspirit_nether_swap)|aa|5|5|5|固定Valve KV|vengefulspirit_nether_swap|0|
|幽冥剧毒 (viper_nethertoxin)|aa|5|5|5|固定Valve KV|viper_nethertoxin|0|
|无敌斩 (juggernaut_omni_slash)|aa|5|5|10|固定Valve KV|juggernaut_omni_slash|2|
|过载 (wisp_overcharge)|aa|5|5|0|固定Valve KV|wisp_overcharge|0|
|疯狂生长 (treant_overgrowth)|aa|5|5|5|固定Valve KV|treant_overgrowth|0|
|超负荷 (custom_storm_spirit_overload)|aa|5|0|15|固定Valve KV|storm_spirit_overload|0|
|超强力量 (ursa_overpower)|aa|5|5|0|固定Valve KV|ursa_overpower|0|
|麻痹药剂 (witch_doctor_paralyzing_cask)|aa|5|5|5|固定Valve KV|witch_doctor_paralyzing_cask|0|
|魅影之袭 (custom_chaos_knight_phantasm)|aa|5|5|10|固定Valve KV|chaos_knight_phantasm|0|
|幻影突袭 (phantom_assassin_phantom_strike)|aa|5|5|10|固定Valve KV|phantom_assassin_phantom_strike|2|
|相位转移 (puck_phase_shift)|aa|5|5|10|固定Valve KV|puck_phase_shift|0|
|越界 (muerta_pierce_the_veil)|aa|5|5|15|无匹配，见参数来源|muerta_pierce_the_veil|1|
|瘟疫守卫 (custom_venomancer_plague_ward)|aa|5|5|5|固定Valve KV|venomancer_plague_ward|1|
|等离子场 (razor_plasma_field)|aa|5|5|15|固定Valve KV|razor_plasma_field|2|
|毒性攻击 (custom_viper_poison_attack)|aa|5|0|5|固定Valve KV|viper_poison_attack|1|
|强攻 (legion_commander_press_the_attack)|aa|5|5|5|固定Valve KV|legion_commander_press_the_attack|0|
|原始咆哮 (beastmaster_primal_roar)|aa|5|5|15|固定Valve KV|beastmaster_primal_roar|2|
|脉冲新星 (leshrac_pulse_nova)|aa|5|5|5|固定Valve KV|leshrac_pulse_nova|0|
|捶 (primal_beast_pulverize)|aa|5|0|25|固定Valve KV|primal_beast_pulverize|0|
|洗礼 (omniknight_purification)|aa|5|5|5|固定Valve KV|omniknight_purification|0|
|刺针扫射 (custom_bristleback_quill_spray)|aa|5|5|5|固定Valve KV|bristleback_quill_spray|0|
|狂暴 (custom_life_stealer_rage)|aa|5|5|5|固定Valve KV|life_stealer_rage|0|
|毁灭 (custom_tidehunter_ravage)|aa|5|5|10|固定Valve KV|tidehunter_ravage|0|
|活性护甲 (shredder_reactive_armor)|aa|5|0|0|固定Valve KV|shredder_reactive_armor|0|
|实相裂隙 (custom_chaos_knight_reality_rift)|aa|5|5|15|固定Valve KV|chaos_knight_reality_rift|1|
|死神镰刀 (custom_necrolyte_reapers_scythe)|aa|5|5|5|固定Valve KV|necrolyte_reapers_scythe|1|
|回身踢 (marci_companion_run)|aa|5|5|25|固定Valve KV|marci_companion_run|1|
|折光 (templar_assassin_refraction)|aa|5|5|0|固定Valve KV|templar_assassin_refraction|0|
|共鸣脉冲 (void_spirit_resonant_pulse)|aa|5|5|5|固定Valve KV|void_spirit_resonant_pulse|0|
|巨石翻滚 (earth_spirit_rolling_boulder)|aa|5|5|20|固定Valve KV|earth_spirit_rolling_boulder|1|
|滚雷 (custom_pangolier_rolling_thunder)|aa|5|5|10|固定Valve KV|pangolier_gyroshell|0|
|腐烂 (pudge_rot)|aa|5|2|5|固定Valve KV|pudge_rot|0|
|月神之箭 (custom_mirana_arrow)|aa|5|5|20|固定Valve KV|mirana_arrow|2|
|灼热之箭 (clinkz_searing_arrows)|aa|5|0|0|固定Valve KV|clinkz_searing_arrows|0|
|暗影之舞 (slark_shadow_dance)|aa|5|5|0|固定Valve KV|slark_shadow_dance|1|
|暗影之境 (custom_dark_willow_shadow_realm)|aa|5|5|5|固定Valve KV|dark_willow_shadow_realm|0|
|暗影波 (dazzle_shadow_wave)|aa|5|5|10|固定Valve KV|dazzle_shadow_wave|0|
|变身 (lycan_shapeshift)|aa|5|5|20|固定Valve KV|lycan_shapeshift|1|
|一箭穿心 (custom_hoodwink_sharpshooter)|aa|5|5|10|固定Valve KV|hoodwink_sharpshooter|1|
|震荡波 (custom_magnataur_shockwave)|aa|5|5|15|固定Valve KV|magnataur_shockwave|0|
|健体术 (marci_guardian)|aa|5|5|0|固定Valve KV|未匹配，明确缺失|0|
|无影拳 (ember_spirit_sleight_of_fist)|aa|5|5|10|固定Valve KV|ember_spirit_sleight_of_fist|0|
|雪球 (custom_tusk_snowball)|aa|5|5|15|固定Valve KV|tusk_snowball|1|
|噬魂 (custom_undying_soul_rip)|aa|5|5|10|固定Valve KV|undying_soul_rip|0|
|缚魂 (custom_grimstroke_soul_bind)|aa|5|5|10|固定Valve KV|grimstroke_soul_chain|0|
|战神迅矛 (custom_mars_spear_of_mars)|aa|5|5|20|固定Valve KV|mars_spear|0|
|技能窃取 (custom_rubick_spell_steal)|aa|5|0|0|固定Valve KV|rubick_spell_steal|0|
|尖刺外壳 (nyx_assassin_spiked_carapace)|aa|5|5|0|固定Valve KV|nyx_assassin_spiked_carapace|0|
|灵魂之矛 (custom_phantom_lancer_spirit_lance)|aa|5|5|10|固定Valve KV|phantom_lancer_spirit_lance|1|
|幽魂链接 (custom_lone_druid_spirit_link)|aa|5|0|0|固定Valve KV|lone_druid_spirit_link|0|
|吸魂巫术 (death_prophet_spirit_siphon)|aa|5|5|5|固定Valve KV|death_prophet_spirit_siphon|1|
|撕裂大地 (custom_leshrac_split_earth)|aa|5|5|10|固定Valve KV|leshrac_split_earth|0|
|奔袭冲撞 (centaur_stampede)|aa|5|5|5|固定Valve KV|centaur_stampede|1|
|星破天惊 (dawnbreaker_fire_wreath)|aa|5|5|10|固定Valve KV|dawnbreaker_fire_wreath|1|
|静电场 (custom_zuus_static_field)|aa|5|0|0|固定Valve KV|zuus_static_field|0|
|静电连接 (custom_razor_static_link)|aa|5|5|5|固定Valve KV|razor_static_link|1|
|粘性燃油 (batrider_sticky_napalm)|aa|5|5|10|固定Valve KV|batrider_sticky_napalm|0|
|石化凝视 (medusa_stone_gaze)|aa|5|5|5|固定Valve KV|medusa_stone_gaze|0|
|召唤佣兽 (custom_visage_summon_familiars)|aa|5|5|10|固定Valve KV|visage_summon_familiars|0|
|熊灵伙伴 (custom_lone_druid_spirit_bear)|aa|5|5|5|固定Valve KV|lone_druid_spirit_bear|1|
|召狼 (custom_lycan_summon_wolves)|aa|5|5|10|固定Valve KV|lycan_summon_wolves|0|
|烈日炙烤 (custom_phoenix_sun_ray)|aa|5|5|10|固定Valve KV|phoenix_sun_ray|0|
|魂断 (terrorblade_sunder)|aa|5|0|0|固定Valve KV|terrorblade_sunder|1|
|虚张声势 (pangolier_swashbuckle)|aa|5|5|15|固定Valve KV|pangolier_swashbuckle|0|
|摔角行家 (tusk_tag_team)|aa|5|5|5|固定Valve KV|tusk_tag_team|1|
|瞄准 (custom_sniper_take_aim)|aa|5|0|5|固定Valve KV|sniper_take_aim|1|
|羁绊 (wisp_tether)|aa|5|5|15|固定Valve KV|wisp_tether|1|
|潮汐使者 (kunkka_tidebringer)|aa|5|0|15|固定Valve KV|kunkka_tidebringer|1|
|时间锁定 (faceless_void_time_lock)|aa|5|0|5|固定Valve KV|faceless_void_time_lock|0|
|时间漫游 (faceless_void_time_walk)|aa|5|5|5|固定Valve KV|faceless_void_time_walk|0|
|洪流 (kunkka_torrent)|aa|5|5|5|固定Valve KV|kunkka_torrent|1|
|投掷 (custom_tiny_toss)|aa|5|5|10|固定Valve KV|tiny_toss|0|
|踏 (primal_beast_trample)|aa|5|5|15|固定Valve KV|primal_beast_trample|2|
|绝杀秘技 (custom_riki_tricks_of_the_trade)|aa|5|5|5|固定Valve KV|riki_tricks_of_the_trade|0|
|怒拳破 (marci_unleash)|aa|5|5|5|固定Valve KV|marci_unleash|1|
|咤 (primal_beast_uproar)|aa|5|5|15|固定Valve KV|primal_beast_uproar|1|
|真空 (dark_seer_vacuum)|aa|5|5|5|固定Valve KV|dark_seer_vacuum|0|
|吸血灵魂 (custom_skeleton_king_vampiric_aura)|aa|5|5|5|固定Valve KV|未匹配，明确缺失|0|
|复仇光环 (vengefulspirit_command_aura)|aa|5|0|10|固定Valve KV|vengefulspirit_command_aura|0|
|瘴气 (venomancer_venomous_gale)|aa|5|5|10|固定Valve KV|venomancer_venomous_gale|0|
|粘稠鼻液 (custom_bristleback_viscous_nasal_goo)|aa|5|5|0|固定Valve KV|bristleback_viscous_nasal_goo|0|
|海象神拳！ (custom_tusk_walrus_punch)|aa|5|5|0|固定Valve KV|tusk_walrus_punch|1|
|战吼 (custom_sven_warcry)|aa|5|5|10|固定Valve KV|sven_warcry|0|
|战意 (bristleback_warpath)|aa|5|0|0|固定Valve KV|bristleback_warpath|0|
|恐怖波动 (vengefulspirit_wave_of_terror)|aa|5|5|5|固定Valve KV|vengefulspirit_wave_of_terror|0|
|波浪形态 (morphling_waveform)|aa|5|5|5|固定Valve KV|morphling_waveform|2|
|野性之斧 (beastmaster_wild_axes)|aa|5|5|15|固定Valve KV|beastmaster_wild_axes|1|
|风行 (custom_windrunner_windrun)|aa|5|5|5|固定Valve KV|windrunner_windrun|0|
|死亡旋风 (shredder_whirling_death)|native|4|4|4|固定Valve KV|shredder_whirling_death|0|
|火焰气息 (dragon_knight_breathe_fire)|native|4|4|12|固定Valve KV|dragon_knight_breathe_fire|0|
|风暴之拳 (sven_storm_bolt)|native|4|4|8|固定Valve KV|sven_storm_bolt|0|
|割裂 (bloodseeker_rupture)|native|3|3|0|固定Valve KV|bloodseeker_rupture|0|
|秘术异蛇 (medusa_mystic_snake)|native|4|4|4|固定Valve KV|medusa_mystic_snake|0|
|肢解 (pudge_dismember)|native|3|0|3|固定Valve KV|pudge_dismember|0|
|冰霜漩涡 (ancient_apparition_ice_vortex)|native|4|4|4|固定Valve KV|ancient_apparition_ice_vortex|0|
|寒霜之足 (ancient_apparition_cold_feet)|native|4|4|4|固定Valve KV|ancient_apparition_cold_feet|0|
|烈焰焚身 (jakiro_macropyre)|native|3|3|9|固定Valve KV|jakiro_macropyre|0|
|烈火精灵灼烧 (aa_granted_fire_spirits_debuff)|native|4|4|0|固定Valve KV|phoenix_fire_spirits|0|
|烟幕 (riki_smoke_screen)|native|4|4|4|固定Valve KV|riki_smoke_screen|0|
|猎人回旋镖 (hoodwink_hunters_boomerang)|native|1|1|2|固定Valve KV|hoodwink_hunters_boomerang|0|
|巨力重击 (aa_granted_greater_bash)|native|4|4|4|固定Valve KV|spirit_breaker_greater_bash|0|
|陨星锤 (aa_granted_meteor_hammer)|native|1|1|1|无匹配，见参数来源|未匹配，明确缺失|0|
|炎阳纹章 (aa_granted_solar_crest)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|血棘 (aa_granted_bloodthorn)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|巫毒变身 (aa_granted_voodoo_switcheroo)|native|1|1|0|固定Valve KV|witch_doctor_voodoo_switcheroo|0|
|吞噬与喷吐 (aa_granted_gobble_up)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|抛掷式火焰喷射器 (aa_granted_throwable_flamethrower)|native|1|1|1|固定Valve KV|shredder_flamethrower|0|
|潮汐波 (aa_granted_tidal_wave)|native|1|1|3|固定Valve KV|kunkka_tidal_wave|0|
|火焰领域 (dragon_knight_fireball)|native|1|1|2|固定Valve KV|dragon_knight_fireball|0|
|旋风飞斧（近战） (troll_warlord_whirling_axes_melee)|native|1|0|4|固定Valve KV|troll_warlord_whirling_axes_melee|0|
|旋风飞斧（远程） (troll_warlord_whirling_axes_ranged)|native|1|0|2|固定Valve KV|troll_warlord_whirling_axes_ranged|0|
|深海护罩 (slark_depth_shroud)|native|1|1|1|固定Valve KV|slark_depth_shroud|0|
|真熊形态 (lone_druid_true_form)|native|3|3|3|固定Valve KV|lone_druid_true_form|0|
|跃动 (enchantress_bunny_hop)|native|1|1|2|固定Valve KV|enchantress_bunny_hop|0|
|邪能 (dazzle_bad_juju)|native|3|3|0|固定Valve KV|未匹配，明确缺失|0|
|邪恶净愈 (extra_granted_demonic_cleanse)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|邪恶净化 (extra_granted_demonic_purge)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|虚弱 (bane_enfeeble)|native|4|4|0|固定Valve KV|bane_enfeeble|0|
|致盲之光 (keeper_of_the_light_blinding_light)|native|4|4|8|固定Valve KV|keeper_of_the_light_blinding_light|0|
|诅咒 (witch_doctor_maledict)|native|4|4|0|固定Valve KV|witch_doctor_maledict|0|
|闪电风暴 (leshrac_lightning_storm)|native|4|4|4|固定Valve KV|leshrac_lightning_storm|0|
|纯洁之锤 (omniknight_hammer_of_purity)|native|4|4|0|固定Valve KV|omniknight_hammer_of_purity|0|
|狂暴战斧 (troll_warlord_rampage)|native|1|1|0|固定Valve KV|未匹配，明确缺失|0|
|幽鬼之刃 (spectre_spectral_dagger)|native|4|4|12|固定Valve KV|spectre_spectral_dagger|0|
|刀阵旋风 (phantom_assassin_fan_of_knives)|native|1|1|1|固定Valve KV|phantom_assassin_fan_of_knives|0|
|法力虚空 (antimage_mana_void)|native|3|3|3|固定Valve KV|antimage_mana_void|0|
|雷神之怒 (zuus_thundergods_wrath)|native|3|3|6|固定Valve KV|zuus_thundergods_wrath|0|
|暗杀 (sniper_assassinate)|native|3|3|0|固定Valve KV|sniper_assassinate|0|
|震荡手雷 (sniper_concussive_grenade)|native|1|1|2|固定Valve KV|sniper_concussive_grenade|0|
|暗影肖像 (grimstroke_dark_portrait)|native|1|1|0|固定Valve KV|grimstroke_dark_portrait|0|
|投掷巨石 (mud_golem_hurl_boulder)|native|1|1|0|固定Valve KV|未匹配，明确缺失|0|
|恶魔赦令 (leshrac_diabolic_edict)|native|4|4|4|固定Valve KV|leshrac_diabolic_edict|0|
|石化（佣兽） (visage_summon_familiars_stone_form)|native|3|3|3|固定Valve KV|未匹配，明确缺失|0|
|陵卫斗篷 (visage_silent_as_the_grave)|native|1|1|0|固定Valve KV|visage_silent_as_the_grave|0|
|毛团 (bristleback_hairball)|native|1|1|1|固定Valve KV|bristleback_hairball|0|
|撕裂伤口 (life_stealer_open_wounds)|native|1|1|1|固定Valve KV|life_stealer_open_wounds|0|
|燃烧之军 (clinkz_burning_army)|native|1|1|2|固定Valve KV|clinkz_burning_army|0|
|灵魂猎手 (shadow_demon_soul_catcher)|native|4|4|4|固定Valve KV|未匹配，明确缺失|0|
|奥术诅咒 (silencer_curse_of_the_silent)|native|4|4|4|固定Valve KV|silencer_curse_of_the_silent|0|
|雷云 (zuus_cloud)|native|1|1|1|固定Valve KV|zuus_cloud|0|
|窒碍短匕 (phantom_assassin_stifling_dagger)|native|4|4|0|固定Valve KV|phantom_assassin_stifling_dagger|0|
|粘性陷阱 (broodmother_sticky_snare)|native|1|1|2|固定Valve KV|broodmother_sticky_snare|0|
|普通一拳 (dark_seer_normal_punch)|native|1|0|4|固定Valve KV|dark_seer_normal_punch|0|
|死灵战士法力损毁 (necronomicon_warrior_mana_burn)|native|3|0|0|固定Valve KV|未匹配，明确缺失|0|
|死灵战士临终遗愿 (necronomicon_warrior_last_will)|native|3|0|0|固定Valve KV|未匹配，明确缺失|0|
|死灵射手净化 (necronomicon_archer_purge)|native|1|1|0|固定Valve KV|未匹配，明确缺失|0|
|死灵射手光环 (necronomicon_archer_aoe)|native|3|0|3|固定Valve KV|未匹配，明确缺失|0|
|黑龙火球 (black_dragon_fireball)|native|4|4|4|固定Valve KV|未匹配，明确缺失|0|
|黑龙溅射攻击 (black_dragon_splash_attack)|native|1|0|1|固定Valve KV|未匹配，明确缺失|0|
|龙鳞光环 (black_dragon_dragonhide_aura)|native|1|1|1|固定Valve KV|未匹配，明确缺失|0|
|雷霆蜥蜴猛击 (big_thunder_lizard_slam)|native|1|1|1|固定Valve KV|未匹配，明确缺失|0|
|雷霆蜥蜴狂怒 (big_thunder_lizard_frenzy)|native|1|1|0|固定Valve KV|未匹配，明确缺失|0|
|战鹰俯冲 (beastmaster_hawk_dive)|native|1|1|0|固定Valve KV|未匹配，明确缺失|0|
|闪烁碎片 (aa_granted_blink_fragment)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|泥土傀儡死亡分裂 (mud_golem_rock_destroy)|native|1|0|1|固定Valve KV|未匹配，明确缺失|0|
|花岗岩生命光环 (granite_golem_hp_aura)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|永久隐身（狼） (lycan_summon_wolves_invisibility)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|洪流风暴 (kunkka_torrent_storm)|native|1|1|2|固定Valve KV|未匹配，明确缺失|0|
|致残 (lycan_summon_wolves_critical_strike)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|自然之握 (treant_natures_grasp)|native|4|4|12|固定Valve KV|treant_natures_grasp|0|
|第二锯齿飞轮 (aa_granted_second_chakram)|native|3|3|9|固定Valve KV|未匹配，明确缺失|0|
|收回锯齿飞轮 (aa_return_chakram)|native|1|0|0|无匹配，见参数来源|未匹配，明确缺失|0|
|收回第二锯齿飞轮 (aa_return_second_chakram)|native|1|0|0|无匹配，见参数来源|未匹配，明确缺失|0|
|穿刺腐尸毒 (aa_granted_burrow_caustic_finale)|native|1|0|1|固定Valve KV|sandking_caustic_finale|0|
|虚空 (night_stalker_void)|native|1|1|0|固定Valve KV|night_stalker_void|0|
|涤罪之焰 (oracle_purifying_flames)|native|4|4|0|固定Valve KV|oracle_purifying_flames|0|
|命运之雨 (oracle_rain_of_destiny)|native|1|1|1|固定Valve KV|oracle_rain_of_destiny|0|
|殉道 (chen_martyrdom)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|停止烈火精灵 (phoenix_icarus_dive_stop)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|释放冰晶爆轰 (ancient_apparition_ice_blast_release)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|邦戈战鼓 (aa_granted_bongo_drums)|native|1|0|1|无匹配，见参数来源|未匹配，明确缺失|0|
|激流 (naga_siren_rip_tide)|native|4|0|4|固定Valve KV|naga_siren_rip_tide|0|
|吐出 (aa_granted_spit_out)|native|1|0|1|无匹配，见参数来源|未匹配，明确缺失|0|
|射手天赋 (drow_ranger_marksmanship)|native|3|0|6|固定Valve KV|drow_ranger_marksmanship|0|
|混乱之箭 (chaos_knight_chaos_bolt)|native|4|4|4|固定Valve KV|chaos_knight_chaos_bolt|0|
|过肩摔（回跃授予） (aa_granted_rebound_dispose)|native|4|0|8|固定Valve KV|marci_grapple|0|
|群星风暴陨星 (mirana_starfall)|native|4|0|0|固定Valve KV|mirana_starfall|0|
|停止滚动 (pangolier_gyroshell_stop)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|雪球冰片 (aa_granted_snowball_ice_shards)|native|4|4|12|固定Valve KV|tusk_ice_shards|0|
|善能 (dazzle_good_juju)|native|3|0|0|固定Valve KV|未匹配，明确缺失|0|
|赤红甲 (item_crimson_guard)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|缠绕之爪 (lone_druid_spirit_bear_entangle)|native|4|0|0|固定Valve KV|未匹配，明确缺失|0|
|石化（英雄） (aa_granted_visage_stone_form)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|回归 (lone_druid_spirit_bear_return)|native|1|0|1|固定Valve KV|未匹配，明确缺失|0|
|雷神之锤 (item_mjollnir)|native|1|1|3|无匹配，见参数来源|未匹配，明确缺失|0|
|疯狂面具 (item_mask_of_madness)|native|1|1|0|无匹配，见参数来源|未匹配，明确缺失|0|
|碎颅锤 (item_basher)|native|1|0|0|无匹配，见参数来源|未匹配，明确缺失|0|
|冥火爆击 (skeleton_king_hellfire_blast)|native|4|4|0|固定Valve KV|skeleton_king_hellfire_blast|0|
|恶狼撕咬 (lycan_wolf_bite)|native|3|3|6|固定Valve KV|lycan_wolf_bite|0|
|金箍棒 (item_monkey_king_bar)|native|1|0|0|无匹配，见参数来源|未匹配，明确缺失|0|
|达贡之神力（分魂授予） (aa_granted_sunder_dagon)|native|5|5|0|无匹配，见参数来源|未匹配，明确缺失|0|
|释放狙杀 (aa_granted_sharpshooter_release)|native|3|0|0|固定Valve KV|未匹配，明确缺失|0|
|神圣一跃 (zuus_heavenly_jump)|native|4|0|4|固定Valve KV|zuus_heavenly_jump|0|
|停止烈日炙烤 (phoenix_sun_ray_stop)|native|4|0|0|固定Valve KV|未匹配，明确缺失|0|
|切换炙烤移动 (phoenix_sun_ray_toggle_move)|native|1|0|0|固定Valve KV|未匹配，明确缺失|0|
|超新星（炙烤授予） (aa_granted_sun_ray_supernova)|native|3|0|3|固定Valve KV|phoenix_supernova|0|
|闪烁（投掷授予） (queenofpain_blink)|native|4|4|4|固定Valve KV|queenofpain_blink|0|

## 仅参考定义

这些条目保留数值/来源核对，不声明存在独立最终程序：
- sandking_caustic_finale：4个原生档。
- lycan_howl：4个原生档。
- templar_assassin_refraction：4个原生档。
- tidehunter_ravage：3个原生档。
- dark_willow_bramble_maze：4个原生档。
- dark_willow_terrorize：3个原生档。
- lich_ice_spire：1个原生档。
- elder_titan_ancestral_spirit：4个原生档。
- tusk_walrus_punch：3个原生档。
- enigma_black_hole：3个原生档。
- bane_fiends_grip：3个原生档。
- dark_willow_bedlam：3个原生档。
- magnataur_horn_toss：1个原生档。
- antimage_blink：4个原生档。
- dark_seer_vacuum：4个原生档。
- lina_dragon_slave：4个原生档。
- sandking_burrowstrike：4个原生档。
- huskar_inner_fire：4个原生档。

## 已知边界

- 其他复杂投射物、锥形、长条和角色附着光效仍按各自已有呈现逻辑；记录保留原作范围与源版本未决项。
- 全量4秒运行探测不覆盖长冷却、条件技能、低概率触发和所有状态组合；具名边界测试独立执行并报告。
- 本报告不将此前尚未完成的全技能机制验收改称通过。

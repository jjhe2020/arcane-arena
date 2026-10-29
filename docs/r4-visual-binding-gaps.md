# r4 战斗美术绑定：已验证修正与剩余具体缺口

更新：2026-10-29，r4封包前。本次检查的是230个可选技能及授予技能运行时的数据通路，不以图层分类数量推断完成率。`public/data/assets.json`有236个美术条目；角色、图层、分类存在不代表其每个分支在真实战斗中都已播放。最新本代理专项：35项绑定测试及79项extra测试全部通过，TypeScript检查通过（16:09）；Duel与本体表现另有主代理/规则代理专项。

验证范围：`src/visual-bindings.test.ts`以当前完整目录和真实`createBattle/stepBattle`产出状态、事件、传送门、移动元数据，再断言实际选中的图集、坐标、等级和生命周期。它不是1218个图层的逐帧视觉验收。源美术项目未修改；这些测试不改变伤害、控制或胜负规则。

## 本轮已复现并修正

| 技能或通路 | 原问题 | 绑定的真实证据和回归 |
| --- | --- | --- |
| Chemical Rage | 持有技能可能被误当常驻增益；Gaben友军的身体狂暴层因非自身来源被漏掉 | 实际`baseAttackTime/regen/moveFlat`；无状态不画，有状态只画`rage/regen`，友军同样显示，过期或死亡消失 |
| Jingu | 受击者的`jinguHits`误配`caster_charged_attacks`；施法者真实充能反而无图 | 敌人只画`stack`；第四击后使用真实`unit['custom_monkey_king_jingu_mastery:charges']`画`charged`，消耗完撤下 |
| Refraction | 六次防御消耗完，仍被独立攻击池点亮护盾 | `refraction.remaining`只控制`shield`；真实六次伤害耗尽护盾，`refractionAttack`尚在也不画盾 |
| Berserker Rage | 未按已批准生命分档显示累计层 | 当前HP比例选择manifest的`owner_health_visuals.bands`；100/60/40/20%分别显示1/2/3/4层 |
| Sticky Napalm、Warpath | 真实状态名不能被通用stack正则识别 | `stickyNapalm`→`coat`；`warpath`→`fury/stack/embers`，均用真实施法后状态测试 |
| Flesh Heap | 永久状态的`:persistent`来源不能解析艺术包 | 持久技能实例Strength>0→`heap_mark`；未施放主动时不会顺带画`block_shell` |
| Elder Dragon Form | 1点绿龙仅施毒却误画蓝龙寒霜 | `dot`→`poison`、`slow`→`frost_slow`；真实1点/3点攻击分支分别验证。授予Fireball的`fireballBurn`不能泄露这两层父素材 |
| Spirit Link / True Form | 真熊已生效，但英雄本体仍用原职业 | 真实授予`lone_druid_true_form`的`trueForm`状态→已有`truebear_idle/move/attack/death`；到期恢复 |
| Call of the Wild | 支配远古误用第一个野猪本体 | 实际`name='支配远古'`、`ancient/sourceUnitType`对应`ancient_idle/attack` |
| 子技能美术 | 显式父fallback压过子技能自己的艺术包；父Gaben档污染子技能普通档 | own atlas优先；无own才用保留的父ID/父档次；事件保留实际子技能等级 |
| 移动图层 | 显式layer可以绕过普通/Super/Gaben排除 | fallback也经过tier层集。真实Multishot、Wild Axes、Chakram、Kisses、Ghostship与Tidal Wave使用模拟坐标、出发时间、方向和实际layer；删除元数据后不凭施法虚构路径 |
| Dissimilate | 门的位置不能从预览时间线推断 | 逐个读取真实`visualForm.data.portals`；普通/Gaben、过期、死亡、释放及损坏数据均有回归 |
| Courage | 被动反击没有普通cast事件，不能依靠cast播特效 | 成功PRD/ICD判定后发布独立`counter`世界事件，12帧/24fps播放一次；失败或ICD中不发布。实际非零治疗事件单独画`steal` |
| 事件语义 | 任意cast/hit不能代表世界爆炸、成功触发或治疗 | 零伤/阻挡/未命中不画命中层；Ravage的cast/召唤/移动/无关status不生成爆炸；治疗反馈来自真实heal |

## 最后四项定位问题的封包处理

以下来自当前源码与manifest的交叉核对，未冒充完整画面验收。前三项已接实际状态或事件，最后一项采用清楚标注的已有美术临时复用。精确原作轨道与专用泥土造型仍属于下表明确保留的边界。

| 技能/实际ID | 已有图层 | 当前可用的真实证据 | 本次落地与保留边界 |
| --- | --- | --- | --- |
| `troll_warlord_whirling_axes_melee`，父`custom_troll_warlord_berserkers_rage` | `axe_melee`，role=`orbit_weapon` | `src/skill-effects-extra.ts`授予动作创建follow=true、radius=4.5、duration=3的实际zone，带父来源 | **封包前已补：**现有zone增加`visualLayer:'axe_melee'`，核心透传`b.zones[].layer`，渲染按层读取。不新增目标、伤害或时钟；实战回归验证随源坐标更新、3秒到期及源死亡均移除。斧的精确逐条轨道仍未模拟；伤害保留450半径工作包络 |
| `custom_legion_commander_duel` | `arena`=`duel_boundary`、`isolation`=`pair_external_damage_reduction`、`challenge`、`victory` | 双方实际`duel`状态的`data.targetId/externalReduction`；死亡结束双方状态；获胜方技能持久收益 | **本次已接：**规则代理在真实施放/收益分支发布challenge/victory；`src/duel-presentation.ts`从有效双方pair画装饰arena，实际externalReduction>0才画isolation。root renderer已接入，独立11项pair/状态/互斥/死亡回归通过。只加表现，不新增碰撞或改变对决物理规则 |
| `custom_grimstroke_ink_swell` | `burst`=`area_event`、`tendril`=`connection`；持续`coat`已可绑定 | 实际目标`inkSwell`状态；延迟结束时读取累计命中并造成范围伤害/眩晕 | **封包前已补：**真实爆炸分支发布受益者当前位置、实际radius/points/time，16/24秒单次burst；实际tick伤害>0才给命中者.21秒视觉连接，source=受益者。驱散/受益者死亡取消爆炸，不把visualLink再当敌方coat。未改变伤害、接触计时或RNG |
| `medusa_stone_gaze` Gaben的泥土傀儡及`mud_golem_rock_destroy`分裂体 | 原Stone Gaze包只有`enter/exit/field/petrify/sustain`，没有对应summon本体；临时使用已批准Warlock的`golem_idle/attack/death` | 已生成`sourceUnitType='npc_dota_neutral_mud_golem'`，死亡分裂`npc_dota_neutral_mud_golem_split`，有真实动作、HP、攻击和投石 | **本次已临时复用：**`src/animation.ts`仅匹配这两个精确sourceUnitType，取获批Warlock石质本体，主身体尺度乘.7、碎片乘.42，不再退回英雄。仅渲染映射；单位属性、碰撞、RNG与源文件不改。仍没有宣称专用泥土造型已经制作 |

### 泥土傀儡源库复查及已落地的临时复用（源库只读）

已按源库`AGENTS.md`先读取README、HANDOFF、environment-check。只读搜索`config/reports/docs/素材索引.md/01_特效/03_角色`的JSON/Markdown及全库文件名，关键词包括`mud_golem`、`mud golem`、泥土傀儡、泥人和碎片傀儡。未发现独立泥土傀儡/分裂体交付包；发现的记录明确把Stone Gaze Gaben召唤体列为基础12项之后的AA扩展。此结论限制在本次搜索范围，不声称不存在未索引工程。

- `E:/codex/gameArtPipeline/docs/SKILL-PRODUCTION-STATISTICS-20261027.md:47`：Stone Gaze Gaben需每个石化单位产生泥土傀儡，记录为基础美术已有、AA升级待扩展。
- `E:/codex/gameArtPipeline/docs/SKILL-ART-BASELINE-20261028.md:63`及`reports/skill-art-approval-20261028.json`仍选中`ART-20261026-006/c01_hd_v001`。实际读取该bundle.effects，只有`enter/exit/field/petrify/sustain`五项，未找到召唤本体。
- 已临时复用获批`ART-20261026-044_混乱献祭/c01_hd_v001`石质地狱火。精确源为`E:/codex/gameArtPipeline/01_特效/技能特效/ART-20261026-044_混乱献祭/05_导出/c01_hd_v001/{bundle,runtime}.json`。20261028认可清单中`user_approved=true`，bundle SHA256=`a4d34e9959c5c108b2069ac45447159a839385d1ff20b679a59d7bd205b23d9e`；runtime SHA256=`5d07f2c8e6f754dd4de4a6f8f53aa41d2df07f28bf16dc0d4078e5e0ca5d240c`。两文件当前实际SHA已复核匹配；原包中的旧candidate字段由该认可记录覆盖。
- 游戏中已导入且已映射：`/art/skills/custom_warlock_chaotic_offering/golem_idle.webp`、`golem_attack.webp`、`golem_death.webp`。三段均24帧、24fps、原`worldSize=6`；idle循环，attack/death不循环。渲染主泥土体用4.2、碎片用2.52，不改资源字节或战斗体积；移动/投石暂无专门动作，使用现有动作回退并保留该限制。已查看实际图集，外观是灰绿石块身体带黄色接缝，属于地狱火造型复用，不是已制作的精确泥土傀儡。
- 野性呼唤的`ancient_idle/attack`虽然也已批准，但实际图集是兽形主体，不作为泥土人形的首选复用。

## 本次边界

- 现有generic角色匹配仍须按明确语义收紧，例如`caster_status`不能同时代表所有自身数值状态。Gods Strength已加入真实4秒免疫结束、攻击增益仍存的专项断言，防止`immune`被长期`attackPct`续亮。
- 凡是父技能存在多个不同时长、不同目标的效果，只保留父ID/档次还不充分，必须用子ID、真实kind、layer选择或动作元数据进一步区分。
- 世界事件、弹体、召唤和变身之间不互相替代；缺少状态或轨迹时不通过播放源包预览时间线“补齐”。
- 本批没有新增3D模型；运行时继续使用已导入的二维序列帧/图集，由Three.js摆放。美术绑定改动不改变目标、碰撞、伤害、接触时长或RNG；记录真实事件与短期视觉连接只是表现元数据。
- 本文不评价所有图层的比例、朝向、遮挡和移动端密集战斗观感；这些需要生产构建画面验证。也不把当前测试数量作为技能或美术完成百分比。

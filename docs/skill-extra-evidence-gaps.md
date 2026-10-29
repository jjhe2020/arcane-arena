# 58项扩展技能：规则证据与精确缺口

核对日期：2026-10-29。实现归属：`src/skill-effects-extra.ts`；回归：`tests/skill-extra.test.ts`。58/58个Super、58/58个Gaben现均有可执行分支；r4最新73项专项测试及TypeScript检查通过（15:42，完整集成套件由主代理统一运行）。程序标记表示已知规则和明确列出的工作默认已有执行分支，**不是AA实机对照验收**；全部`verifiedAgainstReference=false`。原始AA文案、固定历史候选、项目工作默认分别记录，未用测试通过代替原作一致性。

## 来源与版本边界

| 编号 | 精确来源 | 能证明的范围 |
| --- | --- | --- |
| L1 | `E:\codex\gameArtPipeline\outputs\ability-arena-reference\abilities.en.json`；同字节副本 `outputs\aa02-reference-catalog-20261026\abilities.en.json`；原URL `https://www.abilityarena.com/data/abilities.json`；SHA256 `1014c45e7209094d311e3d2c16c92bd4c32ae490c510a721a75e0c23c48cfcae` | 230个完整定义。每项按精确`id`定位；`values`、`description`、`differences`、`superUpgrade`、`gabenUpgrade`、`manaCost`、`cooldowns`均已检查。它是文案数据，不含授予技能的完整执行定义。 |
| L2 | `E:\codex\gameArtPipeline\config\ability-arena-spell-catalog.json`，`recorded_at=2026-10-26T06:14:15.816948+08:00`；`reports\ability-arena-catalog-acquisition.json` | 明确`source_patch=unknown`；英语优先；保留中英差异。抓取时间不代表游戏版本。FAQ把3点定义为Dota满级普通技能，6/9点为Super/Gaben。 |
| L3 | `E:\codex\gameArtPipeline\outputs\ability-arena-reference\abilities.cn.json`；SHA256 `2841325b9ffb344cfec221060cde89e58a1c29365f2838b3aa47fafc8126af3f` | 辅助语言核对；Avernus“提高50%的减速效果”、Luminosity“吸血增强150%”仍不能单凭译文确定加算或乘算。 |
| L4 | `E:\codex\gameArtPipeline\outputs\ability-arena-reference\app.b5a4e104.js`；SHA256 `7b160283379fbbcf462f1ee66cfabc07e65671f10a939df7d73dff62ca24ecfe`；`254.0a9e82c9.js` | 公开网页的路由、数据加载与展示代码；未发现战斗Lua或物品实现。`/changelog`路由的445块映射为`445.5a70fb2f.js`。 |
| W1 | [官方AA 1.5日志，2022-10-05](https://news.abilityarena.com/1-5/) | 确认Purge三充能、授予Cleanse三充能、Overload蓄积后一次释放；不提供子技能所有数值。 |
| W2 | [作者Steam更新记录，第17页](https://steamcommunity.com/sharedfiles/filedetails/changelog/2865676075?p=17)，2022-11-01、12-01、12-19条目 | 确认Dark Pact全队复制；Cleanse50魔法；Jingu士兵额外400射程；Wolf Bite排除幻象。未提供士兵基础属性。 |
| W3 | [作者Steam更新记录，第16页](https://steamcommunity.com/sharedfiles/filedetails/changelog/2865676075?p=16)，2023-02-01、02-04条目 | 确认Infernal Blade破坏2秒，Overload攻击减速1.2秒，Spirit Link排除幻象；提供地狱火Flaming Fists 30/40/50和Immolation 20/40/60，但缺触发/范围参数。 |
| W4 | [作者Steam更新记录，第15页](https://steamcommunity.com/sharedfiles/filedetails/changelog/2865676075?p=15)，2023-04-05与05-20条目 | 5.5指明Flesh Golem授予4级Soul Rip；6.0改写多项升级，不能无条件回填到L1。 |
| W5 | [官方AA 4.5日志，2023-02-01](https://news.abilityarena.com/ability-arena-season-4-5/) | 明确Crippling Fear零施法前摇；Infernal Blade破坏时长变更的第二份一手佐证。 |
| W6 | [官网公开变更块](https://www.abilityarena.com/js/445.5a70fb2f.js) | 本轮只读抓取18,164字节。英文嵌入2023-05-20；中文嵌入5.5，两个语言版本不一致。不能把此块整体视为当前快照规则。 |
| W7 | [官方Github组织](https://github.com/Double-Edge-Studios-LLC)、其`Double-Edge-Studios-LLC.github.io`仓库tree | 公开站点仓库仅README、allowed_users、enabled_abilities和alpha启用表。未找到AA战斗源码或物品数值；不据此断言私有源码不存在。 |
| L5 | `references/dota-20230216/{items,npc_abilities,npc_units,npc_heroes}.txt`；[固定提交](https://github.com/SteamTracking/GameTracking-Dota2/commit/6abdd9d13de2f4330ca748082467b9ff6e6cd928)；commit时间2023-02-10 01:16:45 UTC | Valve游戏包原始KV，经SteamTracking镜像保存；目录名20230216为删除解包目录的截止事件，不是数据日期。`sources.json`记录原blob与SHA256；`parsed/*.json`保留字段层级、重复字段和原始行号。它是引用物品/子技能的历史工作回退，**不是AA修改后脚本，也未证明与L1同一版本**。 |

当前官网`/api/steam/changelog`返回最近10条、总记录182条；本轮响应SHA256为`8ddef0b7542d59dffce9ff973a87f70bda1ea5a7d5544ece2dfcb6596dfaf41a`。其记录已到2026年，进一步证明网页静态文案、官网静态更新块、Workshop当前游戏不是同一快照。此接口不是已验证的历史分页接口，未臆造参数抓取。

明确冲突示例：6.0把Grave Chill Super的缴械/减CD替换为加持续时间，把Shadow Dance Gaben的Depth Shroud替换为常驻增益，又改变Arctic Burn飞行及溅射/治疗/友军赋予规则；L1仍保留另一套文案。因此本项目保留L1，W2–W5仅用于补足与该条目不冲突的字段。2023年后日志中进一步改变Overpower/Poison Attack等升级也不混入L1。

## 本轮已经落地的核实结果

- Infernal Blade增加2秒默认破坏；仅补`%break_duration%`占位缺口，不凭空补Super的“bonus damage”。来源W3/W5。
- Overload攻击减速由临时0.6秒改为W3的1.2秒；移动减速时长采用L5历史0.8秒工作回退。
- Crippling Fear目录`differences`明确0.1秒前摇，现以L1覆盖W5旧补丁的0秒；历史日志只作为冲突记录，不反向改写当前目录。
- Spirit Link排除幻象施法者和幻象受益者；Wolf Bite不选幻象。来源W2/W3。
- Flesh Golem Gaben指明的Dota4级Soul Rip映射为L2所说的AA Standard即3点；保留L1的攻击目标/被攻击时自身双触发。其Gaben已具备完整已知分支；Super僵尸已按下述历史单位工作回退实现。W4的“self upon attack”与L1“when attacked”有文字冲突，本实现明确使用L1。
- Dark Pact的Gaben全队范围得到W2确认；补上普通半伤害副本的非致死自身生命消耗（300×50%×30%=45，3点普通值），仍需验证召唤物/幻象资格与消耗结算顺序。

## 本轮补齐的20档与仍需原作核验的边界

下表对应此前20个未完成档位、18个技能。现在均已有执行机制；未提供的细节采用集中、透明的工作默认，不再以“缺参考”代替实现。AA自身文本优先，L5只补其未覆写字段；原作黑白名单、交互顺序和含糊措辞仍未实机核验。

| 技能ID | 档位 | 已执行的行为 | 尚未获AA证据的工作边界 |
| --- | --- | --- | --- |
| `vengefulspirit_command_aura` | G | 死亡强幻象100%输出/受伤、满魔法、继承技能初始化；保留属性快照，消除重复属性初始化；禁止再次生成同类死亡幻象 | 初始化允许表为项目规则；各被动是否应被原作继承、充能/CD初态仍需逐项对照 |
| `enchantress_impetus` | G | 独立Sproink槽、4秒CD/50蓝、打最远3个可见目标；敌人分8步击退5单位/.4秒，清除指向自身弹体；额外攻击触发攻击修饰 | AA改为击退敌人，具体选点采用有效射程+2；附带Impetus不再额外付蓝是明确默认 |
| `custom_dawnbreaker_luminosity` | G | 每5秒追加正常攻击；额外攻击计数和修饰器实际执行 | “150%”解释为额外150个百分点吸血；双击间隔.1秒 |
| `custom_monkey_king_jingu_mastery` | S/G | Echo Sabre原生属性、近战6秒CD、.8秒减速；G每2秒生成静止无敌士兵，12秒寿命、1.2BAT、+4射程、当前攻击快照；7项攻击特效白名单继承并初始化，去除快照重复属性 | 双击间隔.1秒；士兵六个环绕位置偏移1.2；明确白名单不是原作完整资格表，其他攻击特效仍未开放 |
| `custom_storm_spirit_overload` | G | 两次依次飞行弹射、不重复目标；每次释放捕获的全部蓄能，并按命中后再找下一跳 | 半径5、速度12、额外攻击不触发其它修饰器是项目默认 |
| `custom_abaddon_curse_of_avernus` | S | 三击触发；完整诅咒减速额外加.5，封顶.99并受引擎移速下限限制 | 解释为诅咒慢速加50个百分点，不改变基础命中慢速 |
| `custom_slark_dark_pact` | G | 与本体同步10个.1秒脉冲；其他真实友方英雄复制普通50%伤害、非致死自伤和强驱散 | 排除召唤物/幻象；复制不继承Super；自伤直接非致死生命消耗，保护交互待核 |
| `custom_enchantress_natures_attendants` | G | 13个邪恶精灵、每个36魔法DPS、.5秒tick、12秒、半径2.75；按种子分配附近敌人 | AA未列伤害参数；明确采用Super治疗群数量/节奏的工作镜像，不声称是AA真实伤害 |
| `dazzle_shadow_wave` | G | 授予独立Bad Juju主动槽；技能影响敌友产生减/加甲层；满血治疗目标也叠层；主动每层60物理伤害或治疗 | 采用L5的3级主动版本：15秒CD/100蓝、每层3甲/12秒、半径12；主动不消耗层；复杂无伤害buff影响集合仍需核验 |
| `custom_shadow_demon_demonic_purge` | G | 授予独立Cleanse槽，3充能/50蓝、公共动作队列、独立CD与前摇，充能顺序回复受CDR影响 | 采用目录3点Cleanse、700距离/.3秒前摇；原作特殊目标资格待核 |
| `custom_shadow_demon_demonic_cleanse` | G | 授予独立Purge槽，1充能/200蓝、公共动作队列；调用目录3点Purge真实逻辑 | 未对称继承Purge本体Super三充能；60秒回复、700距离/.3秒前摇为明确历史工作回退 |
| `night_stalker_crippling_fear` | G | 每4秒触发550范围的4级夜间Void；320魔伤、4秒减速，增加普通小晕 | 普通小晕采用.1秒，不误用Scepter的1秒；被动破坏和沉默交互按当前引擎规则 |
| `custom_warlock_chaotic_offering` | G | 两个地狱火，HP按历史Scepter绝对差值500/600/600从AA值扣除；拳与献祭采用W3 AA伤害；标记远古 | 降低HP算法是工作默认；AA普通攻击0保留，不借历史攻击替换 |
| `custom_faceless_void_chronosphere` | G | 友军移动速度除6.5、攻击前摇/间隔与施法前摇/后摇时钟乘6.5，进出圈同步剩余动作时间；普通隐形显形、施法者圈内移速1000；持续圈约束不被状态抗性缩短 | “-550%”解释为6.5倍时间；引导持续仍按世界时间是明确解释；施法者移速1000及离场.15秒余留为工作默认，原作交互待核 |
| `custom_ember_spirit_flame_guard` | G | 独立Radiance光环120魔法DPS、半径7、15%致盲，破坏停止刷新；不依赖火盾存活 | “两倍”仅解释为烧伤加倍；不额外赠送整件物品攻击/闪避 |
| `muerta_pierce_the_veil` | G | 常驻Gunslinger50%概率追加一次正常攻击；优先有效射程内另一可见敌人，否则原目标；防递归 | L5早于Muerta发布，概率与目标规则是透明默认；额外攻击允许修饰器，破坏和幻象不触发 |
| `lycan_shapeshift` | S/G | S沿敌方纵深到后排，最大位移15；G选6内最近真实友军，长期形态与30%共享吸血；12范围持续刷新、新召唤物同步形态 | 后排留.8间隙、形态120秒覆盖战斗、双方共享吸血范围采用历史工作回退 |
| `dragon_knight_elder_dragon_form` | G | 黑龙自由路径忽略墙体和单位阻挡，保留地图边界；Fireball独立队列与余烬tick去重 | 形态射程0继续保留AA字段含义边界；原作复杂地形寻路尚无复刻对照 |

集中默认入口是`EXTRA_WORKING_DEFAULTS`。包括双击间隔.1秒、Luminosity额外吸血1.5、Avernus额外慢速.5、Overload弹射5/12、邪恶精灵13×36DPS/12秒/2.75半径、Void小晕.1秒、Chronosphere时间6.5倍/施法者移速10、士兵偏移1.2/寿命12、前排深度容差.4、Hypothermia爆炸半径4、Gunslinger概率.5、Radiance120DPS/.15致盲/7半径、Sproink附带Impetus额外蓝0、授予Cleanse3/Purge1充能、Bad Juju3级/每层3甲/12秒/60伤疗、Wolf Bite120秒/.3共享吸血/12范围、Moon Glaive弹速9、Empower Super末端半宽增加2。距离和移速默认采用世界单位（100参考单位=1世界单位）。AA文本确定的常量仍优先使用目录数据；这些默认没有伪装成历史原始字段。

专项新增断言覆盖强幻象属性和被动去重、真实授予技能队列与消耗、Echo/士兵、逐跳Overload、同步Dark Pact、邪恶精灵、Juju、击退清弹体、Chronosphere最终攻击间隔、Radiance和Gunslinger；整套测试另外覆盖230目录的1/3/6/9点配置和1/1.5/2难度锦标赛。

## r4：攻击快照、攻击特效和时间结界

- Moon Glaive从本次普通攻击的有效攻击快照读取伤害，包含平加/百分比攻击，捕获于暴击及额外攻击修饰之前。每次命中后才选择和发射下一跳，弹体起点为前一个目标，目标集合不重复。实际战斗测试验证165有效攻击的两跳依次为`165×.62`、`165×.62²`且存在飞行间隔；原始攻击后再改攻击力不改变已经发出的链。弹速900为工作默认，原作暴击/固定攻击特效继承资格仍待核验。
- 骷髅使用AA目录22–27基础伤害和Super额外24；每次命中之前按战斗种子取样，不再固定24.5。回归实际收集多次伤害，检查基础22–27/Super46–51、同种子同序列、不同种子不同序列。采用连续均匀分布为工作默认，原作是否整数取样仍未核验。
- Empower从攻击者沿主目标方向扫650距离的梯形，起始半宽150、末端半宽360；采用目标中心判断，不额外增加单位体积。L5 `npc_abilities.txt` 的 `/DOTAAbilities/magnataur_empower/AbilitySpecial/{04/cleave_starting_width,05/cleave_ending_width,06/cleave_distance}` 分别见L32555、L32560、L32565。AA Super只写增加200劈砍半径，目前解释为末端半宽增加200，距离及起始半宽不变。结果测试验证身后/过远目标无伤、前方有伤、仅Super能命中新增边缘。
- Jingu士兵的`JINGU_ATTACK_EFFECT_IDS`目前显式允许Frost Arrows、Bash of the Deep、Curse of Avernus、Luminosity、Fervor、Coup de Grace、Moon Glaive；其他技能不自动复制。继承初始化启用计数与攻击触发，核心禁止普通主动槽施法；不复制Jingu自身、召唤被动或永久英雄收益。士兵攻击总量已包含施法者攻击增益，继承初始化再产生的自有`attackBonus/attackPct`会去重。实战测试验证Frost Arrows确实施加Hypothermia、无士兵递归生成、Butterfly不会二次加攻击。这是保守工作白名单，尚不能宣称完整原作继承资格。
- PRD仅接明确工作白名单：FocusFire的Maelstrom、Overpower的Bash、Courage两方向反击分别使用独立键；不改随机目标/浮动伤害，ICD内不消耗随机判定。核心主模块Coup de Grace独立接入。概率状态按战斗技能实例和键保存；此分布及资格尚无AA实机复核。
- Chronosphere敌方普通`invisible`获得真视，`undetectable/shadowRealm`仍保留各自不可选中规则。圈内控制和时间减速每.1秒刷新.15秒，并只对这些持续场约束忽略状态抗性的时长缩减，避免90%抗性造成刷新间隙；离场仍允许.15秒余留。施法者圈内移速1000是透明工作默认。实战测试验证普通隐形可被普攻、不可侦测者不可被普攻、90%抗性目标逐fixed-step持续控制，以及场内.2秒实际移动2世界单位。施法前后摇和攻击时钟进出场的核心回归另由`rules_audit`负责；引导持续按世界时间的解释仍待原作验证。

## 本轮固定提交回退实现与核验

- Butterfly完整数值、Maelstrom链闪、Crimson Guard概率/主动格挡、Bongo Drums有限充能与跨回合攻速、Wraith Pact可摧毁独立实体均已执行；属性派生只应用一次。
- 熊使用历史单位攻击28；Entangle基本概率20%、Super CD0；Mjollnir/Mask/Basher不向熊加入Strength/Agility/Intelligence。物品主动采用自动交战策略，原生伪随机分布仍未复制。
- 骷髅采用W3所述AA攻击22–27，r4已改为每击种子浮动取样；历史HP175/甲1/BAT1.2/移速350、.25秒生成间隔、3秒复活。Super +24/双HP，G无限复活不延长原寿命，复生Wraithfire使用90命中+40DPS×2秒并由W3覆盖晕为.75秒。
- 僵尸采用历史2点攻击次数HP、33–36伤害中点34.5、1.6BAT/375移速；AA15秒寿命、攻击目标绑定；单位被攻击的计数规则仍是历史原生行为工作假设，列入remaining。
- Oracle友方非致死现在在减伤后截断；Rain采用历史650半径。Fireball 75DPS的场内刷新与残留tick共享一帧时不会双倍扣血；离场仍烧2秒。
- Fireball、Whirling Axes远/近两版、Depth Shroud、2级True Form、Sproink、Bad Juju及两种授予Purge/Cleanse共9项现为独立授予技能，有真实蓝量/CD/前摇和公共动作队列；只加入战斗单位的额外槽，购买构筑保持不变。True Form临时HP到期只减回本次1000，独立护甲不覆盖Spirit Link共享护甲。原生Entangle赋予等级、Depth Shroud继承Super仍留在remaining。
- 同提交本地化文本确认Chaos Bolt的伤害与晕反向关联；Reality Rift的4级Bolt现用同一随机数映射150–300伤害/4–2秒晕，并产生6秒100%输出/325%受伤幻象。普通幻象被动允许表仍待共享引擎解决。
- 同提交文本确认Specialists Array只作用远程且不触发攻击修饰、Wraith Pact四次英雄攻击摧毁且小兵半伤；Zeus Jump优先可见英雄，已修正近处召唤物抢占目标的问题。
- 专项测试覆盖上述关键行为，以及已有充能、属性持久收益、死亡触发；当前总数和最新运行见本文首段。所有新分支的remaining保留历史版本边界，不把smoke通过当原作对照。

## 58项目录差异反向核对（2026-10-29）

逐项读取`public/data/skills.json`中这58个精确ID的`catalog.differences`，并对照相关description、values和升级文本。以下包括空差异项，避免用“已注册程序”替代检查。58项中27项有非空差异；这58项的目录没有额外明确的开场冷却字段，未凭空增加初始CD。Wraith Pact“开场召唤”由init立即执行，已有实体测试。

| 技能ID | 当前目录差异 | 核对/修正结果 |
| --- | --- | --- |
| `crystal_maiden_brilliance_aura` | Arcane Aura allows the caster to restore mana to themselves and all allies each time they cast a spell. | 施法后自己及全部友军恢复魔法；全场回蓝。SELF MANA REGEN与MANA REGEN/SELF BONUS FACTOR彼此不一致，保留明确字段选择，不伪称消除冲突。 |
| `winter_wyvern_arctic_burn` | Has no mana cost. | 目录mana=[0]由公共施法消耗执行；飞行越过单位/墙体；当前生命烧伤按目录值。 |
| `custom_abyssal_underlord_atrophy_aura` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `huskar_berserkers_blood` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_troll_warlord_berserkers_rage` | Berserker's Rage switches the hero's attack style to melee if ranged and vice versa. | 在原始远程/近战之间转换；近战护甲/移速/BAT与缠绕实际执行。重复自动切换的AI未从文本推导。 |
| `bloodseeker_bloodrage` | Hero always casts Bloodrage on themselves. | 主体target=self；Super额外最近800范围真实友军，友方攻速为一半。 |
| `custom_warlock_chaotic_offering` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_faceless_void_chronosphere` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `night_stalker_crippling_fear` | Always maximum effectiveness as if it was night. Has 0.1s cast point instead of immediate. | 修正：当前目录0.1秒前摇优先于旧补丁0秒；始终使用NIGHT DURATION和夜间Void。 |
| `custom_abaddon_curse_of_avernus` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_slark_dark_pact` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_shadow_demon_demonic_cleanse` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_shadow_demon_demonic_purge` | Applies a Break by default. | 基础Purge就附加Break，且持续驱散/衰减慢速/终结伤害。 |
| `custom_legion_commander_duel` | Duel does not grant damage to enemies upon losing Duel. Attack modifiers can be used while Dueling. | 修正：按敌方真实英雄选择；第三方击杀决斗对手也奖励施法者；目标死亡立即结束决斗；敌方即便也装备Duel仍不得因赢得受邀决斗领奖；攻击修饰器保留。 |
| `dragon_knight_elder_dragon_form` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_magnataur_empower` | Has no cast time.  AI: Prioritize cast on the closest ally. | 修正：优先最近其他友军，缺少其他合格友军时自身；0前摇。已测不会因低血量误选远方友军。 |
| `custom_earthshaker_enchant_totem` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `oracle_false_promise` | Has slightly reduced duration. | 持续直接读取目录3/4/5秒，不使用原生较长持续；强驱散与延期账本。 |
| `gyrocopter_flak_cannon` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_ember_spirit_flame_guard` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `undying_flesh_golem` | Caster becomes melee in Flesh Golem form. | 变身期间attackRangeOverride=1.5，临时近战；STR/移速/攻击附加实际执行。 |
| `custom_pudge_flesh_heap` | Does not gain Strength permanently until Super. | 基础永久力量收益0；仅S/G附近敌方英雄死亡时记录持久力量。Super明确450范围优先，未额外赠送远程击杀收益。 |
| `custom_windrunner_focusfire` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_oracle_fortunes_end` | Fortune's End has an instant cast time with maximum power. | 0前摇、ROOT DURATION=2.75；不模拟原生蓄力。 |
| `custom_drow_ranger_frost_arrows` | Has no mana cost, and applies Hypothermia stacks by default. | 0魔法的普攻修饰；修正Hypothermia持续/上限并补死亡爆炸，伤害按AA30/40/60每层；历史7秒/7层/40%慢2秒，范围4为集中默认。 |
| `lich_frost_shield` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_visage_grave_chill` | Works on all summons. | 全部自身召唤物受益，没有只限Familiars；新增熊/骷髅同时受益断言。 |
| `custom_drow_ranger_wave_of_silence` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `enchantress_impetus` | Has increased mana cost and slightly reduced damage. | 消耗与距离伤害使用AA mana/values；不借原生较低消耗覆盖目录。 |
| `doom_bringer_infernal_blade` | Applies a Break for %break_duration% seconds by default. | 基础Break已执行；目录占位符无数字，旧AA补丁核得2秒，标注版本边界。 |
| `custom_grimstroke_ink_swell` | AI: targets frontliners in cast range. Otherwise, closest unit. Has max cast range at all levels, and slightly reduced radius. | 修正：800范围内优先活跃队伍最前沿，再选最近；前沿不在范围时回落最近其他单位；所有等级800范围，半径325。前沿按位置深度/.4容差是明确工作解释。 |
| `custom_beastmaster_inner_beast` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_monkey_king_jingu_mastery` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_snapfire_lil_shredder` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_dawnbreaker_luminosity` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `luna_lunar_blessing` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `arc_warden_magnetic_field` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `legion_commander_moment_of_courage` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_luna_moon_glaive` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_enchantress_natures_attendants` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_storm_spirit_overload` | Overload accumulates from spell casts and releases all of its stacks on proc, multiplying the damage done. | 施法累计充能；下次攻击一次消耗全层，伤害乘全部层数；S统计750内友军施法。 |
| `ursa_overpower` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `muerta_pierce_the_veil` | Reduced bonus damage. | 攻击加成直接采用AA BONUS ATTACK DAMAGE；不从后续Dota统计提高。 |
| `custom_viper_poison_attack` | Has no mana cost, and more magic resist reduction. | 0魔法普攻修饰；每层魔抗削减使用AA值并按Super补.1。 |
| `custom_chaos_knight_reality_rift` | AI: targets most backline unit. | 修正：选施法范围内敌方纵深最大的单位，而非最近/对角线最远；升级幻象改为Chaos Bolt命中才生成；默认继承attackEffects并做属性去重。 |
| `slark_shadow_dance` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_dark_willow_shadow_realm` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `dazzle_shadow_wave` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `lycan_shapeshift` | Shapeshift is permanent. Instant cast time. Caster becomes melee when Shapeshift is used. | 0前摇，形态覆盖120秒战斗上限，近战；随后新召唤物也获得受控单位增益。 |
| `custom_undying_soul_rip` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_lone_druid_spirit_link` | Works with all summons on the caster with reduced attack speed and shared lifesteal. | 遍历全部自身非幻象召唤物；按AA14/28/56攻速及7/14/28%共享吸血，不用原生熊专属较高值。 |
| `custom_zuus_static_field` | Has a cooldown for each ability to trigger Static Field. | 按触发技能ID分别计3秒CD；已有单个技能的连续伤害不重复触发，另一技能仍可触发；新增独立CD断言。 |
| `batrider_sticky_napalm` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_lone_druid_spirit_bear` | Has no leash by default. Lives independently from caster. | 无距离拴绳；主人死亡后熊继续存在并攻击，已加真实引擎测试；物品不赋予属性。 |
| `kunkka_tidebringer` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_skeleton_king_vampiric_aura` | Always summons the maximum number of skeletons. | 每次施法按目录2/4/8只生成，不需击杀充能；独立复生及G无限复生已有引擎验证。 |
| `vengefulspirit_command_aura` | （空） | differences为空；本轮未据此增加额外规则。已有基础/升级规则与待核边界保留于程序。 |
| `custom_bristleback_viscous_nasal_goo` | Cast point removed. Increased cast range. | 0前摇；700工作射程高于历史650（AA未写明确新值）；修正S/G为无目标区域施法，G无附近敌人也可给友方反向增益。 |

本轮还修正了两条直接写在升级/说明中的漏项：Reality Rift幻象生成时点和Duel第三方击杀奖励。Frost Arrows的Hypothermia死亡爆炸依赖说明补证如下；AA已有每层爆炸伤害优先于历史60常数。

2026-10-29 官方 FAQ 补证：技能层数归技能本身，跨英雄转移时跟随。原始文件、SHA及明确规则/工作默认见 `docs/faq-rules.md`。Duel和Flesh Heap的永久奖励现使用 `<skillId>:attack` / `<skillId>:strength` 技能实例状态，战斗只返回本场新增值，重新开战按新装备者应用存量，不再把收益重复写入身体通用属性。Flesh Heap永久属性使用独立且不可驱散、非被动的状态标记。专项断言覆盖跨身体迁移、存量不重复结算、多个死亡奖励只累加一次。Atrophy明确为临时加攻，保持本场结束清零，尚未找到AA精确持续时间。

| 精确原始路径 | 行号 | 使用边界 |
| --- | --- | --- |
| `references/dota-20230216/abilities_english.txt`，Token `DOTA_Tooltip_ability_drow_ranger_frost_arrows_shard_description` | 1287 | 同一2023-02-10提交的原生说明确认携带Hypothermia死亡时按层数范围伤害/减速；不证明AA完全原样复制。 |
| `references/dota-20230216/npc_abilities.txt`，`DOTAAbilities/drow_ranger_frost_arrows/AbilitySpecial/05/shard_stack_duration` | 1363 | 7秒作为历史回退；基本慢速仍为AA1.5秒。 |
| 同上，`AbilitySpecial/09/shard_max_stacks` | 1394 | 7层作为历史回退。 |
| 同上，`AbilitySpecial/07/shard_burst_move_slow_pct`、`08/shard_burst_slow_duration` | 1382、1388 | 爆炸慢40%/2秒；缺失半径集中默认4世界单位，不假称KV有值。 |
| 同上，`AbilitySpecial/06/shard_burst_damage_per_stack` | 1375 | 原生60不覆盖AA等级30/40/60。AA未说明继承的原生额外每层攻击伤害暂不添加。 |

目标策略采用固定种子可重放的排序：Empower以距离/id，Ink Swell以前沿深度容差后距离/id，Reality Rift以敌方纵深后距离/id。前沿的原作分类仍待实机资料；当前明确文本方向已执行。

## 初次调查记录（历史归档，当前状态以上表为准）

S/G表示仍未标完整的档位。表内“已知”不会重新作为缺失项；所有ID均可在L1直接定位。

| 技能ID | 档位 | 已知且已有实现 | 仍需要的精确字段与证据边界 |
| --- | --- | --- | --- |
| `custom_beastmaster_inner_beast` | G | 额外15攻速；原文给出30%物理输出抑制和30DPS | Wraith Pact图腾HP或按攻击次数生命、可攻击/免疫规则、存活时长、移动/跟随、光环半径、DPS类型与间隔、死亡后光环终止。不能用无敌固定光环冒充实体图腾。 |
| `luna_lunar_blessing` | G | 跨回合+4已有；Drums攻速应等于祝福攻击加成 | 对应版本Drums被动属性/移速光环、主动移速、持续时间、半径、充能数/恢复、初次施放及重复触发时机；攻速替换同时影响被动/主动哪一项。 |
| `vengefulspirit_command_aura` | G | 死亡后100%输出/受伤强幻象，+12%移速，复制技能列表 | 允许继承的被动逐ID清单；主动init、充能/CD/魔法继承；属性使用裸体基线还是当前快照；永久收益归属；幻象再次死亡是否触发其它onDeath技能。直接遍历init会重复加成。 |
| `winter_wyvern_arctic_burn` | G | 永久状态、同目标可重复上灼烧 | 缺移速增加的数值/百分比；L1飞行与W4取消飞行冲突，需目标版本；灼烧重复命中刷新还是并列实例。不能导入6.0新增全套效果。 |
| `enchantress_impetus` | S/G | S额外6%距离伤害 | Specialist's Array的属性、额外目标数、伤害系数、攻击间隔/CD、近战是否生效；Sproink的范围、击退距离/时长、附带攻击数、触发/CD/魔法、是否消耗Impetus魔法。当前Dota物品值不是AA版本证据。 |
| `doom_bringer_infernal_blade` | S | +1.2秒晕、+2.1%最大HP燃烧；默认破坏2秒已核实 | “bonus damage”的准确量、即时命中还是每秒燃烧、条件（如目标等级）、伤害类型。原文无数值。 |
| `custom_dawnbreaker_luminosity` | G | 每5秒双重攻击；当前按额外150个百分点吸血实现 | +150%是吸血加算、乘1.5还是最终150%；第二次攻击是否推进Luminosity计数并触发其它攻击效果；额外攻击间隔。中译和5.5中文变更仍不足以唯一裁决。 |
| `custom_monkey_king_jingu_mastery` | S/G | S额外130攻击；G明确每2秒生成士兵；W2另证士兵+400射程 | Echo Sabre双击间隔/CD、减速/持续、属性、近战限定；士兵HP/是否可攻击、伤害继承、攻速、寿命、位置、上限、Jingu/其它攻击特效继承。+400不是完整射程基值。 |
| `custom_luna_moon_glaive` | G | Super反弹数/衰减已实现 | 对应版本Butterfly的敏捷、攻速、闪避、攻击及是否含主动效果；与英雄属性派生加成是否叠加。 |
| `custom_storm_spirit_overload` | G | 两次不重复目标弹射及蓄能爆发；攻击减速1.2秒已核实 | 弹射搜索半径、速度、每跳攻击/Overload倍率、目标能否回跳、攻击特效触发、同一蓄能是否每跳都完整释放。当前无距离上限的最近新目标是显式工作假设。 |
| `custom_zuus_static_field` | G | 每次proc要求原地Heavenly Jump、两个目标 | Jump伤害/类型、移动与攻击减速量/持续时间、是否减施法速度、目标搜索半径/排序、击中魔免规则、每次Static Field多目标事件是否各产生一次Jump。 |
| `custom_abaddon_curse_of_avernus` | S | 三次攻击阈值已实现 | “increases slow by -50%”究竟+50百分点或现有减速×1.5，影响基础慢速还是完整诅咒，减速下限/上限。L3并未消除歧义。 |
| `custom_slark_dark_pact` | G | W2证全队、50%普通伤害且不继承Super；自身消耗已补 | 友方召唤物/幻象是否施放；普通1.5秒延迟是共用原施法还是每副本重新开始；自身生命消耗与减免/护盾顺序；多次强驱散/伤害分片时序。 |
| `custom_enchantress_natures_attendants` | G | 存在另一组攻击性精灵 | 邪恶精灵数量、每精灵DPS/类型、脉冲间隔、持续时间/半径、目标分配、是否继承Super+20/+5及常驻3精灵。不可直接把治疗数值当伤害。 |
| `custom_chaos_knight_reality_rift` | S/G | 射程/穿透、拉扯、护甲倍率已有；S规定4级Chaos Bolt和6秒100%输出幻象 | Chaos Bolt伤害/眩晕随机区间及相关性、弹速、免疫规则；幻象受伤系数/属性继承；G“直接拉到英雄”目的点和碰撞退让。W2旧版2级与L1的4级冲突，采用L1但仍缺4级数值。 |
| `custom_undying_soul_rip` | G | 500半径对双方伤害/治疗已实现 | Crimson Guard被动/主动格挡量与概率、近远程差异、半径、持续时间、CD、是否只挡普攻、重复覆盖规则。不可把另一版本Vanguard数值替代。 |
| `dazzle_shadow_wave` | G | S两秒变羊已有 | Bad Juju在目标AA版本是旧版被动减CD/加减甲还是新版主动消耗生命；对应每次施法甲量/持续、影响半径、叠层、主动伤害/治疗/CD/代价。名称不足以裁决版本。 |
| `custom_oracle_fortunes_end` | S/G | 360魔伤、44HPS×9秒；雨60HPS/DPS×10秒及25%治疗修正 | 友军净化之焰非致死应在减免后截断，当前原始伤害提前截断较保守；治疗buff驱散归属；Rain半径、首次tick、进出范围刷新。未把半径默认为Fortune半径标完整。 |
| `custom_shadow_demon_demonic_purge` | G | 独立Cleanse3充能、50魔法；W1/W2确认 | 授予Cleanse具体等级、施法距离/前摇/后摇、AI条件、充能补充与CDR交互、是否占用普通动作队列。当前3点/700距离/无独立动画是工作假设。 |
| `custom_shadow_demon_demonic_cleanse` | G | 独立授予Purge已有 | Purge具体等级、是否继承3充能、魔法/CD、施法距离/前摇/后摇；对无敌/禁锢友军的施法资格。不能对称臆推为完全相同的授予规则。 |
| `night_stalker_crippling_fear` | G | 每4秒、550AOE、4级Void；零前摇已核实 | Void4级伤害、晕、移动/攻击减速量和时长、魔免/驱散规则、昼夜分支、被动施放是否受沉默/破坏。 |
| `custom_lone_druid_spirit_bear` | S/G | 熊HP/甲/移速/BAT及S数值已有 | 基础攻击缺失；Entangle概率、缠绕时长/DPS、基础CD；S把CD降0的触发规则；Mjollnir、Mask of Madness、Basher各自属性/触发、CD、主动目标/时机。熊不享受物品属性的原文必须保留。 |
| `custom_warlock_chaotic_offering` | G | 基础/死亡召唤；W3核得拳30/40/50、献祭20/40/60 | 两个地狱火分别降低哪些属性、倍率；拳概率/伤害类型/范围；献祭半径/间隔；魔抗、移速、BAT。源`GOLEM DAMAGE=0`不能随意改成Dota普攻数值。 |
| `custom_faceless_void_chronosphere` | G | 友军可移动，S施法者+200攻速 | “-550%”如何映射移动/攻速/施法速度（现6.5倍慢仅解释）；前摇、后摇、引导分别怎样缩放；友方召唤物/幻象豁免；施法者内圈移动上限。 |
| `custom_ember_spirit_flame_guard` | G | 规定两倍Radiance | 目标版本RadianceDPS/类型/半径/闪避或致盲、攻击属性；“两倍”只作用灼烧还是所有字段；被动能否驱散/被破坏。 |
| `undying_flesh_golem` | S | +10%伤害增幅/+10%力量/-30CD；G等级已核实 | 每次变身攻击生成15秒僵尸，但缺HP/按攻击次数生命、攻击/攻击间隔、移速/距离、目标绑定、减速、死亡规则/数量上限。G已不在缺口计数。 |
| `custom_windrunner_focusfire` | S | 取消攻击减伤已有 | Maelstrom闪电概率、伤害/类型、弹射数/范围、内置CD、攻击属性、伪随机分布、幻象/多重攻击资格；不引入当前物品统计。 |
| `muerta_pierce_the_veil` | G | 物免、魔法普攻和S数值已有 | Gunslinger触发概率、二次目标优先级/范围、无二目标时能否再打主目标、攻击特效/吸血/暴击、是否只在变身期间。 |
| `slark_shadow_dance` | G | 主技能隐匿、恢复、移速及S已有 | Depth Shroud半径、持续、CD/魔法、选点/友军资格、是否给被动恢复/移速；W4已明确6.0移除此授予，不能用6.0常驻buff代替L1。 |
| `lycan_shapeshift` | S/G | 1500范围后排位移/400恐惧1.5秒；600内最近非幻象友军Wolf Bite | 后排点/单位选择算法与边界退让；Wolf Bite持续、生命/暴击/移速继承及共享吸血字段；变身后新召唤物继承。W2仅消除了幻象资格疑问。 |
| `custom_lone_druid_spirit_link` | G | 排除幻象；共享生命窃取/甲/AS已有 | 2级True Form生命/甲、攻击距离/BAT、变身持续、近远程切换、Entangle/Demolish子效果；W3仅确认无前摇，不提供主体数值。 |
| `custom_skeleton_king_vampiric_aura` | S/G | 本体吸血已有；原文S+24攻击/2倍HP、G无限复生 | 骷髅基础HP/攻击/甲/移速/BAT、初始数量/充能生成、召唤间隔、复活延迟、存续；2级Wraithfire伤害/减速/弹速，W3只核得G技能晕0.75秒。W4才加入施法者死亡停止复生，不能回填未知基线。 |
| `custom_troll_warlord_berserkers_rage` | S/G | 姿态数值/缠绕已有；G明确Axes4秒/25魔法/双驱散 | 远近两版Whirling Axes各自伤害、范围/锥角、飞行/持续、减速/致盲、施放时机；姿态切换是否自动随距离变化；对应子技能ID/级别。 |
| `dragon_knight_elder_dragon_form` | S/G | 溅射/黑龙毒慢/魔抗数字已实现 | FireballDPS/半径/持续/CD/魔法/选点/变身限定；飞行/无碰撞的具体范围；龙形攻击距离；继承Super与黑龙覆盖关系。不能把Prellex中Black Drake Fireball当本技能值。 |

## 仍需的资料形态

最有价值的是与L1各技能升级匹配的AA公开实现、导出的KV/子技能/物品数据，或标明补丁版本的原作技能详细提示与可重复实测。W4明确2023-04-11增加SHIFT显示授予技能详情，说明这些细节当时存在于游戏内，但网页230定义没有一同导出。

美术包中的runtime、分层动画、制作说明会记录尺寸和视觉工作假设；它们不提供真实物品伤害、召唤物生命或战斗触发条件，不能据美术时长填充战斗持续时间。本轮没有修改源美术项目，也没有访问非公开数据或消息他人。

## Fixed-commit field index

All paths below are in `references/dota-20230216`. Line numbers refer to the original `.txt` file at commit `6abdd9d13de2f4330ca748082467b9ff6e6cd928` (2023-02-10), not the JSON line numbers. The retained JSON pointer is an exact field lookup. Objects with `value` also contain talent/scepter metadata; only the listed base value is used unless AA explicitly overrides it.

| Source object | Exact field, value, original line |
| --- | --- |
| `items.txt` → `/DOTAAbilities/item_butterfly` | `AbilitySpecial/01/bonus_agility=35` (L8550); `AbilitySpecial/02/bonus_evasion=35` (L8555); `AbilitySpecial/03/bonus_attack_speed=30` (L8560); `AbilitySpecial/04/bonus_damage=25` (L8565) |
| `items.txt` → `/DOTAAbilities/item_maelstrom` | `AbilitySpecial/01/bonus_damage=24` (L10033); `AbilitySpecial/02/chain_chance=30` (L10038); `AbilitySpecial/03/chain_damage=140` (L10043); `AbilitySpecial/04/chain_strikes=4` (L10048); `AbilitySpecial/05/chain_radius=650` (L10053); `AbilitySpecial/06/chain_delay=0.25` (L10058); `AbilitySpecial/07/chain_cooldown=0.2` (L10063) |
| `items.txt` → `/DOTAAbilities/item_echo_sabre` | `AbilityCooldown=6.0` (L5124); `AbilitySpecial/01/bonus_damage=15` (L5145); `AbilitySpecial/02/bonus_strength=13` (L5150); `AbilitySpecial/03/bonus_intellect=10` (L5155); `AbilitySpecial/04/bonus_attack_speed=10` (L5160); `AbilitySpecial/05/bonus_mana_regen=1.75` (L5165); `AbilitySpecial/06/movement_slow=100` (L5170); `AbilitySpecial/08/slow_duration=0.8` (L5180) |
| `items.txt` → `/DOTAAbilities/item_specialists_array` | `AbilityCooldown=12.0` (L17741); `AbilityValues/all_stats=5` (L17755); `AbilityValues/bonus_damage=10` (L17756); `AbilityValues/count=2` (L17757) |
| `items.txt` → `/DOTAAbilities/item_crimson_guard` | `AbilityCooldown=35.0` (L7973); `AbilityValues/bonus_health=250` (L7990); `AbilityValues/bonus_health_regen=12` (L7991); `AbilityValues/bonus_armor=8` (L7992); `AbilityValues/block_damage_melee=75` (L7993); `AbilityValues/block_damage_ranged=50` (L7994); `AbilityValues/block_chance=60` (L7995); `AbilityValues/duration=12` (L7996); `AbilityValues/bonus_aoe_radius=1200` (L7997); `AbilityValues/block_damage_melee_active=75` (L7998); `AbilityValues/block_damage_ranged_active=75` (L7999); `AbilityValues/block_chance_active=100` (L8000) |
| `items.txt` → `/DOTAAbilities/item_ancient_janggo` | `AbilityCooldown=30.0` (L11077); `AbilityValues/aura_movement_speed=20` (L11096); `AbilityValues/bonus_str=7` (L11097); `AbilityValues/bonus_int=7` (L11098); `AbilityValues/bonus_movement_speed_pct=13` (L11100); `AbilityValues/duration=6` (L11101); `AbilityValues/radius=1200` (L11102); `AbilityValues/charges_tooltip=8` (L11103) |
| `items.txt` → `/DOTAAbilities/item_wraith_pact` | `AbilityDuration=25` (L4321); `AbilityValues/pact_aura_radius=900` (L4348); `AbilityValues/damage_penalty_aura=30` (L4349); `AbilityValues/aura_dps=30` (L4350) |
| `items.txt` → `/DOTAAbilities/item_mjollnir` | `AbilityCooldown=35.0` (L9621); `AbilityManaCost=50` (L9625); `AbilityValues/bonus_damage=24` (L9637); `AbilityValues/bonus_attack_speed=70` (L9638); `AbilityValues/static_duration=15.0` (L9639); `AbilityValues/static_chance=20` (L9640); `AbilityValues/static_strikes=4` (L9641); `AbilityValues/static_damage=225` (L9642); `AbilityValues/static_radius=900` (L9645); `AbilityValues/static_cooldown=1.0` (L9646); `AbilityValues/chain_chance=30` (L9647); `AbilityValues/chain_damage=180` (L9648); `AbilityValues/chain_strikes=12` (L9649); `AbilityValues/chain_radius=650` (L9650); `AbilityValues/chain_delay=0.25` (L9651); `AbilityValues/chain_cooldown=0.2` (L9652) |
| `items.txt` → `/DOTAAbilities/item_mask_of_madness` | `AbilityCooldown=16.0` (L10358); `AbilityManaCost=25` (L10362); `AbilityValues/bonus_damage=10` (L10375); `AbilityValues/bonus_attack_speed=10` (L10376); `AbilityValues/lifesteal_percent=24` (L10377); `AbilityValues/berserk_bonus_attack_speed=110` (L10379); `AbilityValues/berserk_bonus_movement_speed=30` (L10380); `AbilityValues/berserk_armor_reduction=8` (L10381); `AbilityValues/berserk_duration=6.0` (L10382) |
| `items.txt` → `/DOTAAbilities/item_basher` | `AbilitySpecial/01/bonus_damage=25` (L8693); `AbilitySpecial/03/bash_chance_melee=25` (L8703); `AbilitySpecial/04/bash_chance_ranged=10` (L8708); `AbilitySpecial/05/bash_duration=1.5` (L8713); `AbilitySpecial/06/bash_cooldown=2.3` (L8718); `AbilitySpecial/07/bonus_chance_damage=100` (L8723) |
| `items.txt` → `/DOTAAbilities/item_radiance` | `AbilityValues/bonus_damage=60` (L8489); `AbilityValues/aura_damage=60` (L8490); `AbilityValues/aura_damage_illusions=35` (L8491); `AbilityValues/evasion=15` (L8493); `AbilityValues/blind_pct=15` (L8494); `AbilityValues/aura_radius=700` (L8495) |
| `npc_abilities.txt` → `/DOTAAbilities/zuus_heavenly_jump` | `AbilityValues/damage=25 50 75 100` (L7337); `AbilityValues/range=700 800 900 1000` (L7345); `AbilityValues/duration=1.6` (L7346); `AbilityValues/move_slow=80` (L7347); `AbilityValues/aspd_slow=100` (L7348); `AbilityValues/cast_slow=50` (L7349) |
| `npc_abilities.txt` → `/DOTAAbilities/doom_bringer_infernal_blade` | `AbilitySpecial/07/shard_bonus_damage=150` (L21183) |
| `npc_abilities.txt` → `/DOTAAbilities/winter_wyvern_arctic_burn` | `AbilitySpecial/13/movement_scepter=25` (L49073) |
| `npc_abilities.txt` → `/DOTAAbilities/storm_spirit_overload` | `AbilityDuration=0.8` (L6509) |
| `npc_abilities.txt` → `/DOTAAbilities/lone_druid_spirit_bear_entangle` | `AbilityCooldown=5.0` (L25356); `AbilityValues/damage=30 40 50 60` (L25362); `AbilityValues/entangle_chance=20` (L25363); `AbilityValues/hero_duration=1 1.6 2.2 2.8` (L25364); `AbilityValues/creep_damage_multiplier=3` (L25365); `AbilityValues/hero_entangle_chance=30` (L25366) |
| `npc_abilities.txt` → `/DOTAAbilities/warlock_golem_flaming_fists` | `AbilityUnitDamageType=DAMAGE_TYPE_PURE` (L11727); `AbilitySpecial/01/damage=40 50 60` (L11737); `AbilitySpecial/02/radius=300 300 300` (L11742) |
| `npc_abilities.txt` → `/DOTAAbilities/warlock_golem_permanent_immolation` | `AbilityUnitDamageType=DAMAGE_TYPE_MAGICAL` (L11759); `AbilitySpecial/01/aura_radius=300` (L11769); `AbilitySpecial/02/aura_damage=30 50 70` (L11774) |
| `npc_abilities.txt` → `/DOTAAbilities/warlock_rain_of_chaos` | `AbilityValues/golem_hp=1400 2300 3200` (L11671); `AbilityValues/golem_dmg=100 150 200` (L11672); `AbilityValues/golem_movement_speed=320 340 360` (L11674); `AbilityValues/golem_hp_scepter=900 1700 2600` (L11683); `AbilityValues/golem_dmg_scepter=75 110 150` (L11688) |
| `npc_abilities.txt` → `/DOTAAbilities/skeleton_king_vampiric_aura` | `AbilityValues/spawn_interval=0.25` (L5657); `AbilityValues/reincarnate_time=3` (L5658) |
| `npc_abilities.txt` → `/DOTAAbilities/skeleton_king_hellfire_blast` | `AbilityDamage=75 90 105 120` (L5554); `AbilitySpecial/01/blast_speed=1200` (L5571); `AbilitySpecial/02/blast_stun_duration=1.1 1.4 1.7 2.0` (L5576); `AbilitySpecial/03/blast_dot_duration=2.0` (L5583); `AbilitySpecial/04/blast_slow=-20` (L5589); `AbilitySpecial/05/blast_dot_damage=20 40 60 80` (L5594) |
| `npc_abilities.txt` → `/DOTAAbilities/undying_tombstone_zombie_deathstrike` | `AbilitySpecial/01/slow=-5` (L28249); `AbilitySpecial/03/health_threshold_pct=40` (L28254); `AbilitySpecial/04/duration=2.5` (L28259); `AbilitySpecial/05/bonus_move_speed=35 40 45 50` (L28264); `AbilitySpecial/06/bonus_attack_speed=50 60 70 80` (L28269) |
| `npc_abilities.txt` → `/DOTAAbilities/oracle_purifying_flames` | `AbilitySpecial/01/damage=90 180 270 360` (L37085); `AbilitySpecial/02/heal_per_second=11.0 22.0 33.0 44.0` (L37090); `AbilitySpecial/04/duration=9.0` (L37100); `AbilitySpecial/05/tick_rate=1.0` (L37105) |
| `npc_abilities.txt` → `/DOTAAbilities/oracle_rain_of_destiny` | `AbilityValues/radius=650` (L37207); `AbilityValues/duration=10` (L37208); `AbilityValues/damage=60` (L37209); `AbilityValues/tick_rate=1.0` (L37214); `AbilityValues/heal_amp=25` (L37215) |
| `npc_abilities.txt` → `/DOTAAbilities/night_stalker_void` | `AbilityValues/damage=80 160 240 320` (L18585); `AbilityValues/duration_day=1.25` (L18590); `AbilityValues/duration_night=2.5 3 3.5 4` (L18591); `AbilityValues/movespeed_slow=-50` (L18592); `AbilityValues/attackspeed_slow=-50` (L18593); `AbilityValues/scepter_ministun=1.0` (L18599) |
| `npc_abilities.txt` → `/DOTAAbilities/dragon_knight_fireball` | `AbilityCooldown=20` (L14712); `AbilityManaCost=100` (L14716); `AbilityValues/radius=350` (L14722); `AbilityValues/damage=75` (L14723); `AbilityValues/duration=8.0` (L14728); `AbilityValues/burn_interval=0.5` (L14729); `AbilityValues/linger_duration=2` (L14730); `AbilityValues/dragon_form_cast_range=1400` (L14731); `AbilityValues/melee_cast_range=600` (L14732) |
| `npc_abilities.txt` → `/DOTAAbilities/troll_warlord_whirling_axes_ranged` | `AbilityValues/axe_width=100` (L31754); `AbilityValues/axe_speed=1500.0` (L31755); `AbilityValues/axe_range=950.0` (L31756); `AbilityValues/axe_damage=90` (L31757); `AbilityValues/axe_slow_duration=2.5 3 3.5 4` (L31762); `AbilityValues/movement_speed=40` (L31767); `AbilityValues/axe_spread=25` (L31768); `AbilityValues/axe_count=5` (L31769); `AbilityValues/AbilityCooldown=9` (L31770); `AbilityValues/AbilityManacost=60` (L31776) |
| `npc_abilities.txt` → `/DOTAAbilities/troll_warlord_whirling_axes_melee` | `AbilityValues/damage=50 100 150 200` (L31818); `AbilityValues/hit_radius=100` (L31823); `AbilityValues/max_range=450.0` (L31824); `AbilityValues/blind_duration=5` (L31826); `AbilityValues/blind_pct=60` (L31831); `AbilityValues/whirl_duration=3.0` (L31832); `AbilityValues/AbilityCooldown=9` (L31833); `AbilityValues/AbilityManacost=50` (L31838) |
| `npc_abilities.txt` → `/DOTAAbilities/enchantress_bunny_hop` | `AbilityCooldown=4` (L17972); `AbilityManaCost=50` (L17976); `AbilitySpecial/01/hop_distance=500` (L17985); `AbilitySpecial/02/hop_duration=0.4` (L17990); `AbilitySpecial/04/attack_targets=3` (L18000); `AbilitySpecial/05/bonus_attack_range=200` (L18005) |
| `npc_abilities.txt` → `/DOTAAbilities/chaos_knight_chaos_bolt` | `AbilitySpecial/01/chaos_bolt_speed=700` (L26696); `AbilitySpecial/02/stun_min=1.25 1.5 1.75 2` (L26701); `AbilitySpecial/03/stun_max=2.2 2.8 3.4 4` (L26707); `AbilitySpecial/04/damage_min=60 90 120 150` (L26713); `AbilitySpecial/05/damage_max=120 180 240 300` (L26718); `AbilitySpecial/08/shard_illusion_duration=6.0` (L26734) |
| `npc_abilities.txt` → `/DOTAAbilities/chaos_knight_phantasm` | `AbilitySpecial/04/outgoing_damage_tooltip=100` (L26891); `AbilitySpecial/06/incoming_damage_tooltip=325` (L26903) |
| `npc_abilities.txt` → `/DOTAAbilities/dazzle_bad_juju` | `AbilityCooldown=15` (L15380); `AbilityManaCost=50 75 100` (L15381); `AbilityValues/armor_reduction=1 2 3` (L15387); `AbilityValues/duration=8 10 12` (L15392); `AbilityValues/radius=1200` (L15393); `AbilityValues/heal_damage=40 50 60` (L15394) |
| `npc_abilities.txt` → `/DOTAAbilities/slark_depth_shroud` | `AbilityCastRange=800` (L31141); `AbilityCastPoint=0.1` (L31142); `AbilityCooldown=75` (L31148); `AbilityManaCost=75` (L31152); `AbilitySpecial/01/duration=3` (L31161); `AbilitySpecial/02/radius=250` (L31166) |
| `npc_abilities.txt` → `/DOTAAbilities/lone_druid_true_form` | `AbilityCooldown=100` (L25165); `AbilityCastPoint=0 0 0` (L25171); `AbilityManaCost=200` (L25175); `AbilitySpecial/01/bonus_armor=8 10 12` (L25184); `AbilitySpecial/02/bonus_hp=500 1000 1500` (L25189); `AbilitySpecial/03/base_attack_time=1.7` (L25195); `AbilitySpecial/05/duration=40` (L25200); `AbilitySpecial/06/transformation_time=1.933` (L25205) |
| `npc_abilities.txt` → `/DOTAAbilities/lone_druid_spirit_bear_demolish` | `AbilitySpecial/01/spell_resistance=33` (L25463) |
| `npc_abilities.txt` → `/DOTAAbilities/lycan_wolf_bite` | `AbilityValues/lifesteal_percent=30` (L24675); `AbilityValues/lifesteal_range=1200` (L24676); `AbilityValues/attack_range=150` (L24677) |
| `npc_abilities.txt` → `/DOTAAbilities/monkey_king_wukongs_command` | `AbilitySpecial/14/scepter_spawn_interval=4` (L37670); `AbilitySpecial/15/scepter_spawn_duration=12` (L37676); `AbilitySpecial/07/attack_speed=1.2` (L37633) |
| `npc_units.txt` → `/DOTAUnits/npc_dota_item_wraith_pact_totem` | `AttackCapabilities=DOTA_UNIT_CAP_NO_ATTACK` (L14621); `MovementSpeed=150` (L14645); `StatusHealth=8` (L14649) |
| `npc_units.txt` → `/DOTAUnits/npc_dota_lone_druid_bear1` | `AttackDamageMin=28` (L15832); `AttackDamageMax=28` (L15833); `AttackRange=150` (L15837); `StatusMana=300` (L15862); `StatusManaRegen=0.5` (L15863) |
| `npc_units.txt` → `/DOTAUnits/npc_dota_wraith_king_skeleton_warrior` | `ArmorPhysical=1` (L12086); `AttackDamageMin=32` (L12092); `AttackDamageMax=37` (L12093); `AttackRate=1.2` (L12095); `AttackRange=115` (L12098); `MovementSpeed=350` (L12116); `StatusHealth=175` (L12121) |
| `npc_units.txt` → `/DOTAUnits/npc_dota_warlock_golem` | `MagicalResistance=33` (L12699); `AttackRate=1.2` (L12706); `AttackRange=225` (L12709) |
| `npc_units.txt` → `/DOTAUnits/npc_dota_unit_undying_zombie` | `AttackDamageMin=33` (L14399); `AttackDamageMax=36` (L14400); `AttackRate=1.6` (L14401); `AttackRange=128` (L14404); `MovementSpeed=375` (L14423); `StatusHealth=2` (L14428) |

## Fixed-commit localization evidence

Source: `references/dota-20230216/abilities_english.txt`, same fixed Valve mirror commit and 2023-02-10 boundary as L5. `items_english.txt` was also searched. Localization describes native behavior; AA explicit overrides still take priority.

| Exact token at `/lang/Tokens/` | Original line | Consequence |
| --- | --- | --- |
| `DOTA_Tooltip_ability_chaos_knight_chaos_bolt_Note0` | 5317 | The damage and stun must vary inversely; implemented one shared random draw, with exact native distribution still pending. |
| `DOTA_Tooltip_ability_chaos_knight_chaos_bolt_shard_description` | 5309 | The granted illusion attacks the bolt target; implemented a target-bound six-second image, AA level 4 override retained. |
| `DOTA_Tooltip_Ability_item_specialists_array_Description` | 13385 | Confirms ranged-only extra targets and no attack modifiers; existing nonrecursive secondary attacks are supported. |
| `DOTA_Tooltip_Ability_item_echo_sabre_Description` | 11410 | Confirms melee-only double attack and slow on both attacks; does not supply the numeric interval or modifier exceptions. |
| `DOTA_Tooltip_ability_enchantress_bunny_hop_Description` | 3528 | Sproink chooses the furthest three enemies within attack range plus 200, uses Impetus attacks and disjoints projectiles. AA changes who moves; attack mana and exact knockback target set remain unresolved. |
| `DOTA_Tooltip_ability_night_stalker_void_Description` | 3675 | Confirms a nighttime mini-stun but provides no numeric duration. Scepter mini-stun 1 second remains inapplicable to normal level-four Void. |
| `DOTA_Tooltip_ability_lone_druid_true_form_Description` | 5050 | Confirms melee transformation plus enhanced Entangle and Demolish; corresponding child state is implemented. |
| `DOTA_Tooltip_ability_slark_depth_shroud_Description` | 6158 | Confirms all allied occupants receive concealment and Shadow Dance effects, supporting the field implementation. |
| `DOTA_Tooltip_ability_dazzle_bad_juju_Description` | 2161 | Confirms per-unit spell-effect armor stacks and active heal/damage. The AA target version and granted level still require resolution. |
| `DOTA_Tooltip_ability_zuus_heavenly_jump_Description` | 1991 | Confirms visible nearest-target selection prioritizing heroes and cast-time slow; hero priority and visibility are now enforced. |
| `DOTA_Tooltip_ability_item_wraith_pact_Description` | 12699 | Confirms physical damage suppression, movable 25-second body, four hero hits and half creep damage; implemented hit-count health matches these rules. |
| `DOTA_Tooltip_ability_warlock_golem_flaming_fists_Description` | 1936 | Confirms extra damage on attacks without mentioning a random proc; implemented every hit, AA patch overrides damage. |

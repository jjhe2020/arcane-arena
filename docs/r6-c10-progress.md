# r6 C10：同击分量、法力盾和追击

C9基线为`1d249fd1c0cf298cb0505643c43a41d9277cdd81`。本批继续230项原作逐条验收，是已验证源码检查点；r6尚未创建tag或发布Release。

## 实际实现

- `src/combat/mana-mirror-acceptance.ts`：Mana Break、Mana Drain、Mana Shield、Meat Hook、Mirror Image及Fragment/Void/Snake/Rip Tide。法力燃烧先于同包主伤，保普通吸血、分裂和单次格挡；法力汲取按100ms整跳、真视与主/子链分别处理。闪烁碎片真实KV为`antimage_mana_overload`，修正原生一级、独立充能与时序；Void限原生三级。钩索冻结射线与返回起点，只碰AA允许的英雄体并连续拉拽；分身有真实隐藏阶段、替换旧家族和共享激流计数，波先削甲再伤害、一个受害者只结算一次。
- `src/combat/mist-flare-acceptance.ts`：Mist Coil、Moon Glaives、Mortimer Kisses、Multishot、Mystic Flare及Solar/Gobble/Spit/Marksmanship。迷雾缠绕自身纯粹非致死伤害与敌方命中抵挡分开，Super真实两队弹体独立释放。月刃保主击暴击快照并允许有界重访。Kisses立即首发、固定落点和原生飞行下限；与Cookie/Spit共享首次来源燃烧时钟。吞吐为普通授予槽，飞行显示跟随真实隐藏乘客。齐射保AA攻击修饰规则并使用实际线性弹体；Flare有真实场域、冻结脉冲分母、英雄优先与普通单位回退，不让无效单位分摊。
- `src/combat/nature-omni-acceptance.ts`：Nature's Attendants、Nature's Call、Nether Swap、Nethertoxin、Omnislash。小精灵逐个随机恢复、允许尸体来源延续；树人使用原生1/2/4模板与AA数值，强化身体选真实greater图集。换位有停止目标动作及具名跳变，无敌目标和熊灵资格独立；毒素先飞行再落地，按半秒暴露与非叠加场域处理。无敌斩只抵挡首斩，保0.15秒无目标宽限、每斩后冻结下次间隔及无敌/虚无跳跃资格。没有错误地把自身root推成外部root禁止施放。
- `src/combat.ts`：声明式同击类型分量、Marksmanship发射PRD快照、目标丢失回调、碰撞前过滤及法力盾阶段。物理分量同类型合包，转换例外分类型结算，攻击接触钩子仍一次。Mana Shield在目标护甲/魔抗/护盾前耗蓝，Frost Shield以符合攻击者资格的generic incoming分量与Golem加算；False Promise/Borrowed Time保余量。其它旧来源分支及原生普通暴击随机起点仍单列开放。

## 配置与真实回归

最终配置hash为`e5dd2ce3bd5a192034c8dc59dd965eb1261347cc5da9f44fa85829490bbf1397`，模拟修订`arena-2026-10-30-c10-r6`。230主技能、83授予、21原生参考、1389等级行、2641参数、18单位、四职业。新增Rip Tide四级、Spit一级、Marksmanship三级，去除不可达Void四级；新增Treant1/2。23域按白名单比较，117旧参数清理，未涉及有效值和经济保持。12表旧样式、行高、冻结均保持；45张QA图及最后6格元信息本地化的数字不变证明见`artifacts/r6-c10-config-validation.json`。

真实旧回归发现两树人从同点出生后互相夹住。现普通行走可选择身体切线方向，每候选重新扫碰撞并受原步长、屏障、Soulbind及转身约束；两体均在原四秒期限内命中，事件输出与主人子账本相符，无出生后的瞬移。该修复不是原生全局寻路或原生转身加速度认证。

真实配对又发现Frost减伤先于法力盾，导致1000伤害只耗140蓝。现先耗350蓝再对300余量减伤，Frost60%为120有效伤害；再加Golem15%易伤为165。实际红测、绿测、before-target观察及旧Dispersion/Frost/Golem专项保留，不能把有限结果扩大为全部伤害顺序。

非数值机制按Wiki核对；仅AA category标签不能证明custom Lua。Mana Drain链接/真视及Mana Shield、Attendants和Omni保护状态按对应历史不可驱散规则执行，AA类别原文与冲突保留为待补证。已确认数值、Super/Gaben和具名自定义没有被现代数值替换。

## 验证与边界

全仓80文件2404项、来源专项44文件1915项通过。155项已开始、75未审；2143条技能要求中1647条有来源与当前结果，496未闭合；61条共用要求中11条未闭合。当前竞技场范围整项通过仍为7项，新增15项均partial。

构建后4182生产资源、浏览器、实际统计、固定账本、UI完整性8/8、旧档恢复通过。另实际购买父技能核验三个新授予槽的原生4/3/1级、中文详情与图标加载；20个真实开发模块桌面/手机画面通过。统计、观察夹具、生产及原作分项证据分别保存于`artifacts/r6-c10-validation.json`，不互相替代。

剩余边界包括AA Snake旧steal词义与原生只恢复、Blink Fragment其它能力耦合、法力分配策略、Riptide共享计数资料冲突、AA齐射分类/压缩Super时钟/角度、Marksmanship历史友军系数、Solar非库存契约、Spit子等级与特殊身体资格、跨来源光环/继承及其它具名项。平面场地以外的视野/树木/高低地分支继续范围外。保留构建大代码块提示，不宣称真机性能或全量原作终验完成。

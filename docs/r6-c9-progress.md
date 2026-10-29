# r6 C9：攻击基数、引导与独立躯体

本批继续230项原作验收。C8基线为`28552fd5bbe30abe55ff1a2d4e004a30f8b2281a`；r6尚未创建tag或发布Release，本批为已验证源码检查点。

## 实现与实际结果

- `src/combat/inner-laser-acceptance.ts`覆盖Inner Fire、Insatiable Hunger、Jingu Mastery、Kraken Shell、Laser。真实击退/强驱散、禁用时零前摇施法、历史普通附加攻击力、独立Jingu计数与石猴、伤害阈值清除、失明和双激光都有具名结果。保留AA数值，不将7.33的基础攻击百分比或7.38的吸血改版反推为2023机制。
- `src/combat/leech-shredder-acceptance.ts`覆盖Leech Seed、Life Break、Life Drain、Lightning Bolt、Lil' Shredder。生命汲取按历史实际伤害恢复，主目标断链后仍可维持其它有效链；友方生命转移、满血转蓝和连线清理分开核验。雷云使用实际施法者及独立16生命NO_ATTACK躯体、命中次数与归属，跳跃生命消耗和固定伤害攻击独立处理。
- `src/combat/living-field-acceptance.ts`覆盖Living Armor、Lucent Beam、Lunar Blessing、Magic Missile、Magnetic Field。全图活体护甲按普通治疗逐秒执行；祝福/战鼓光环及复活后的时钟、真正原生战鼓主动技能、魔法箭命中抵挡/弹跳与动态有效施法距离、磁场内外判定及连续推离有实际结果。官方AA公告明确移除Lucent Gaben小眩晕，保留基础技能的AA控制数值。
- 共用攻击记录在攻击开始冻结主伤基数；Glaives不再被主击偷智、飞行期间加攻或弹速变化回改。图腾主伤乘数、Jingu普通附加攻击力和条件附伤有不同入口；Jingu计入Glaives基数，但不绕过Lil' Shredder固定伤害。暴击数值资格按攻击开始保存，随机试验仍在攻击点；取消攻击/交错随机的原生时点明确列为实际缺失，未宣称完全闭合。
- 实际执行者、itemActive、真实攻击起点、建筑攻击主人范围、隐藏躯体、最短攻击间隔及最大生命专用修饰分别声明。光环循环在引擎复活后继续；该用例不冒称已实现目录中的Reincarnation技能。

## 配置与显示

19个配置域集中迁移，移除83个旧失效参数，另删除魔法箭与公共施法距离重复的弹跳半径。新增真实原生一级Bongo Drums，删除历史最大等级3之外不可达的Wrath等级4；增加Zeus Cloud单位模板。230主技能、80授予技能、21原生参考、1382等级行、2651参数映射、16单位，四职业及经济默认值保持。12张表既有样式、行高、冻结核对通过，新增中文说明与代表截图已检查，工作簿SHA与语义摘要见`artifacts/r6-c9-config-validation.json`。

`scripts/c9-render-smoke.mjs`使用真实`createBattle/stepBattle`，在桌面/手机各检查Laser、Nimbus、Jingu石猴、Magic Missile弹跳和Life Drain主/子链，共10场景。检查真实图集、躯体、连线、模型缩放、位置及渲染不改冻结模拟。高生命静止观察夹具、固定统计账本展示、实际引擎统计、生产检查各自记录；没有用截图替代机制验收。

## 精确边界

Laser的AA未明确最大生命效果、连续缩放乘积仍有待证工作解释；Wukong允许技能清单、历史生命消耗/回光返照/护盾顺序、Shredder AA多重攻击与二次弹道、跨来源光环/延迟账本等继续逐项标记。Life Break穿越当前场地屏障采用窄声明，历史年份证据不足仍待补证。无视野/树木/高低地分支保持范围外，不编造补偿。

原生转身加速度、完整暴击随机试验起点及其它共用未闭合项继续保留。当前140项已开始、90未开始；1866条技能要求中1463条有来源及当前结果，403条未闭合；57条共用要求中11条未闭合。当前竞技场范围整项通过仍为7项。

最终全仓76文件2168项、来源专项40文件1680项通过；构建、4181生产资源/浏览器/实际统计/固定账本/UI完整性8/8/旧档恢复检查通过。配置hash为`f6362cf81754cc942077d9ca9d1626ab0e6df1b142d25bb2c0bf2dc531817cb1`，模拟修订`arena-2026-10-30-c9-r6`，汇总见`artifacts/r6-c9-validation.json`。生产包仍有大代码块提示，未宣称真机性能或全量原作终验通过。

# 历史Dota底层参考

原始数据：Valve游戏包中的KeyValues文件，由SteamTracking/GameTracking-Dota2镜像保存。

- 实际提交：`6abdd9d13de2f4330ca748082467b9ff6e6cd928`，日期 **2023-02-10 01:16:45 UTC**。
- 本目录名称中的20230216指镜像删除解包目录的截止事件，不是文件提交日期。
- [原始提交](https://github.com/SteamTracking/GameTracking-Dota2/commit/6abdd9d13de2f4330ca748082467b9ff6e6cd928)
- 通过已连接GitHub只读工具读取固定提交的原始文件，未使用浮动master作为数值基准。
- `sources.json`记录URL、文件SHA256、Git blob SHA和解析统计。
- `parsed/`保持原始属性字符串、AbilityValues/AbilitySpecial层级、重复字段及平台条件，并附JSON字段路径对应行号。

这些文件不是Ability Arena的修改后游戏脚本，也没有证明与230项AA网页快照属于同一补丁。AA英文快照的明确数值/修改优先。这里只用于核对AA引用的原版子技能、物品和召唤物等缺失字段；采用任何值时必须记录此历史基线和剩余不确定性。不要将2026年的Dota规则不加说明地混入此基线。

完整源文件仅作为本地研究参考，运行发布包只使用实现所需的机制和选定数值，不直接分发该目录。

"""Package the built playable development version without source-art dependencies."""
from pathlib import Path
import json
import zipfile
import hashlib

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
if not (dist / 'index.html').is_file():
    raise SystemExit('Run npm run build first.')
out = root / 'output'
out.mkdir(exist_ok=True)
coverage = json.loads((dist / 'data/mechanics-coverage.json').read_text(encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
revision = coverage['simulationRevision']
revision_tag = revision.rsplit('-', 1)[-1]
# GitHub normalizes non-ASCII asset names; keep the downloadable filename stable.
archive = out / f'ArcaneArena-{version}-{revision_tag}-dev.zip'
prefix = 'ArcaneArena'
notice = '''秘境竞技场 · 0.1 开发构建

双击“启动游戏.cmd”启动游戏，浏览器地址 http://localhost:4173。
此电脑需要 Node.js；当前开发环境已安装。关闭服务窗口可停止游戏服务。
手机横屏可通过此电脑局域网IP:4173访问。

点击商品购买，点击已有技能再点击目标槽位分配/互换。
长按或右键查看说明。拖动英雄布阵。
新技能购买后进入暂存区；暂存满时不能买新技能，同名技能可直接升级。
终极技能图标带内部特殊边框；商店黄色外框表示已拥有。
英雄等级随回合增长，第N回合为N级，晚到场英雄同样使用当前等级。
难度可选AI金币1.0至2.5倍，每0.1一档。
备战不限时，准备后自动战斗；空格暂停，左侧可切换观看速度。
手机底部阵容可横向滑动，查看和操作五名英雄的全部技能槽。
商店每局随机选100项技能；五级开放4/6/6/8/10个商品，3级起有终极技能。
最后两格为God预留位置，当前不可使用。
跨英雄或移入暂存花1金币，暂存装备与同英雄排序免费。
永久层数跟随技能，战斗中调整构筑仍只影响下轮。
手机可切换全屏观战，再一键返回构筑。
本浏览器自动保存对局。不同设备独立存档。

当前构建支持1玩家+7AI完整比赛；230项技能的基础/Super/Gaben均有工作机制。
部分复杂交互、美术编排及严格AA参考对照仍在开发和验证。
这是可玩的开发构建，不代表最终全量首版已通过完成验收。
机制状态详见 dist/data/mechanics-coverage.json。
'''
entries = [(p, f'{prefix}/dist/{p.relative_to(dist).as_posix()}') for p in dist.rglob('*') if p.is_file()]
entries += [(root/'启动游戏.cmd', f'{prefix}/启动游戏.cmd'), (root/'scripts/serve.mjs', f'{prefix}/scripts/serve.mjs')]
for name in [f'{revision_tag}-validation.md', f'{revision_tag}-visual-binding-gaps.md', 'faq-rules.md']:
    document = root / 'docs' / name
    if document.is_file():
        entries.append((document, f'{prefix}/版本说明/{name}'))
notice = notice.replace('0.1 开发构建', f'{version} {revision_tag} 开发构建')
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as z:
    for file, name in entries:
        z.write(file, name)
    z.writestr(f'{prefix}/开始游玩.txt', notice.encode('utf-8'))
with zipfile.ZipFile(archive) as z:
    bad = z.testzip()
    if bad:
        raise RuntimeError(f'Archive CRC failed: {bad}')
report = {'archive': str(archive), 'bytes': archive.stat().st_size, 'fileCount': len(entries)+1,
          'sha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(),
          'version': version, 'simulationRevision': revision, 'configHash': coverage.get('configHash'), 'configuration': coverage.get('configurationCoverage'), 'mechanics': coverage['counts'],
          'strictReferenceVerifiedCount': coverage['strictReferenceVerifiedCount'],
          'crcVerified': True, 'status': 'playable_development_build_not_full_scope_complete'}
(out/'release-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))

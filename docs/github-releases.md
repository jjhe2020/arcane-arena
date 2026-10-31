# GitHub 版本发布

用户已要求：每完成一个版本都推送代码并发布 GitHub Release。后续开发按本流程执行。

## 版本命名

- 正式版本：`v<package.json 的 version>`，例如 `v0.1.1`。
- 开发修订：`v<version>-<package.json 的 releaseRevision>`，当前为 `v0.1.1-r13`。这类 Release 标记为预发布，流程同时核对Excel编译一致性、配置hash、技能统计、商店与等级、UI完整性、侧栏布局、战场入场与观战、PWA 离线/全屏及存档恢复专项。
- 发布修订与模拟修订独立。UI、PWA 等不影响战斗或经济重放的版本只递增 `releaseRevision`，保留 `SIMULATION_REVISION` 及兼容存档；只有影响重放时才同时更新模拟修订。旧版未声明 `releaseRevision` 时，工具兼容读取模拟修订最后一个后缀。
- 发布 tag 必须与该提交中的版本信息匹配。已发布 tag 不移动，每个完成版本使用新的版本号或修订号。

开发修订在 `docs/<修订号>-validation.md` 中记录内容和验证边界，例如 `docs/r4-validation.md`；正式版也必须具备适用的版本说明。

## 本地完成版本

```powershell
npm ci
npm test
npm run build
npx playwright install chromium
```

在另一个终端启动 `node scripts/serve.mjs`，再检查生产构建：

```powershell
node scripts/verify-release.mjs
node scripts/browser-smoke.mjs
node scripts/pwa-smoke.mjs
python scripts/package-release.py
```

打包要求 Python 3.11 或更新版本。ZIP 包包含构建后的游戏、启动器和本地服务脚本，运行时需要 Node.js；不依赖美术来源工程或 `node_modules`。

## 手机 PWA 与离线游玩

将 `dist/` 完整部署到支持 HTTPS 的静态网站。首次联网打开网站后，通过游戏内离线入口下载资源，等到离线就绪再断网；将游戏添加到主屏幕后可从主屏幕启动。全屏按钮扩大完整游戏界面，原有纯观战模式只收起构筑面板，二者独立。

PWA 与 Service Worker 要求安全来源：HTTPS 或电脑本机 `http://localhost`。手机访问电脑的 `http://局域网IP:4173` 可在线游玩，但不具备 PWA 安装及离线缓存条件。ZIP 本身是网站文件与本地启动器，不是 APK 或 iOS 安装包。

手机浏览器对网页全屏的支持不同；不支持时使用“添加到主屏幕”的独立窗口。离线资源与存档属于当前浏览器/设备，清理网站数据会删除它们；首次离线准备与重新下载仍需联网。

更新版本与验证记录，提交所有应纳入的变更后，创建并推送本版本 tag。以下示例仅适用于尚未发布的当前修订；后续必须替换为新版本。

```powershell
git add .
git commit -m "Release v0.1.1-r13"
git push origin HEAD
git tag -a v0.1.1-r13 -m "技能小乱斗 0.1.1 r13 开发构建"
git push origin v0.1.1-r13
```

## 自动发布

`.github/workflows/release.yml` 监听 `v*` tag。它会验证版本、安装依赖、运行测试和生产浏览器检查，再重新打包并发布 GitHub Release。ZIP 和 `release-report.json` 一同上传，报告记录包大小、文件数量、SHA-256、CRC 检查结果及模拟修订。下载包使用 `ArcaneArena-<version>-<修订号>-dev.zip` 英文文件名，避免 GitHub 简化中文附件名；包内保留中文启动器与说明。

工作流使用仓库自带的 `GITHUB_TOKEN`，需要 Actions 可运行以及 `contents: write` 权限；不需要另存个人访问令牌。开发版本自动标记为预发布。发行说明保留对应验证文档中的实际能力与未完成范围。

推送 tag 后，使用 `gh run list --workflow release.yml` 找到本次运行，再运行 `gh run watch <运行ID> --exit-status`。完成后用 `gh release view <tag>` 检查目标 tag、发布状态和两个附件。只有 Release 与附件成功发布后，本版本的发布工作才算完成。

## Actions 不可用时

本地通过同等验证并打包后，用 GitHub CLI 发布。以当前开发版本为例：

```powershell
gh release create v0.1.1-r13 "output/ArcaneArena-0.1.1-r13-dev.zip" output/release-report.json --verify-tag --prerelease --title "技能小乱斗 0.1.1 r13 开发构建" --notes-file docs/r13-validation.md
```

正式版本不使用 `--prerelease`。执行前确认该 tag 没有现存 Release；失败后应先检查远程实际状态，再决定继续上传或修复，避免重复发布和覆盖已发布包。

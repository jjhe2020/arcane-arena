# 项目协作规则

## 集中确认

需要确认的细节应集中提问，不得逐题暂停。先完成不依赖答案的工作，再一次性列出本阶段的问题，并说明各问题阻塞的步骤。每题编号，至少提供 A/B/C 三个有实质区别的选项，其中一个标注“推荐”并说明理由与影响；接受用户用“1A、2C”或自定义答案统一回复。新的非阻塞问题继续累积。

## GitHub 同步与版本发布

用户已授权：当前项目推送到 GitHub，后续每完成一个版本都发布 GitHub Release。此规则持续适用于本项目的后续工作，无需每个版本重复请求发布授权。

1. 每个版本完成实现和必要验证后，更新对应版本说明与验证记录，提交项目并推送到 `origin`。
2. 版本号以 `package.json` 为准；影响战斗或经济重放的改动同时更新 `src/simulation-version.ts` 的 `SIMULATION_REVISION`。开发版本使用 `v<package.version>-<修订后缀>`，例如 `v0.1.0-r4`；正式版本使用 `v<package.version>`。每次发布必须使用新的 tag，不覆盖或移动已发布 tag。
3. 为开发修订维护 `docs/<修订后缀>-validation.md`，记录该版本能力、实际通过的检查与仍存在的边界。不得将阶段可玩包描述为全量终验完成。
4. 运行 `npm test`、`npm run build`；构建后启动 `node scripts/serve.mjs`，运行 `node scripts/verify-release.mjs` 和 `node scripts/browser-smoke.mjs`。受改动影响的其它专项检查也应完成。
5. 确认发布提交包含 `.github/workflows/release.yml`，创建 tag 并推送到 `origin`。工作流会重新验证、打包并上传游戏 ZIP 和 `release-report.json`；开发 tag 自动标记为预发布。具体命令见 `docs/github-releases.md`。
6. 跟进该 tag 的 Actions 直到完成，核实 GitHub Release 指向正确提交、ZIP 与校验报告附件可读，再向用户报告版本发布完成并提供链接。失败时修复并继续完成；不能只推送源码或 tag 就声称 Release 已发布。
7. GitHub Actions 不可用时，可在通过同等检查后使用 `python scripts/package-release.py` 和 `gh release create` 发布同一版本，并核对附件。不要覆盖已发布版本，不要提交凭据或本机构建依赖。

## 当前项目边界

项目为 TypeScript + Vite + Three.js 网页游戏。已导入的 `public/` 运行资源应随源码提交；`node_modules/`、`dist/` 和 `output/` 由本地或 CI 生成，不提交。素材导入脚本依赖独立美术来源项目，常规构建及 CI 使用仓库内现成资源，不要求访问本机 `E:` 盘。

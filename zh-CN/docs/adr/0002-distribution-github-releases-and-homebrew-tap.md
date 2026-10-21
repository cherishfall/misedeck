# 仅通过 GitHub Releases 分发，未签名

> [English](../../../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)

> **状态（2026-10）：** 已接受。GitHub Releases 已实现（`release.yml`），并且是**唯一**的分发渠道。v1 **不提供 Homebrew tap** —— 没有 tap 仓库、没有 cask、CI 中没有任何 tap 发布步骤。tap 是 1.0 之后（post-1.0）的选项（issue #263）。

v1 只在 GitHub Releases 上分发未签名二进制：每个 tag 对应一个 Release，包含 macOS `.dmg`、Windows NSIS 安装包、Linux `.deb` / `.rpm` / `.AppImage`，以及一份覆盖全版本的 `SHA256SUMS`。不做 Apple 公证（$99/年），不做 Windows 代码签名，中间也没有包管理器。用户自己下载文件，并自行处理 Gatekeeper 或 SmartScreen（README → 安装）。

**为什么 v1 不做 tap。** tap 意味着第二个仓库，加上每次发版的推送：每个 tag 都要改 cask 版本、算校验和，还要一个持有该仓库写权限 token 的 CI job。这些都不难，但每一件都可能独立于用户真正下载的那个 Release 出错 —— 而半成品状态已经造成了实际损害：release 模板里写着 `brew install --cask cherishfall/tap/misedeck`，可那个 tap 从未存在，照做的每个 macOS 用户都得到 404。一个能用的渠道胜过两个、其中一个是空头支票。

## 考虑过的选项

- **自托管 Homebrew tap（`cherishfall/homebrew-tap`）发布 cask。** 推迟到 **post-1.0**，不是否决。它需要 tap 仓库、每次发版都更新的 cask，以及一个对第二个仓库有写权限的 CI 步骤 —— 那是一块需要维护的分发面，而 v1 的任务是把应用本身做扎实。等发版节奏稳定后再议。
- **把 cask 提交到官方 `homebrew-cask` 仓库。** 同样推迟到 post-1.0：它受该仓库的知名度门槛（约 50 stars）限制，所以无论其他条件如何，首个版本都够不到。

## 后果

- 首次启动需要右键 → 打开（macOS Gatekeeper 隔离机制）；这必须写进 README。
- 被列入 mise 官方文档（community projects）以及双语 README 关键词是主要的发现渠道；产品命名为 **MiseDeck**（GitHub 仓库已更名为 `cherishfall/misedeck`；GitHub 会保留从旧名 `cherishfall/mise-ui` 的重定向）。SEO 说明：名称匹配只是次要因素 —— 文档收录、GitHub topics 和双语 README 关键词才是大头。
- **三个名字，一次定死（#250）。** 显示名 `MiseDeck`；slug `misedeck`，用于仓库、npm 包和 cargo 二进制 —— 单字复合品牌保持一个 token，就像 GitHub 的仓库叫 `github` 而不是 `git-hub`（Spring Boot 需要 `spring-boot` 只是因为它品牌本身就是两个词带空格）；bundle identifier `io.github.cherishfall.misedeck` —— 这是 GitHub 官方文档给「没有自有域名、托管在 GitHub 上」的项目规定的写法，写成 `com.github.*` 等于宣称 github.com 的命名空间。identifier 从第一个公开版本起冻结：macOS 的偏好、钥匙串、隐私授权，以及 Windows 的卸载项都按它分目录，事后再改等于让每个用户看到一次「全新安装」。

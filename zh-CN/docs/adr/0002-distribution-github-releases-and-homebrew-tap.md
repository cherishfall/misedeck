# Distribution via GitHub Releases and own Homebrew tap, unsigned

> [English](../../../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)

> **状态（2026-09）：** 已接受。GitHub Releases 分发已实现（`release.yml`）；自托管 Homebrew tap **尚未实现** —— CI 中没有任何 tap 发布逻辑。

v1 以未签名二进制发布在 GitHub Releases 上，并配合自托管的 Homebrew tap（`cherishfall/homebrew-tap`）。不做 Apple 公证（$99/年），不做 Windows 代码签名。提交到官方 `homebrew-cask` 仓库推迟到项目达到其知名度门槛（约 50 stars）之后；tap 不需要任何形式的审批。

## Consequences

- 首次启动需要右键 → 打开（macOS Gatekeeper 隔离机制）；这必须写进 README。
- 被列入 mise 官方文档（community projects）以及双语 README 关键词是主要的发现渠道；产品命名为 **MiseDeck**（GitHub 仓库已更名为 `cherishfall/misedeck`；GitHub 会保留从旧名 `cherishfall/mise-ui` 的重定向）。SEO 说明：名称匹配只是次要因素 —— 文档收录、GitHub topics 和双语 README 关键词才是大头。
- **三个名字，一次定死（#250）。** 显示名 `MiseDeck`；slug `misedeck`，用于仓库、npm 包和 cargo 二进制 —— 单字复合品牌保持一个 token，就像 GitHub 的仓库叫 `github` 而不是 `git-hub`（Spring Boot 需要 `spring-boot` 只是因为它品牌本身就是两个词带空格）；bundle identifier `io.github.cherishfall.misedeck` —— 这是 GitHub 官方文档给「没有自有域名、托管在 GitHub 上」的项目规定的写法，写成 `com.github.*` 等于宣称 github.com 的命名空间。identifier 从第一个公开版本起冻结：macOS 的偏好、钥匙串、隐私授权，以及 Windows 的卸载项都按它分目录，事后再改等于让每个用户看到一次「全新安装」。

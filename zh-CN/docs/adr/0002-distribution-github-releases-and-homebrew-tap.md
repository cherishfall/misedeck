# Distribution via GitHub Releases and own Homebrew tap, unsigned

> [English](../../../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)

v1 以未签名二进制发布在 GitHub Releases 上，并配合自托管的 Homebrew tap（`cherishfall/homebrew-tap`）。不做 Apple 公证（$99/年），不做 Windows 代码签名。提交到官方 `homebrew-cask` 仓库推迟到项目达到其知名度门槛（约 50 stars）之后；tap 不需要任何形式的审批。

## Consequences

- 首次启动需要右键 → 打开（macOS Gatekeeper 隔离机制）；这必须写进 README。
- 被列入 mise 官方文档（community projects）以及双语 README 关键词是主要的发现渠道；产品命名为 **MiseDeck**（GitHub 仓库已更名为 `cherishfall/misedeck`；GitHub 会保留从旧名 `cherishfall/mise-ui` 的重定向）。SEO 说明：名称匹配只是次要因素 —— 文档收录、GitHub topics 和双语 README 关键词才是大头。

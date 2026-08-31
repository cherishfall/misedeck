# MiseDeck v<version>

[misè](https://mise.jdx.dev) 的忠实 GUI 客户端。跨平台（macOS 优先打磨，Windows / Linux 为 beta）。

> **寻找你语言的 README？** [English](../README.md) · [简体中文](../zh-CN/README.md)

## 本期要点

完整变更日志见 README：[CHANGELOG](../zh-CN/CHANGELOG.md)（在 #32 落地之前暂存于双语 README 中）。

## 安装

### macOS

下载 `.dmg`，打开后将 MiseDeck 拖入 Applications。

> **首次启动（未签名）**：二进制**未做 Apple 公证**（参见
> [ADR-0002 — 通过 GitHub Releases 与自托管 Homebrew tap 分发，未签名](../zh-CN/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。
> macOS Gatekeeper 会拦截首次打开。在 Applications 中**右键**该应用 →
> **打开** → 确认即可。后续启动不再拦截。
> Homebrew 用户：自托管 tap `cherishfall/homebrew-tap` 提供的 cask
> 也带同样的提示。

### Windows（beta）

下载 `.exe` 安装包并运行。

> **SmartScreen（未签名）**：二进制**未做代码签名**（参见上面同一份
> ADR-0002）。Windows SmartScreen 会显示"Windows 已保护你的电脑"——
> 点击**更多信息** → **仍要运行**。本版本中 Windows / Linux 构建标记
> 为 **beta**。

### Linux（beta）

按发行版选择对应格式。三种格式均附在下方。

- `.deb` —— Debian / Ubuntu
- `.rpm` —— Fedora / RHEL
- `.AppImage` —— 便携，无需安装

安装后，从应用启动器或终端运行 `misedeck`。

## Gatekeeper / SmartScreen 说明

MiseDeck v1 在所有平台上**均为未签名**分发，这是有意的设计选择。详见
[ADR-0002 — 通过 GitHub Releases 与自托管 Homebrew tap 分发，未签名](../zh-CN/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)。
代码签名与 Apple 公证在 v1 中超出范围；等项目跨过知名度门槛再重新评估。

如果 macOS 或 Windows 的安全提示拦截了启动，请按上面各平台的步骤操作。
这是预期行为，不是 bug。

## 校验

下方附 `SHA256SUMS` 文件。安装前请校验：

```sh
# macOS / Linux
shasum -a 256 -c SHA256SUMS

# Windows (PowerShell)
Get-FileHash -Algorithm SHA256 .\<你下载的文件>
```

将 `SHA256SUMS` 中对应文件的哈希与命令输出比对。

## 完整变更日志

见双语 README 中的 [CHANGELOG](../zh-CN/CHANGELOG.md)，
以及本 tag 与上一个 tag 之间的提交历史。

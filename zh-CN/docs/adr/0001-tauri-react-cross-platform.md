# Tauri 2 + React/TS, cross-platform with macOS polished first

> [English](../../../docs/adr/0001-tauri-react-cross-platform.md)

> **状态（2026-11）：** 已接受；下文的一个后果已被事实超越。「Windows/Linux 构建由 CI 打包并带 beta 标签」描述的是 beta 时代——Windows 界面此后已在真实硬件上完整走通（2026-10-22/23，记录于 docs/feedback/windows-hardware-verification.md 与 conventions.md → Cross-platform）；Windows x64 仍标 beta 是出于诚实而非缺少验证。决策本身不变。

MiseDeck 使用 Tauri 2（轻量 Rust 外壳）和 React/TypeScript 前端构建，从单一代码库面向 macOS、Windows 和 Linux。该方案在原生 SwiftUI 和 Electron 中胜出。

## 考虑过的选项

- **SwiftUI (native macOS)**: 原生质感最好，但维护者处于产品角色，所有代码都由 LLM 编写；LLM 的输出质量以及构建/验证循环在 TS/React 上明显优于 Swift，而且目标中的"极客风格"自定义视觉设计是 Web 技术的强项，而非 SwiftUI 的强项。
- **Electron**: 生态最大，但运行时沉重，且在系统工具类应用上口碑不佳。

## 后果

- 代码从第一天起就按跨平台编写（路径和进程生成一律走 Tauri/Rust API，绝不做 macOS 专属的假设）。
- v1 仅在 macOS 上做打磨和人工验证；Windows/Linux 构建由 CI 发布并标注 beta，通过社区反馈逐步收敛。
- 签名：初期所有平台都不签名（见 ADR-0002）。

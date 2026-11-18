# Tauri 2 + React/TS, cross-platform with macOS polished first

> [简体中文](../../zh-CN/docs/adr/0001-tauri-react-cross-platform.md)

> **Status (2026-11):** accepted; one consequence below has been overtaken by events. "Windows/Linux builds ship from CI with a beta label" described the beta era — the Windows surface has since been exercised end-to-end on real hardware (2026-10-22/23, recorded in docs/feedback/windows-hardware-verification.md and conventions.md → Cross-platform), and Windows x64 remains a beta label by honesty, not by absence of verification. The decision itself stands.

MiseDeck is built with Tauri 2 (thin Rust shell) and a React/TypeScript frontend, targeting macOS, Windows, and Linux from one codebase. Chosen over native SwiftUI and Electron.

## Considered Options

- **SwiftUI (native macOS)**: best native texture, but the maintainer works in a product role with all code written by LLMs; LLM output quality and the build/verify loop are significantly better for TS/React than Swift, and the desired "geek-style" custom visual design is a strength of web tech, not of SwiftUI.
- **Electron**: largest ecosystem, but heavy runtime and poor reputation for system-tool apps.

## Consequences

- Code is written cross-platform from day one (paths and process spawning go through Tauri/Rust APIs, never macOS-only assumptions).
- v1 is polished and manually verified on macOS only; Windows/Linux builds ship from CI with a beta label and converge via community reports.
- Signing: none initially on any platform (see ADR-0002).

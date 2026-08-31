# MiseDeck — 前端

> [English](../../misedeck/README.md)

[MiseDeck](https://github.com/cherishfall/misedeck) 的 React + Tauri 2 前端。

## 开发

```bash
# 在本目录下
npm install
npm run tauri dev      # 打开桌面应用
```

## 验证

```bash
npm run ci             # typecheck + i18n 对等守门 + 生产构建
```

`npm run ci` 是绿门。它按以下顺序运行：

1. `npm run typecheck` —— `tsc --noEmit`。
2. `npm run lint:i18n` —— `en.json` 与 `zh-CN.json` 必须有相同的键集合。
3. `npm run build` —— `tsc --noEmit && vite build`。

## i18n

UI 文案位于 `src/i18n/en.json` 和 `src/i18n/zh-CN.json`，通过
`react-i18next` 路由。规范的键目录是 `src/i18n/keys.ts`。
语言切换器位于 `src/components/LanguageSwitcher/`。
完整规范见 [docs/agents/i18n.md](../../docs/agents/i18n.md)
（或 [简体中文](../../zh-CN/docs/agents/i18n.md)）——命名、
如何新增字符串、检测链路、错误码契约。

## Tauri + React + Typescript（脚手架原 README）

This template should help get you started developing with Tauri, React and Typescript in Vite.

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

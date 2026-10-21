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
npm run ci             # 完整的前端闸门：类型检查、测试、全部 lint 守门、生产构建
```

`npm run ci` 是绿门。它按以下顺序运行：

1. `npm run typecheck` —— `tsc --noEmit`。
2. `npm run lint:eslint` —— 仅启用 React Hooks 两条规则（`rules-of-hooks`、`exhaustive-deps`），且要求零警告。
3. `npm run test` —— 单元测试（`tsx --test "src/**/*.test.ts"`）。
4. `npm run lint:i18n` —— `en.json` 与 `zh-CN.json` 必须有相同的键集合，且每个 `t("…")` 调用点都必须指向已知键。
5. `npm run lint:i18n-concat` —— 译文不得与其他字符串拼接；完整句子放在资源文件里。
6. `npm run lint:css-tokens` —— 每个 `var(--*)` 引用必须能解析到已定义的 token，且每个已定义的 token 必须在 `src/` 中被引用。
7. `npm run lint:css-font-size` —— 字号来自字号 token，不得写临时 `px` / `rem`。
8. `npm run lint:css-spacing` —— padding / margin / gap 来自间距 token。
9. `npm run lint:css-tracking` —— 字距来自 tracking token。
10. `npm run lint:i18n-ellipsis` —— 按钮文案不以 `…` 结尾（输入占位符与进行中文案除外）。
11. `npm run lint:command-hint` —— 命令提示只展示用户真能输入的命令，且走共享组件。
12. `npm run lint:install-echo-parity` —— UI 展示的引导安装命令与 Rust 执行器实际 spawn 的命令，按平台一致。
13. `npm run lint:argv-parity` —— 工具页的 TS argv 构造器与 `src-tauri/src/mise.rs` 按共享用例表逐项一致。
14. `npm run lint:modal-focus` —— 任何地方都不得出现 `autoFocus`（初始焦点由共享对话框的 `focusTarget.ts` 决定）；只有一套 modal 实现。
15. `npm run lint:nested-interactive` —— 交互控件不得嵌套在另一个交互控件内。
16. `npm run lint:page-layout` —— 页面的 padding、宽度与居中留在 `PageShell`。
17. `npm run build` —— `tsc --noEmit && vite build`。

这里只覆盖前端。Rust 检查（`cargo check`、`cargo test`）在 `ci.yml` 中运行；完整闸门见 [docs/agents/ci.md](../../docs/agents/ci.md)。

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

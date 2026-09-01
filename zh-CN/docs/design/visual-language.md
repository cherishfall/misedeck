# 视觉语言

> [English](../../docs/design/visual-language.md)

MiseDeck 界面的设计系统基础。在 issue #37 中重写：首个设计冲刺（#33）的黑客 HUD 美学被废弃，视觉语言改为**派生自 [mise.jdx.dev](https://mise.jdx.dev)** —— MiseDeck 在浅色与深色两个主题下都读作 mise 家族的一员（product-logic 策略 6「视觉继承」）。实现为 `misedeck/src/tokens.css` 中的 token；所有 UI 工单的颜色、字体、动效都从这里推导——不允许临时发明。

## 原则

1. **品牌继承。** 两个主题都遵循 mise.jdx.dev 的观感：浅色为暖羊皮纸，深色为暖炭黑，品牌色为酒红/玫瑰。从 mise 官网过来的用户应感到这是同一个产品，而不是别的东西的换皮。
2. **等宽字体是数据的声音。** 版本号、路径、命令、日志、徽章使用 JetBrains Mono —— 与 mise 官网代码所用字体相同。展示（Display）字体承载编辑式衬线签名；UI 字体保持安静。
3. **扁平、安静。** 实心表面、1px 暖中性边框、8px 圆角。无辉光、无半透明堆叠、无动画装饰。让颜色自己说话。
4. **从第一天起就有双主题。** 深色与浅色是同一组 token 槽位上设计出的对位——绝不是简单反色。两者默认都跟随系统偏好。

## 主题

主题*设置*为 `system` / `light` / `dark`（默认 `system`），由 `ThemeProvider`（`src/state/themeContext.tsx`）持久化在 `localStorage("misedeck.theme")`。*解析后*的主题（`light` | `dark`）驱动 `html[data-theme]`；`index.html` 中的内联引导脚本在首次绘制前完成设置，两个主题都不会闪变。Token 取值：深色为 `:root` 默认值；浅色覆盖位于 `[data-theme="light"]`。`color-scheme` 随主题设置，使原生组件（滚动条、表单控件）保持一致。

## 色彩

所有颜色都是 CSS 自定义属性；组件只消费语义名。调色板取值派生自 mise.jdx.dev 的自定义 VitePress 主题。

| Token | 深色 | 浅色 | 角色 |
|---|---|---|---|
| `--void` | `#141010` | `#FDF8F3` | 应用背景 —— 暖近黑 / 羊皮纸 |
| `--hull` | `#1C1614` | `#FFFFFF` | 面板表面基色 |
| `--beam` | `#C75B7A` | `#8B2252` | 品牌强调色（mise 玫瑰/酒红）—— 激活态、焦点、链接 |
| `--ice` | `#9E9288` | `#7D7068` | 次级信息 —— 标签、日志前缀、安静的元数据 |
| `--flare` | `#C5975B` | `#9A7245` | 注意 —— 过时版本、警告 |
| `--breach` | `#C44536` | `#C44536` | 破坏性 / 错误 —— 陶土红 |
| `--grove` | `#8FA86E` | `#6B7F4E` | 成功 —— 已安装 / 就绪 / 正常 —— 橄榄绿 |
| `--text` | `#EDE6DF` | `#2A1F1A` | 主文本 |
| `--dim` | `#C9BFB5` | `#5A4D42` | 次级文本、非激活图标 |

派生色（由上述 token 通过 `color-mix` 计算，绝不硬编码）：

- `--panel`：实心 `hull` —— 面板填充
- `--line`：`text` 的 16% —— 默认边框与分隔线（中性暖色，不带品牌色）
- `--line-strong`：`text` 的 34% —— 强调边框
- `--beam-soft`：`beam` 的 60% —— 强调边缘（激活导航、主按钮边框）
- `--tint-{info,success,warning,danger}` 及 `-bg` 变体：状态组件（Banner、Badge、Panel 色调）的着色边框/淡洗

语义纪律：

- **beam** 标记*当前状态*（激活版本、选中导航、焦点），并承载品牌色。
- **flare** 标记*可行动的漂移*（有更新版本、警告）。过时永远渲染为升级路径 `22.11.0 ▹ 22.20.0`，绝不只用颜色表达。
- **breach** 只用于破坏性操作与真实错误。
- **grove** 只用于成功/就绪状态。
- 任何地方都不用 `text-shadow` 辉光；强调来自颜色与字重，而非发光。

## 字体排印

| 角色 | 字体 | 用途 |
|---|---|---|
| Display | Cormorant Garamond 500–600，正常大小写，无字距 | 页面标题、wordmark（斜体） |
| UI / 导航 | Space Grotesk 400–600 | 导航项、按钮、正文 |
| 数据 | JetBrains Mono 400–600 | 版本、路径、命令、日志、徽章、小节标签（大写，字距 ≈ .18em） |

- 衬线 display 字体是 mise.jdx.dev 的编辑式签名 —— 只花在标题与 wordmark 上，绝不用于数据或控件。
- zh-CN：display 文本回退到 `Songti SC` / `SimSun`（中文衬线），UI 文本回退到 `PingFang SC` / `system-ui`；Latin 数据保持 JetBrains Mono。
- 基准字号 14px，数据 11–13px，小节标签 10px，display 26px。无流式字号；桌面应用密度。
- 小节眉签写作 `▸ MISE / TOOLS` —— 等宽、大写、带字距、`--ice`。

## 布局

界面框架（侧边栏、目录指示条、执行面板的位置）由 `docs/design/product-logic.md` 管辖；本文档管辖框架内部的表面。

- 面板：实心 `--panel` 填充，1px `--line` 边框，8px 圆角。无背景模糊，无角落装饰。
- 间距基于 4px 网格；常用间距 14 / 16 / 22 / 26px。
- 无背景装饰：应用背景是平坦的 `--void`。层级（弹层）只用一道派生自 `--void` 的安静投影表达。

## 动效

系统中只存在两种环境动效：

1. `flare`/`breach` 状态点上的注意力脉冲（柔和的透明度/缩放呼吸，≈1.6s）。
2. 日志光标闪烁（≈1.1s 阶跃）。

其余全部为 ≤120ms ease-out 状态变化（hover、焦点、面板滑动）。所有环境动效在 `prefers-reduced-motion` 下禁用。如果某个界面需要第三种环境动画，那是设计错了，而不是规则错了。

## 护栏（是什么让它保持在 mise 家族内）

- 无辉光效果（text-shadow / box-shadow 发光）、无玻璃拟态、无动画渐变线、无角标 —— HUD 词汇已全部退役。
- 无冷蓝灰调色板；两个主题的表面都是暖色（羊皮纸 / 炭黑）。
- 无科幻或噱头展示字体；性格来自衬线 display 字体 + 等宽数据。
- 产品 UI 中无装饰性编号（01/02/03），无 emoji 图标；符号为几何字形（▸ ▹）。
- 浅色主题是羊皮纸，不是白色企业换皮：暖色表面、酒红强调色、灰褐次级文本。

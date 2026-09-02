# MiseDeck beta4 视觉审查报告

> 审查基准：`docs/design/visual-language.md`（#37 重写版，mise.jdx.dev 官网风）+ web-design-guidelines / frontend-design 技能框架。
> 素材：`docs/screenshots/beta4-audit/` 16 张截图（浅/深 × 7 页 + 收起态 ×2 + 英文工具页）。对比度结论均有像素采样支撑。
> 已排除 `beta4-feedback-scratch.md` 已定稿的 Issue 1–8。

## P0 — 明显缺陷

### V1. 窗口标题栏不随应用主题
- 证据：全部 `dark-expanded-0*` / `dark-collapsed-tools`——内容区已是暖炭 `#131010`，标题栏仍是亮灰白（采样 244,243,243）；浅色下同为冷灰，与羊皮纸 `#FDF8F3` 不融。
- 违反：「Two themes from day one — never an inversion」「surfaces are warm in both themes」。与 Issue 3（去跟随系统、全手动）叠加后更糟：用户手动选深色时窗口 chrome 永远停在系统浅色。
- 建议：Tauri 侧把 NSWindow appearance/背景色绑定到 resolved theme，或 overlay 自绘标题栏。

## P1 — 应该改

### V2. 实心 accent 按钮两主题对比度均不达标，填充色非规范 token
- 采样：深色填充 `#6F3D4A`+近黑文字 → 2.2:1；浅色 `#B8879A`+近白 → 2.85:1（均需 ≥4.5:1）。规范 `--beam` 应为 `#C75B7A`（深）/`#8B2252`（浅），实际是规范外变体。
- 建议：回归 `--beam` 原值；文字深色用 `--text`、浅色用白/`--void`。

### V3. 工具表格表头与列错位
- 「最新」表头下方是「—」；「操作」表头正下方是版本输入框；切换/卸载按钮上方无表头。三主题截图同。
- 建议：输入列补表头（如「切换到版本」），按钮归入「操作」列，或用 grid 严格同轨。

### V4. mono 数据列逐字符折行，行高失控（系统性）
- env 页值列路径断成 3–5 行；诊断页版本值折行、「版本」标签被挤成竖排；en-tools 的 `oracle-8` 折行、路径断词。不止英文页。
- 建议：数据单元格 nowrap + 省略截断 + tooltip/展开，列宽重排；诊断 label 列加宽。

### V5. 诊断页「健康检查」面板网格配对混乱
- SHELL 行同时出现「已激活」文字和最右「未激活」badge；右列 badge 与左列 key 语义对不上，读不出状态属于谁。
- 建议：严格 key→value（+紧随其后 badge）的单行列表，别用双列网格。

### V6. Registry/设置 badge 强制大写，篡改数据原貌
- `vfox:mise-plugins/vfox-1password` 被渲染成全大写；设置页 `BOOLEAN` 同理。uppercase+宽字距 mono 只属于 section label，数据应原样（后端名大小写敏感）。
- 建议：数据 badge 保留原始大小写、去字距。

### V7. 「全部升级」在全部已最新时仍为可点状态
- 建议：无可升级项时 disabled；有项时按钮文案带计数。

## P2 — 可选打磨

### V8. 空状态/表单卡片用虚线边框
- 规范只允许 solid 1px `--line` + 8px 圆角。建议实线或去边框留底色差。

### V9. eyebrow 面包屑重复
- 页眉已有「MISE / 预览」，空状态卡片内原样重复；诊断页每个 section 重复「MISE / 诊断」。section eyebrow 应表达 section 名或省略。

### V10. 设置页行内编辑常驻且文案含糊
- 「取消设置」读起来像 cancel 实为 unset；无改动时「保存」也可点。建议「取消设置」→「移除」；保存仅 dirty 时启用。

### V11. 中文孤字与行内代码断行
- 预览页描述末尾孤字「录。」独行；任务空状态 `` `mise tasks ls` `` 断成两行。建议 code span nowrap，文案微调避免孤字。

### V12. 英文状态句全大写 mono，中文是正常句
- 「ALL INSTALLED TOOLS ARE UP TO DATE.」vs「所有已安装工具均为最新版本。」两语言样式不一致；收录进 Issue 7「全站清旧极客风」清单，不单独立项。

### V13. 诊断页警告 banner 是英文原始输出且未按规范渲染升级路径
- 规范明确「Outdated 永远渲染为升级路径 `22.11.0 ▹ 22.20.0`」。建议解析后渲染 `2026.8.14 ▹ 2026.9.0` + 本地化引导语。

### V14. 工具表每行版本输入框观感像 disabled 且过宽
- 灰底 + 预填当前版本、约 300px 宽，看不出可编辑；与「切换」按钮联动关系不明。建议收窄至 ~120px、可编辑态明确，或改下拉。

### V15. 收起态下语言/主题控件完全消失、无入口
- Issue 2 定了「直接隐藏」，但「隐藏后功能不可达」后果未讨论。建议收起态保留图标入口（地球/日月图标按钮）。

### V16. 单字母导航图标语义牵强
- P/T 尚可，K=任务（tasK）、X=插件 与中文名无关，X 易误读为「关闭」。Issue 2 的 tooltip 兜底，字母体系本身在视觉改版时重审（或换几何图形图标）。

## 无法从静态截图评估、建议补验

hover/focus/active 态、动效时长（≤120ms）、prefers-reduced-motion、loading/error 态样本、语言下拉 overlay 样式——建议下一轮动态审查覆盖。
（`en-tools.png` 整窗 unfocus 致 traffic light 变灰，属采集 artifact。）

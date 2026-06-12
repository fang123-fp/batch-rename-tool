# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-12
- Primary product surfaces:
  - 本地浏览器中的批量文件重命名单页工具
- Evidence reviewed:
  - `/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/README.md`
  - `/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/index.html`
  - `/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/styles.css`
  - `/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js`
  - 用户提供参考图：`/var/folders/tc/k9rw6hdx5b94npmrp87dsc_r0000gn/T/codex-clipboard-98c5e521-08cd-49aa-a5f1-3d69ec9b3c75.png`

## Brand
- Personality:
  - 冷静、专业、轻编辑台感
  - 简洁干净，不做花哨可视化
  - 带一点 editorial 产品页气质，而不只是普通工具面板
- Trust signals:
  - 清晰的步骤编号
  - 明确的状态反馈
  - 文件不会被原地改写的说明
- Avoid:
  - 过重玻璃拟态
  - 大面积高饱和色块
  - 同屏过多按钮导致流程分叉

## Product goals
- Goals:
  - 把流程改成用户明确要求的四步：上传文件 -> 配置字段 -> 设置命名模板 -> 点击“批量替换名称”后再开始读取文字
  - 把“从内容重新读取”从文件列表区移除，避免与主流程冲突
  - 让页面看起来更像一块干净的操作工作台，而不是功能堆叠面板
- Non-goals:
  - 不重做 OCR / 后端识别算法
  - 不引入多页路由或复杂导航
  - 不改变 ZIP 导出这一最终交付方式
- Success signals:
  - 新用户能按页面编号顺序完成一次批量重命名
  - 上传后不会自动开始识别
  - 主 CTA 明确只有一个：“批量替换名称”

## Personas and jobs
- Primary personas:
  - 需要批量整理证书、报告、检测文件名的业务人员
  - 会做少量手工修正，但不想理解技术细节的办公室用户
- User jobs:
  - 上传多份文件
  - 配字段并确认命名模板
  - 在统一时机触发识别与命名
  - 下载已重命名结果包
- Key contexts of use:
  - 桌面浏览器
  - 局域网 / 本地服务场景
  - 处理中英混排文件和 PDF 证书

## Information architecture
- Primary navigation:
  - 单页，无顶部导航
- Core routes/screens:
  - 首页即主工作台
- Content hierarchy:
  - 顶部说明与流程概览
  - 四步操作区
  - 文件结果表格
  - 最终导出区

## Design principles
- Principle 1:
  - 一个阶段一个主动作，减少“边上传边自动跑”的不确定感
- Principle 2:
  - 主信息高对比，辅助信息弱化，避免视觉噪音
- Tradeoffs:
  - 为了流程清晰，牺牲一部分“自动化即刻反馈”
  - 保留表格编辑能力，但让读取触发集中到模板区

## Visual language
- Color:
  - 以象牙白、浅沙色、炭黑为主底色
  - 主强调色改为低饱和陶土橙
  - 次强调色使用鼠尾草绿，只做辅助点缀
- Typography:
  - 标题使用带一点编辑感的衬线字体
  - 正文和控件使用清晰的无衬线字体
- Spacing/layout rhythm:
  - 大区块留白充足
  - 使用 16 / 24 / 32 的节奏
- Shape/radius/elevation:
  - 中等偏大的圆角
  - 更依赖纸张感描边和柔和阴影，不依赖玻璃感
- Motion:
  - 仅保留轻微进入与 hover 反馈
- Imagery/iconography:
  - 不依赖插画
  - 用编号和标签承担导视

## Components
- Existing components to reuse:
  - 文件拖拽上传区
  - 字段编辑列表
  - 模板输入框
  - 结果表格
- New/changed components:
  - 顶部流程概览卡
  - 模板区主 CTA：“批量替换名称”
  - 更简洁的状态摘要区
  - 结果表格中的“预览名称”展示
  - 分区级微色彩区分，但控制在低饱和范围内
- Variants and states:
  - 主按钮：默认 / hover / disabled / loading
  - 状态文案：默认 / 警告 / 成功
  - 上传区：默认 / drag-over
- Token/component ownership:
  - 由 `styles.css` 内 CSS 变量统一管理

## Accessibility
- Target standard:
  - 基础可访问性，优先保证可读性和键盘操作
- Keyboard/focus behavior:
  - 所有按钮和输入框必须有清晰 focus ring
- Contrast/readability:
  - 正文与背景保持高对比
- Screen-reader semantics:
  - 分区标题、表格表头、按钮文案清晰
- Reduced motion and sensory considerations:
  - 动效短且可忽略，不依赖动画传达关键信息

## Responsive behavior
- Supported breakpoints/devices:
  - 桌面优先
  - 移动端可单列堆叠使用
- Layout adaptations:
  - 大屏使用多卡片网格
  - 小屏改为单列
- Touch/hover differences:
  - 触屏下按钮尺寸与间距保持可点按

## Interaction states
- Loading:
  - 统一用状态栏和文件项状态文案提示“正在读取文件内容”
- Empty:
  - 明确提示按步骤开始
- Error:
  - 保留逐文件错误说明，并给出手动补字段的退路
- Success:
  - 提示已完成字段匹配，可下载 ZIP
- Disabled:
  - 在未完成前置条件时禁用主动作或下载动作
- Offline/slow network, if applicable:
  - 本地后端不可用时继续展示状态说明和降级结果

## Content voice
- Tone:
  - 直接、专业、少废话
- Terminology:
  - 使用“字段”“模板”“批量替换名称”“下载 ZIP”
- Microcopy rules:
  - 每条提示只说一个结论
  - 优先告诉用户下一步该做什么

## Implementation constraints
- Framework/styling system:
  - 原生 HTML + CSS + JS
- Design-token constraints:
  - 使用根级 CSS 变量统一颜色、阴影、圆角
- Performance constraints:
  - 不引入新的前端框架
- Compatibility constraints:
  - 保持当前本地静态模式和本地后端模式兼容
- Test/screenshot expectations:
  - 本地启动后需要人工打开页面确认流程与版式

## Open questions
- [ ] 是否需要把“下载 ZIP”也合并进“批量替换名称”单按钮流程，目前先保留为分步导出 / owner: product / impact: 中

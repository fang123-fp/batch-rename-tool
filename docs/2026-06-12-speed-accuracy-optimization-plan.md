# 2026-06-12 识别速度与准确率提升实施方案

## Goal

- 明显缩短同机使用时的单文件与批量识别耗时
- 在当前 11 份已验证样本 `11/11 PASS` 不回退的前提下，提高新样本泛化准确率
- 把“样本修补式可用”升级成“有基线、有分层策略、有信心分数”的识别系统

## Current Baseline

当前代码的优点是：

- 对已回归样本已经达到 `11/11 PASS`
- 本地后端模式能固定运行环境，减少浏览器差异
- 对扫描件已经有第一页锁定、区域 OCR、文件名兜底、手工真值回归

当前代码的核心问题是：

1. 同机使用时后端模式固定开销偏大，体感慢
2. 识别对已知样本很强，但对新版式/弱扫描件泛化不足
3. 一些“准确率”来自样本特化兜底，而不是通用能力

## Evidence-Backed Bottlenecks

### 1. 后端请求固定开销过大

当前 `/api/extract` 的后端模式不是直接在 Node 中做识别，而是：

- 启一个 Puppeteer 页面
- 打开前端工作页
- 把文件重新上传进这个工作页
- 等待前端逻辑完成
- 再把结果带回后端

相关位置：

- [server.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/server.js:170)
- [server.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/server.js:191)
- [server.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/server.js:255)

这条链路的意义是“统一环境”，但代价是每次请求都要承担页面生命周期和浏览器桥接成本。

### 2. OCR 被刻意串行化，吞吐上限很低

当前页面端为避免抢同一个 Tesseract worker，显式把 OCR 排成单队列：

- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:894)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:3772)

这能提高稳定性，但会直接压低批量处理速度，尤其是多份扫描 PDF 一起上传时。

### 3. OCR 路径太重

当前每份扫描 PDF 至少会走这些步骤：

- `pdf.js` 解析
- 第 1 页高分辨率渲染
- 阈值化 canvas
- 必要时再渲染 raw canvas
- 区域 OCR
- 整页 OCR
- 候选打分与后处理

相关位置：

- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:2052)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:3337)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:3394)

这条路径保证了“尽量读出来”，但天然不快。

### 4. 当前准确率主要依赖启发式和少量模板提示

当前方案不是通用文档理解，而是：

- 少数字段有硬编码区域提示
- 其余字段主要靠 OCR 文本 + 别名 + 正则 + 候选打分
- 一部分报告靠文件名回填、已知地址兜底、专项 override

相关位置：

- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:21)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:3175)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:455)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:557)

这意味着：

- 已调过的样本会很好
- 新版式、新布局、弱扫描、强水印会掉得更明显

### 5. 字段变动会触发整批重读，影响体感速度

当前用户改字段名、删字段、加字段时，会触发整批重新提取：

- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:678)
- [app.js](/Users/fangpei/Documents/Codex/2026-06-08/new-chat/outputs/batch-rename-tool/app.js:697)

这对大批量场景会让用户感觉“刚改一个字段，又卡一轮”。

## Target Metrics

本轮推荐把目标拆成三层，不再只看“能不能识别出来”。

### A. 速度目标

- 已知证书模板，2 字段场景：
  - 单文件同机后端模式 `<= 2.5s` 中位数
- 已知证书模板，6 字段场景：
  - 单文件同机后端模式 `<= 4.0s` 中位数
- 已知证书模板，6 份批量：
  - 总耗时 `<= 15s`
- 改字段后“重新读取”：
  - 命中缓存时 `<= 800ms`

### B. 准确率目标

- 当前 11 份基线样本继续保持 `100% exact match`
- 已知模板家族新增验证集：
  - 目标字段 exact match `>= 98%`
- 未知模板家族：
  - 不强行填错
  - 低置信字段留空并提示人工确认

### C. 稳定性目标

- 不再因批量并发导致长时间卡住
- 不再因字段调整导致整批无差别重跑
- 前后端版本不一致时明确阻断，而不是默默给旧结果

## Recommended Strategy

推荐采用“三阶段推进”，不要再继续只打零散 hotfix。

## Phase 0 — 度量先行

### Goal

先把“慢在哪里、错在哪里”量出来，不再靠体感判断。

### Work

1. 给识别链路加分段耗时埋点
   - `backend_upload_ms`
   - `worker_page_boot_ms`
   - `pdf_text_extract_ms`
   - `ocr_render_ms`
   - `ocr_region_ms`
   - `ocr_fullpage_ms`
   - `postprocess_ms`

2. 扩展回归脚本
   - 保留当前 11 份真值回归
   - 增加 2 字段 / 6 字段 / 13 字段三套场景
   - 输出每份文件的阶段耗时

3. 建立“新样本验证集”
   - 按模板家族分组
   - 不和当前 11 份样本混用

### Acceptance

- 能回答“总耗时有多少来自 Puppeteer / OCR / 后处理”
- 能回答“哪个模板家族掉点最多”

## Phase 1 — 短期提速

### Goal

先砍固定开销和重复工作，不先动大架构。

### Work

1. 复用服务端工作页，而不是每次新建/关闭
   - 保留浏览器进程和 1 个 warm page
   - 只在 page 崩掉或版本变更时重建

2. OCR 并行度改为“有限并发”，不再全串行
   - 允许 `2~3` 个独立 OCR worker
   - 通过配置限制 CPU 占用
   - 同一文件内部仍保持顺序

3. 缩小 OCR 触发范围
   - 文本提取高置信命中后直接跳过 OCR
   - 只有缺失字段才做区域 OCR
   - 区域 OCR 够强时不再做整页 OCR

4. 做真正的缓存键
   - `fileHash + page + templateFamily + fieldSet`
   - 复用 OCR 文本、区域结果、结构化字段结果

5. 字段调整改为增量重读
   - 只重跑新增字段或当前缺失字段
   - 不再因为删/改一个字段就整批全跑

### Expected Benefit

- 同机单文件速度预计下降 `30%~50%`
- 批量场景吞吐预计提升 `1.8x~2.5x`

## Phase 2 — 中期提准

### Goal

把“靠样本补丁保命”升级成“模板家族路由 + 专用提取器”。

### Work

1. 加模板家族分类器
   - 蓝色校准证书
   - 天溯检测报告
   - 绿色 GIMT 校准证书
   - 用药基因报告
   - unknown

2. 每个模板家族独立配置
   - 字段别名
   - 区域坐标
   - 字段优先级
   - OCR 预处理参数
   - 置信阈值

3. 字段输出增加 provenance
   - `source = text | region_ocr | fullpage_ocr | filename_fallback | manual_override`
   - `confidence = 0~1`

4. 收紧 fallback 规则
   - 文件名回填只在低置信或缺失时触发
   - 已知地址兜底迁移到显式模板配置
   - 不再让 fallback 混进主规则里抢分

5. unknown 家族策略调整
   - 优先“不乱填”
   - 对低置信字段展示待确认状态

### Expected Benefit

- 新样本准确率会比当前明显更稳
- 误填错值的概率会下降
- 后续加新模板成本会从“改一堆 if/regex”变成“加一个模板配置”

## Phase 3 — 架构升级

### Goal

去掉“后端调 Puppeteer 再跑前端逻辑”这层间接架构。

### Work

1. 抽共享识别核心模块
   - 从 `app.js` 抽出 `core/extraction/*`
   - 前端 fallback 和后端都调用同一套核心逻辑

2. 后端直接执行识别
   - 不再依赖工作页 `page.goto(...)`
   - 不再依赖 DOM / file input / 页面状态

3. 后端 OCR worker 池化
   - 用 `worker_threads` 或受控子进程
   - 长生命周期复用语言包和 OCR worker

4. 前端只负责：
   - 上传
   - 展示状态
   - 编辑字段
   - 下载/重命名

### Expected Benefit

- 去掉最大固定开销来源
- 后端更容易做并发、缓存、监控
- 前后端一致性更容易保证

## Option Tradeoff

### Option A

继续在现有结构上叠更多规则和局部优化。

- 优点：
  - 最快见效
  - 改动风险较低
- 缺点：
  - 容易继续堆成样本化补丁
  - 速度上限仍被 Puppeteer 工作页卡住

### Option B

先做 Phase 1 + Phase 2，再推进 Phase 3。

- 优点：
  - 先拿到短期收益
  - 再把准确率和架构问题一起解决
  - 风险和收益最平衡
- 缺点：
  - 需要两轮以上迭代

### Option C

直接重做成后端原生识别服务。

- 优点：
  - 从根上解决架构开销
- 缺点：
  - 短期风险最高
  - 容易在迁移期打断现有可用性

## Recommendation

推荐选 **Option B**：

1. 先做 Phase 0
2. 再做 Phase 1
3. 紧接着做 Phase 2
4. 等基线稳定后再进 Phase 3

原因：

- 这是唯一兼顾“先见效”和“别继续堆补丁”的路径
- 只做 Option A，后面还会继续反复掉进“修一份样本、坏另一份样本”
- 直接做 Option C，迁移风险太高，不适合现在这套刚稳定的代码

## Concrete Delivery Plan

### Sprint 1

- 加分段耗时埋点
- 扩展回归脚本输出阶段耗时
- 复用服务端工作页
- 增量重读
- 基础缓存键

### Sprint 1 Acceptance

- 能看到阶段耗时报表
- 当前 11 份基线继续 `11/11 PASS`
- 单文件与批量耗时明显下降

### Sprint 2

- 模板家族分类器
- 模板配置外置
- provenance + confidence
- 收紧 fallback

### Sprint 2 Acceptance

- 已知模板新样本准确率提升
- low-confidence 字段不会再静默误填

### Sprint 3

- 抽共享核心模块
- 去掉后端 Puppeteer 工作页热路径
- 后端 worker 池化

### Sprint 3 Acceptance

- 同机速度较当前再降一大截
- 代码结构从“页面脚本兼后端识别逻辑”转成“共享核心 + UI 壳”

## Risks

- 并行 OCR 提升过头会把弱机器打满，反而卡
- 模板配置拆分不彻底，会出现“旧规则 + 新模板路由”互相打架
- 迁移到共享核心模块时，前后端细节差异可能导致短期回归波动

## Stop Rules

- 如果 Phase 1 后速度收益小于 `20%`，不要继续打零散补丁，直接提早进入 Phase 3
- 如果 Phase 2 后新样本准确率仍明显依赖文件名回填，说明模板路由粒度不够，需要继续细分模板家族
- 任何阶段都不得让当前 11 份基线掉到 `11/11 PASS` 以下

# Progress

## Goal
- 为静态站提供一版更适合中国大陆访问的部署形态
- 去掉运行时对境外 CDN 的关键依赖
- 保持现有功能和纯前端结构

## Plan
1. 盘点所有外部依赖和运行时加载路径
2. 将关键运行时资源改为站内同源加载
3. 将 OCR 改为按需加载，降低首页首屏成本
4. 补充部署文档并完成本地验证

## Status
- [x] 盘点外部依赖
- [x] 本地化 `JSZip`
- [x] 本地化 `pdf.js`
- [x] 本地化 `Tesseract` 运行时和语言包
- [x] OCR 改为按需加载
- [x] 本地浏览器验证

## Acceptance
- 页面源码不再依赖运行时境外 CDN
- GitHub Pages 项目路径下资源可正确解析
- PDF 直接解析与 OCR 路径都能正常进入

## Verification
- `node --check app.js`
- `node --check server.js`
- 本地根路径服务资源返回 `200`
- 模拟 GitHub Pages 子路径 `/batch-rename-tool/` 的页面和关键 vendor 资源返回 `200`
- 使用 Chrome headless 生成页面截图，确认首页可正常渲染

## Risks
- 首次 OCR 仍会加载较大资源
- GitHub Pages 本身在中国大陆仍可能存在网络波动

## 2026-06-09 OCR Fix
- 已修复证书类扫描 PDF 中，`证书编号` 被 OCR 行分组误带分页信息后又错误回退到下一行内容的问题
- 新规则会优先尝试从标签所在行内抽取字段值，并清理 `第1页 / 共3页 / Page of` 这类分页尾巴
- 对带数字的结构化编号（如证书编号、设备编号）放宽了 OCR 有效值判断，避免被当成英文标签噪声丢弃

## 2026-06-09 OCR Verification
- 使用用户提供的 `/Users/fangpei/Desktop/SCAN0000 1.pdf` 做本地回归
- OCR 回归结果：
  - `证书编号` => `Z20252-6244005`
  - `客户名称` => `瑞因细胞工程科技（广州）有限公司`
- 通过真实页面上传流程验证，表格回填结果与上面一致

## 2026-06-09 OCR Hotfix 2
- 已修复扫描证书在 `证书编号 / 客户名称 / 地址` 三字段场景下的两类问题：
  - OCR 先读到页码、标点或标题行时，会继续向下寻找真实字段值，不再把假值当成结果
  - 上传后立刻改字段时，提取任务会串行排队，避免并发 OCR 抢状态导致错值或卡住
- 已为该证书版式补充 `证书编号` 与 `地址` 的区域 OCR 提示，并增加 `Certificate No.`、`Address` 等别名匹配

## 2026-06-09 OCR Hotfix 2 Verification
- 本地 `http://localhost:8123` 回归通过以下 3 条操作路径：
  - 先设字段再上传
  - 上传过程中改字段
  - 先上传再改字段
- 使用用户提供的 `/Users/fangpei/Desktop/SCAN0000 1.pdf`，三条路径最终结果一致：
  - `证书编号` => `Z20252-6244005`
  - `客户名称` => `瑞因细胞工程科技（广州）有限公司`
  - `地址` => `广州市黄埔区开源大道188号自编七栋101房`

## 2026-06-09 OCR Hotfix 3
- 已修复 OCR 错值被误判为成功值的问题：
  - 现在会同时收集多个候选结果，再按字段类型打分，而不是谁先命中就直接采用
  - `客户名称` 会偏向中文组织名特征，拒绝 `地址lwet 2` 这类混合标签噪声
  - `地址` 会要求命中地址关键词或明显地址结构，拒绝 `义器名条` 这类标题误识别
  - `证书编号` 在同页同时出现多个结构化编号时，会优先选择更像证书号的模式

## 2026-06-09 OCR Hotfix 3 Verification
- 用构造样本验证：当错误结构化结果排在前面、正确行排在后面时，解析结果会自动选回正确值
- 再次用 `/Users/fangpei/Desktop/SCAN0000 1.pdf` 做本地上传回归，结果保持：
  - `证书编号` => `Z20252-6244005`
  - `客户名称` => `瑞因细胞工程科技（广州）有限公司`
  - `地址` => `广州市黄埔区开源大道188号自编七栋101房`

## 2026-06-09 PDF Compatibility Hotfix
- 已将 PDF 解析链从 `pdf.js 5.6` 的现代 `mjs` 构建切换到官方 `pdfjs-dist@3.11.174 legacy/build`
- 这样可以避开 Chrome 109 缺失的 `Uint8Array.prototype.toHex`、`Promise.withResolvers`、`Response.bytes` 等新 API 依赖
- 页面侧改为按需加载 `vendor/pdf.legacy.min.js`，并指向配套的 `vendor/pdf.worker.legacy.min.js`
- 已同步将静态资源版本号提升为 `20260609-pdfcompat1`，避免 GitHub Pages 访问页继续命中旧缓存

## 2026-06-09 PDF Compatibility Verification
- 对比了当前 `pdf.js 5.6` vendor 文件，确认其包含 Chrome 109 不稳定或缺失的新 API：`.toHex(`、`Promise.withResolvers`、`URL.parse`、`.bytes()`、`Uint8Array.fromBase64`
- 对比了官方 `pdfjs-dist@3.11.174 legacy/build`，上述兼容性敏感 API 在构建产物中未出现
- 用 headless Chrome 打开本地 smoke 页面，确认 `vendor/pdf.legacy.min.js` 加载后 `pdfjsLib.getDocument` 可用
- 本地语法检查通过：
  - `node --check app.js`
  - `node --check server.js`

## 2026-06-09 Field Extraction Fix
- 已根据 `SCAN0000 1.pdf` 的真实 OCR 回归，补强 5 类字段规则：
  - `名称`：优先短中文实体，拒绝日期/编号/地址串值
  - `编号`：支持 `LD-EQ065-43` 这类字母前缀管理编号
  - `日期`：提取纯日期并把 OCR 的 `H` 纠正为 `日`
  - `型号/规格`：从 `型号/规格 ... 制造 ...` 混合行中截出规格值
  - `厂家/厂商`：从同一行中抽取英文公司名，如 `Duwei Instruments Ltd.`
- 已同步将静态资源版本号提升为 `20260609-fieldfix1`，避免线上页面继续命中上一版缓存

## 2026-06-09 Field Extraction Verification
- 用真实页面脚本回归 `/Users/fangpei/Desktop/SCAN0000 1.pdf`，字段提取结果从 `8/13` 提升到 `13/13`
- 本次逐字段结果：
  - `证书编号` => `Z20252-6244005`
  - `客户名称` => `瑞因细胞工程科技（广州）有限公司`
  - `地址` => `广州市黄埔区开源大道188号自编七栋101房`
  - `仪器名称` => `压差表`
  - `管理编号` => `LD-EQ065-43`
  - `制造厂家` => `Duwei Instruments Ltd.`
  - `制造厂商` => `Duwei Instruments Ltd.`
  - `接收日期` => `2025 年 07 月 16 日`
  - `校准日期` => `2025 年 07 月 16 日`
  - `型号` => `(0~60) Pa/2Pa`
  - `规格型号` => `(0~60) Pa/2Pa`
  - `出厂编号` => `LD-EQ065-43`
  - `生产厂家` => `Duwei Instruments Ltd.`

## 2026-06-10 Batch OCR Queue Fix
- 已修复“批量上传多份扫描 PDF 时，OCR 并发互相阻塞，导致大部分文件一直取不到值”的问题
- 根因是整批文件通过 `Promise.all` 同时进入 OCR，而页面只复用了一个 Tesseract worker；多份扫描件会并发调用同一个 worker，结果出现长时间卡住
- 本次改动包括：
  - 为 OCR 增加串行队列，同一时刻只让一个扫描任务占用 worker
  - 只对当前仍缺失的字段做 OCR，避免无效识别
  - 每完成一页 OCR 就立即检查字段是否已补齐，补齐后提前停止后续页识别
  - 批量处理中按文件逐个刷新状态，排队中会显示前方等待数量
- 已同步将静态资源版本号提升为 `20260610-batchocr1`，避免访问页继续命中旧缓存

## 2026-06-10 Batch OCR Queue Verification
- 用真实页面批量上传以下 6 份用户样本回归：
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-2.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-3.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-4.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-5.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-6.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-7.pdf`
- 修复前：`240s` 仍有 `5/6` 文件卡在“准备 OCR”，只有 1 份完成
- 修复后：同一批文件约 `24s` 全部完成，且 `6/6` 文件都成功匹配 `证书编号 + 客户名称`
- 同时回归 `/Users/fangpei/Desktop/导出内容资料/SCAN0000 1.pdf`，`13/13` 字段结果保持正确，耗时约 `5s`

## 2026-06-10 First Page Only Optimization
- 已按当前证书样本特征，将 PDF 文字提取和 OCR 识别都收敛为“只读取第一页”
- 这样可以避免多页 PDF 在后续页面上继续做无效解析，进一步缩短批量处理耗时
- 已同步将静态资源版本号提升为 `20260610-firstpage1`，避免访问页继续命中旧缓存

## 2026-06-10 First Page Only Verification
- 用真实页面再次回归以下 6 份样本：
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-2.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-3.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-4.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-5.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-6.pdf`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-7.pdf`
- `6/6` 文件仍然成功匹配 `证书编号 + 客户名称`
- 总耗时约 `24s`，与上一版批量回归接近，说明这批样本上一版已基本在第一页就完成字段命中；本次改动主要是把“只读第一页”规则显式固化
- 同时回归 `/Users/fangpei/Desktop/导出内容资料/SCAN0000 1.pdf`，`13/13` 字段结果保持正确，耗时约 `5s`

## 2026-06-10 Precision-First OCR Optimization
- 已将 OCR 优化为“精准优先”的多级路径：
  - 先尝试第一页的已知字段区域 OCR
  - 区域结果只有在字段级评分足够强时才直接采用
  - 其余字段仍自动回退到整页 OCR 兜底，不拿准确率冒险
- 已对整页 OCR 后的后处理增加“强候选提前收工”：
  - 如果标签同行 / 邻近行给出的候选值已经足够强，就不再继续做额外裁剪 OCR
- 已把 PDF 原始文字与 OCR 结果拆开缓存：
  - 同一批文件再次“从内容重新读取”或改字段时，能直接复用已识别出的 OCR 文本，避免重复跑整页 OCR
- 已同步将静态资源版本号提升为 `20260610-precisefast2`

## 2026-06-10 Precision-First OCR Verification
- 用真实页面回归 `/Users/fangpei/Desktop/导出内容资料/SCAN0000 1.pdf`：
  - `13/13` 字段保持正确
  - 总耗时约 `5s`
- 用真实页面批量回归 6 份 `SCAN0002-*` 样本：
  - `6/6` 文件仍然成功匹配 `证书编号 + 客户名称`
  - 首轮耗时约 `21~22s`
- 对其中 `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-2.pdf` 单文件检查：
  - 已能只靠第一页区域 OCR 得到
    - `证书编号` => `Z20251-6247993`
    - `客户名称` => `瑞因细胞工程科技（广州）有限公司`
  - 该文件完成耗时约 `2s`
- 同一批 6 份样本在首次完成后再次点击“从内容重新读取”：
  - 首次约 `21086ms`
  - 第二次约 `523ms`
  - 说明 OCR 缓存已生效，重复读取场景提速明显

## 2026-06-10 Field Disambiguation Fix
- 已修复“客户名称容易被地址覆盖、管理编号漏读、证书编号和管理编号偶发串位”的字段判定问题
- 根因有两类：
  - 编号类字段此前共用一套宽泛规则，`证书编号` 和 `管理编号` 在少数扫描件上会互相抢分
  - `管理编号` 在个别样本里字段名被 OCR 读坏，但值本身 `LD-EQ...` 仍在正文中，原逻辑因为只依赖字段名附近匹配而漏掉
- 本次改动包括：
  - 为 `证书编号` 增加更严格的证书号形态识别，并明确排除 `LD-EQ...` 这类管理编号
  - 为 `管理编号` 增加专门的 `LD-EQ...` 识别加权，并排除证书号形态
  - 对全文候选提取补充“宽松编号扫描”，即使字段名 OCR 失真，也能从整行中捞出真实编号
  - 候选打分补充 `rawValue` 上下文，让“客户名称 / 地址”能根据原始标签行信息更稳地区分
  - 已同步将静态资源版本号提升为 `20260610-fieldfix1`

## 2026-06-10 Field Disambiguation Verification
- 用真实页面批量回归以下 6 份 `SCAN0002-*` 样本，并按用户当前字段组合验证：
  - `证书编号`
  - `客户名称`
  - `地址`
  - `管理编号`
- 回归结果：
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-4.pdf`
    - `证书编号` 已恢复为 `Z2025N12-6406171`
    - `管理编号` 已恢复为 `LD-EQ028-11`
  - `/Users/fangpei/Desktop/导出内容资料/页面提取自－SCAN0002-7.pdf`
    - `管理编号` 已成功补回为 `LD-EQ035-7`
  - `客户名称` 在这 6 份样本中均稳定为 `瑞因细胞工程科技（广州）有限公司`
- 该批量回归总耗时约 `26s`
- 同时回归 `/Users/fangpei/Desktop/导出内容资料/SCAN0000 1.pdf`：
  - `13/13` 字段保持正确
  - 总耗时约 `5s`

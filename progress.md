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

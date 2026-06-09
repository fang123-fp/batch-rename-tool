# 国内访问优化说明

## 目标
- 让静态站在 GitHub Pages 或其他海外静态托管上，对中国大陆用户更稳定
- 降低首次打开时对境外公共 CDN 的依赖
- 保持现有纯前端架构，不引入后端服务

## 非目标
- 不承诺 GitHub Pages 在中国大陆始终可用
- 不在这次改动里迁移到新的云厂商
- 不在这次改动里处理 ICP 备案

## 这次实现
1. 将 `JSZip` 改为站内本地资源
2. 将 `pdf.js` 改为站内本地资源
3. 将 `Tesseract` 主库、worker、core、语言包改为站内本地资源
4. 将 OCR 改为按需加载，避免首页首次打开就加载大体积 OCR 依赖

## 当前资源布局
- `vendor/jszip.min.js`
- `vendor/pdf.min.mjs`
- `vendor/pdf.worker.min.mjs`
- `vendor/tesseract/tesseract.min.js`
- `vendor/tesseract/worker.min.js`
- `vendor/tesseract-core/*`
- `vendor/tessdata/eng.traineddata.gz`
- `vendor/tessdata/chi_sim.traineddata.gz`

## 部署建议

### 方案 A：继续使用 GitHub Pages
适合：
- 演示站
- 轻量个人工具
- 对偶发波动可接受

建议：
- 绑定自定义域名
- 优先使用 `www` 子域名
- 保留完整 `vendor/` 目录，避免构建时被错误清理

### 方案 B：迁移到中国香港静态托管
适合：
- 主要用户在中国大陆
- 希望比 GitHub Pages 更稳
- 暂时不想处理 ICP

常见选择：
- 阿里云 OSS + CDN（香港）
- 腾讯云 COS + CDN（香港）
- Cloudflare Pages 配合自定义域名

### 方案 C：中国大陆正式站点
适合：
- 长期公开使用
- 对大陆访问稳定性要求高
- 能接受备案流程

要求：
- 自有域名
- ICP 备案
- 使用中国大陆静态托管或 CDN
- 首页按要求展示备案号

## 验收口径
- 首页打开时不再请求 `jsdelivr` 或 `projectnaptha` 资源
- 上传普通文本文件时功能不受影响
- 处理 PDF 时可从站内路径加载 `pdf.js`
- 遇到需要 OCR 的 PDF 时，可从站内路径加载 OCR 依赖
- GitHub Pages 路径前缀下资源仍能正确解析

## 已知取舍
- 为了换取更稳的访问路径，仓库体积会增加
- 首次 OCR 仍然会比较慢，但现在是从同源站点加载，链路更可控
- 如果未来用户量明显上升，仍建议迁移到更适合大陆访问的托管方案

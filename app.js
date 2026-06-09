const state = {
  fields: ["姓名", "编号"],
  pendingFields: [],
  files: [],
  template: "{姓名}-{编号}",
  status: "等待文件上传和字段读取完成",
  statusKind: "",
  isExtracting: false,
  extractionRunId: 0,
  focusPendingFieldId: "",
};

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".tsv", ".json", ".md", ".markdown", ".html", ".htm", ".xml"]);
const FIELD_BOUNDARY_PREFIX = "(?:\\n\\s*|[\\s,，;；]+)";
const OCR_MAX_PDF_PAGES = 3;
const KNOWN_PDF_FIELD_REGION_HINTS = {
  [normalizeFieldLabel("客户名称")]: { left: 0.18, top: 0.18, width: 0.70, height: 0.07, scale: 4, threshold: 0, psm: "6" },
  [normalizeFieldLabel("仪器名称")]: { left: 0.18, top: 0.29, width: 0.70, height: 0.06, scale: 4, threshold: 0, psm: "6" },
};
const GENERIC_FIELD_SUFFIXES = [
  "号",
  "码",
  "名",
  "龄",
  "别",
  "科",
  "室",
  "床",
  "院",
  "证",
  "卡",
  "单位",
  "类型",
  "名称",
  "来源",
  "标本",
  "样本",
  "日期",
  "时间",
  "电话",
  "地址",
  "诊断",
  "结果",
  "项目",
  "技术",
  "病区",
  "病房",
  "部门",
];

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const fieldList = document.getElementById("fieldList");
const templateInput = document.getElementById("templateInput");
const templateHint = document.getElementById("templateHint");
const fileSummary = document.getElementById("fileSummary");
const selectedFilesEmpty = document.getElementById("selectedFilesEmpty");
const selectedFilesList = document.getElementById("selectedFilesList");
const tableHeadRow = document.getElementById("tableHeadRow");
const tableBody = document.getElementById("tableBody");
const tableWrap = document.getElementById("tableWrap");
const emptyState = document.getElementById("emptyState");
const statusText = document.getElementById("statusText");
const exportZipBtn = document.getElementById("exportZipBtn");
const clearFilesBtn = document.getElementById("clearFilesBtn");
const addFieldBtn = document.getElementById("addFieldBtn");
const reloadExtractBtn = document.getElementById("reloadExtractBtn");
const clearValuesBtn = document.getElementById("clearValuesBtn");
const resetTemplateBtn = document.getElementById("resetTemplateBtn");

let pdfJsLibPromise;
let ocrWorkerPromise;
let tesseractLoadPromise;
const STATIC_ASSET_VERSION = "20260609-ocrfix3";

function resolveAssetUrl(relativePath, options = {}) {
  const { versioned = true } = options;
  const url = new URL(relativePath, window.location.href);
  if (versioned) {
    url.searchParams.set("v", STATIC_ASSET_VERSION);
  }
  return url.href;
}

function formatErrorMessage(error) {
  if (error?.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error.toString === "function") {
    const value = String(error).trim();
    if (value && value !== "[object Object]") {
      return value;
    }
  }
  return "未知错误";
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`脚本加载失败：${url}`));
    document.head.appendChild(script);
  });
}

async function ensureTesseractLoaded() {
  if (window.Tesseract?.createWorker) {
    return window.Tesseract;
  }

  if (!tesseractLoadPromise) {
    tesseractLoadPromise = loadScript(resolveAssetUrl("./vendor/tesseract/tesseract.min.js"))
      .catch((error) => {
        tesseractLoadPromise = null;
        throw error;
      });
  }

  await tesseractLoadPromise;

  if (!window.Tesseract?.createWorker) {
    throw new Error("OCR 引擎加载失败，请检查站点资源是否完整");
  }

  return window.Tesseract;
}

function splitName(name) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) {
    return {
      base: name.slice(0, lastDot),
      extension: name.slice(lastDot),
    };
  }
  return {
    base: name,
    extension: "",
  };
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFieldLabel(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function createLocalId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasCjkCharacters(value) {
  return /[\u3400-\u9fff]/.test(value || "");
}

function isMostlyLatinText(value) {
  const text = String(value || "");
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return latinCount > 0 && latinCount >= cjkCount * 2;
}

function sanitizeFilename(value) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[-_@\s]{2,}/g, (match) => match[0])
    .replace(/^[\s._@-]+|[\s._@-]+$/g, "")
    .trim();
}

function getTemplateTokens(template) {
  return [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].trim()).filter(Boolean);
}

function getMissingTokens(template) {
  return getTemplateTokens(template).filter((token) => !state.fields.includes(token));
}

function ensureUniqueFieldName(name, ignoreIndex = -1) {
  const base = normalizeWhitespace(name || "字段");
  let candidate = base || "字段";
  let counter = 2;
  while (state.fields.some((field, index) => index !== ignoreIndex && field === candidate)) {
    candidate = `${base || "字段"}${counter}`;
    counter += 1;
  }
  return candidate;
}

function applyFieldsToRecords() {
  state.files.forEach((record) => {
    const nextValues = {};
    const nextAutoValues = {};
    state.fields.forEach((field) => {
      nextValues[field] = record.values[field] || "";
      nextAutoValues[field] = record.autoValues[field] || "";
    });
    record.values = nextValues;
    record.autoValues = nextAutoValues;
  });
}

function renameFieldAcrossState(index, nextName) {
  const previous = state.fields[index];
  if (previous === nextName) {
    return false;
  }

  state.fields[index] = nextName;
  state.files.forEach((record) => {
    record.values[nextName] = record.values[previous] || "";
    record.autoValues[nextName] = record.autoValues[previous] || "";
    if (nextName !== previous) {
      delete record.values[previous];
      delete record.autoValues[previous];
    }
  });
  state.template = state.template.split(`{${previous}}`).join(`{${nextName}}`);
  return true;
}

function syncPendingFieldInputs() {
  const inputs = Array.from(fieldList.querySelectorAll(".field-input[data-field-index]"));
  if (!inputs.length) {
    return false;
  }

  let changed = false;
  inputs.forEach((input, index) => {
    const nextName = ensureUniqueFieldName(input.value, index);
    input.value = nextName;
    if (renameFieldAcrossState(index, nextName)) {
      changed = true;
    }
  });

  if (changed) {
    templateInput.value = state.template;
  }

  return changed;
}

async function commitPendingField(pendingFieldId, rawValue) {
  const nextName = normalizeWhitespace(rawValue);
  if (!nextName) {
    return false;
  }

  const pendingIndex = state.pendingFields.findIndex((field) => field.id === pendingFieldId);
  if (pendingIndex < 0) {
    return false;
  }

  state.pendingFields.splice(pendingIndex, 1);
  state.focusPendingFieldId = "";
  state.fields.push(ensureUniqueFieldName(nextName));
  applyFieldsToRecords();
  render();
  await refreshAutoExtraction(state.files, { reReadContent: false });
  return true;
}

function buildRawName(record) {
  const template = state.template;
  const raw = template.replace(/\{([^}]+)\}/g, (_, token) => {
    const cleanToken = token.trim();
    return record.values[cleanToken] || "";
  });
  const normalized = sanitizeFilename(raw);
  return normalized || sanitizeFilename(record.baseName) || "untitled";
}

function buildPreviewRows() {
  const seen = new Map();
  return state.files.map((record) => {
    const rawBase = buildRawName(record);
    const uniqueKey = `${rawBase}${record.extension}`;
    const count = (seen.get(uniqueKey) || 0) + 1;
    seen.set(uniqueKey, count);
    const uniqueBase = count === 1 ? rawBase : `${rawBase} (${count})`;
    return {
      ...record,
      previewBase: uniqueBase,
      previewName: `${uniqueBase}${record.extension}`,
      duplicated: count > 1,
    };
  });
}

function setStatus(message, kind = "") {
  state.status = message;
  state.statusKind = kind;
  statusText.textContent = message;
  statusText.classList.remove("status-warn", "status-success");
  if (kind) {
    statusText.classList.add(kind === "warn" ? "status-warn" : "status-success");
  }
}

function updateSummary() {
  if (!state.files.length) {
    fileSummary.textContent = "0 个文件";
    return;
  }

  fileSummary.textContent = `共 ${state.files.length} 个文件`;
}

function renderDataViews() {
  renderTemplateHint();
  renderSelectedFiles();
  renderTable();
  updateSummary();
  updateStatus();
}

function renderFieldList() {
  fieldList.innerHTML = "";

  state.fields.forEach((field, index) => {
    const card = document.createElement("div");
    card.className = "field-card";

    const input = document.createElement("input");
    input.className = "field-input";
    input.dataset.fieldIndex = String(index);
    input.value = field;
    input.setAttribute("aria-label", `字段 ${index + 1}`);
    input.addEventListener("change", async () => {
      if (!syncPendingFieldInputs()) {
        return;
      }
      renderDataViews();
      await refreshAutoExtraction(state.files, { reReadContent: false });
    });

    const insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.className = "mini-btn";
    insertBtn.textContent = "插入模板";
    insertBtn.addEventListener("click", () => insertToken(normalizeWhitespace(input.value) || field));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mini-btn";
    removeBtn.textContent = "删除";
    removeBtn.disabled = state.fields.length === 1;
    removeBtn.addEventListener("click", async () => {
      const removed = state.fields[index];
      state.fields.splice(index, 1);
      state.files.forEach((record) => {
        delete record.values[removed];
        delete record.autoValues[removed];
      });
      applyFieldsToRecords();
      render();
      await refreshAutoExtraction(state.files, { reReadContent: false });
    });

    const actionRow = document.createElement("div");
    actionRow.className = "field-card-actions";
    actionRow.append(insertBtn, removeBtn);

    card.append(input, actionRow);
    fieldList.append(card);
  });

  state.pendingFields.forEach((draft, index) => {
    const card = document.createElement("div");
    card.className = "field-card";

    const input = document.createElement("input");
    input.className = "field-input";
    input.dataset.pendingFieldId = draft.id;
    input.value = draft.value;
    input.placeholder = "输入字段名";
    input.setAttribute("aria-label", `新增字段 ${index + 1}`);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "mini-btn";
    saveBtn.textContent = "添加";
    saveBtn.disabled = !normalizeWhitespace(draft.value);

    const commitDraft = async () => {
      if (!normalizeWhitespace(input.value)) {
        return;
      }
      saveBtn.disabled = true;
      await commitPendingField(draft.id, input.value);
    };

    input.addEventListener("input", () => {
      draft.value = input.value;
      saveBtn.disabled = !normalizeWhitespace(input.value);
    });
    input.addEventListener("change", () => {
      if (normalizeWhitespace(input.value)) {
        void commitDraft();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !saveBtn.disabled) {
        event.preventDefault();
        void commitDraft();
      }
    });

    saveBtn.addEventListener("click", () => {
      void commitDraft();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mini-btn";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      state.pendingFields = state.pendingFields.filter((field) => field.id !== draft.id);
      if (state.focusPendingFieldId === draft.id) {
        state.focusPendingFieldId = "";
      }
      renderFieldList();
    });

    const actionRow = document.createElement("div");
    actionRow.className = "field-card-actions";
    actionRow.append(saveBtn, removeBtn);

    card.append(input, actionRow);
    fieldList.append(card);
  });

  if (state.focusPendingFieldId) {
    const pendingInput = fieldList.querySelector(`[data-pending-field-id="${state.focusPendingFieldId}"]`);
    if (pendingInput) {
      pendingInput.focus();
    }
    state.focusPendingFieldId = "";
  }
}

function insertToken(field) {
  const token = `{${field}}`;
  const start = templateInput.selectionStart ?? templateInput.value.length;
  const end = templateInput.selectionEnd ?? templateInput.value.length;
  const current = templateInput.value;
  const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
  templateInput.value = next;
  templateInput.focus();
  const caret = start + token.length;
  templateInput.setSelectionRange(caret, caret);
  state.template = next;
  render();
}

function renderTemplateHint() {
  const tokens = getTemplateTokens(state.template);
  const missing = getMissingTokens(state.template);

  if (!tokens.length) {
    templateHint.textContent = "模板里至少要有一个字段占位符，例如 {姓名}。";
    templateHint.className = "hint-text status-warn";
    return;
  }

  if (missing.length) {
    templateHint.textContent = `这些占位符还没有对应字段：${missing.map((item) => `{${item}}`).join("、")}`;
    templateHint.className = "hint-text status-warn";
    return;
  }

  templateHint.textContent = "模板有效。工具会优先用文件内容中提取到的字段值来命名。";
  templateHint.className = "hint-text status-success";
}

function getFilledFieldCount(record) {
  return state.fields.filter((field) => normalizeWhitespace(record.values[field] || "")).length;
}

function buildExtractionMessage(record) {
  if (record.contentState === "reading") {
    return "正在读取文件内容...";
  }
  if (record.contentState === "unsupported") {
    return record.contentMessage || "当前文件类型暂不支持自动读取";
  }
  if (record.contentState === "error") {
    return record.contentMessage || "读取文件内容失败";
  }
  if (record.contentState === "ready") {
    const filledCount = getFilledFieldCount(record);
    if (!filledCount) {
      return "内容已读取，但没有匹配到字段，请检查字段名或文件内容格式";
    }
    return `内容已读取，自动匹配到 ${filledCount}/${state.fields.length} 个字段`;
  }
  return "等待读取文件内容";
}

function renderSelectedFiles() {
  selectedFilesList.innerHTML = "";

  if (!state.files.length) {
    selectedFilesEmpty.classList.remove("hidden");
    selectedFilesList.classList.add("hidden");
    return;
  }

  selectedFilesEmpty.classList.add("hidden");
  selectedFilesList.classList.remove("hidden");

  state.files.forEach((record, index) => {
    const item = document.createElement("li");
    item.className = "selected-file-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(record.originalName)}</strong>
        <span>${escapeHtml(buildExtractionMessage(record))}</span>
      </div>
      <span class="selected-file-index">${index + 1}</span>
    `;
    selectedFilesList.append(item);
  });
}

function renderTable() {
  if (!state.files.length) {
    emptyState.classList.remove("hidden");
    tableWrap.classList.add("hidden");
    tableHeadRow.innerHTML = "";
    tableBody.innerHTML = "";
    return;
  }

  emptyState.classList.add("hidden");
  tableWrap.classList.remove("hidden");

  tableHeadRow.innerHTML = "";

  const baseHeaders = ["原文件", ...state.fields];
  baseHeaders.forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    tableHeadRow.append(th);
  });

  tableBody.innerHTML = "";
  state.files.forEach((row) => {
    const tr = document.createElement("tr");

    const fileCell = document.createElement("td");
    fileCell.innerHTML = `
      <div class="file-name">
        <strong>${escapeHtml(row.originalName)}</strong>
        <span class="file-meta">${escapeHtml(buildExtractionMessage(row))}</span>
      </div>
    `;
    tr.append(fileCell);

    state.fields.forEach((field) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.className = "cell-input";
      input.value = row.values[field] || "";
      input.placeholder = `输入${field}`;
      input.addEventListener("input", () => {
        row.values[field] = input.value;
      });
      td.append(input);
      tr.append(td);
    });

    tableBody.append(tr);
  });
}

function updateStatus() {
  const tokens = getTemplateTokens(state.template);
  const missing = getMissingTokens(state.template);

  if (!state.files.length) {
    setStatus("请先选择至少一个文件", "warn");
    exportZipBtn.disabled = true;
    return;
  }

  if (state.isExtracting) {
    setStatus("正在读取文件内容并提取字段，请稍候...", "success");
    exportZipBtn.disabled = true;
    return;
  }

  if (!tokens.length) {
    setStatus("模板里还没有有效字段占位符，暂时不能执行重命名", "warn");
    exportZipBtn.disabled = true;
    return;
  }

  if (missing.length) {
    setStatus(`模板中存在未定义字段：${missing.join("、")}`, "warn");
    exportZipBtn.disabled = true;
    return;
  }

  const unsupportedCount = state.files.filter((record) => record.contentState === "unsupported" || record.contentState === "error").length;
  const incompleteCount = state.files.filter((record) => state.fields.some((field) => !normalizeWhitespace(record.values[field] || ""))).length;
  const duplicateCount = buildPreviewRows().filter((row) => row.duplicated).length;

  exportZipBtn.disabled = false;

  if (unsupportedCount) {
    setStatus(`有 ${unsupportedCount} 个文件暂不支持自动读取内容，你可以手动补字段后再下载`, "warn");
    return;
  }

  if (incompleteCount) {
    setStatus(`有 ${incompleteCount} 个文件没有匹配完整字段，你可以手动补充后再下载`, "warn");
    return;
  }

  if (duplicateCount) {
    setStatus(`字段已读取完成，系统会自动处理 ${duplicateCount} 个重名结果`, "success");
    return;
  }

  setStatus("字段读取完成，可以点击重新命名并下载 ZIP", "success");
}

function render() {
  renderFieldList();
  renderDataViews();
}

function makeRecord(file) {
  const parts = splitName(file.name);
  const values = {};
  const autoValues = {};
  state.fields.forEach((field) => {
    values[field] = "";
    autoValues[field] = "";
  });
  return {
    id: createLocalId(),
    file,
    originalName: file.name,
    baseName: parts.base,
    extension: parts.extension,
    extensionLower: parts.extension.toLowerCase(),
    values,
    autoValues,
    contentText: "",
    contentState: "idle",
    contentMessage: "等待读取文件内容",
    contentTypeLabel: "",
    ocrAttempted: false,
  };
}

function addFiles(fileList) {
  syncPendingFieldInputs();
  const incoming = Array.from(fileList || []).map(makeRecord);
  if (!incoming.length) {
    return;
  }
  state.files.push(...incoming);
  render();
  refreshAutoExtraction(incoming, { reReadContent: true });
}

function clearFiles() {
  state.files = [];
  fileInput.value = "";
  render();
}

function clearFieldValues() {
  state.files.forEach((record) => {
    state.fields.forEach((field) => {
      record.values[field] = "";
    });
  });
  render();
}

async function exportZip() {
  const fieldsChanged = syncPendingFieldInputs();
  if (fieldsChanged) {
    renderDataViews();
  }
  if (state.files.length && fieldsChanged) {
    await refreshAutoExtraction(state.files, { reReadContent: false });
  }
  const previewRows = buildPreviewRows();
  exportZipBtn.disabled = true;
  setStatus("正在批量重命名并打包 ZIP，请稍候...", "success");

  try {
    const zip = new JSZip();
    for (const row of previewRows) {
      const buffer = await row.file.arrayBuffer();
      zip.file(row.previewName, buffer);
    }
    const manifest = buildManifestRows(previewRows);
    zip.file("rename-manifest.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, `renamed-files-${Date.now()}.zip`);
    exportZipBtn.disabled = false;
    setStatus("批量重命名完成，ZIP 已开始下载", "success");
    setTimeout(() => updateStatus(), 1500);
  } catch (error) {
    console.error(error);
    exportZipBtn.disabled = false;
    setStatus("批量重命名失败，请重试", "warn");
  }
}

function buildManifestRows(previewRows = buildPreviewRows()) {
  return previewRows.map((row) => {
    const item = {
      originalName: row.originalName,
      renamedName: row.previewName,
      contentState: row.contentState,
      contentMessage: row.contentMessage,
    };
    state.fields.forEach((field) => {
      item[field] = row.values[field] || "";
    });
    return item;
  });
}

function triggerDownload(blob, fileName) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFlexibleFieldPattern(field) {
  const compact = normalizeFieldLabel(field);
  if (!compact) {
    return "";
  }
  return Array.from(compact).map(escapeRegExp).join("\\s*");
}

function stripTrailingPaginationArtifacts(value) {
  let nextValue = normalizeWhitespace(String(value || ""));
  if (!nextValue) {
    return "";
  }

  const patterns = [
    /\s*第\s*\d+\s*[页责責]\s*(?:共\s*\d+\s*[页责責])?$/i,
    /\s*共\s*\d+\s*[页责責]\s*(?:第\s*\d+\s*[页责責])?$/i,
    /\s*Page\s*\d*\s*(?:of\s*\d+)?$/i,
    /\s*Page\s*of\s*$/i,
  ];

  let changed = true;
  while (changed && nextValue) {
    changed = false;
    patterns.forEach((pattern) => {
      const trimmed = nextValue.replace(pattern, "").trim();
      if (trimmed !== nextValue) {
        nextValue = trimmed;
        changed = true;
      }
    });
  }

  return nextValue;
}

function extractInlineFieldValue(text, field) {
  const source = normalizeWhitespace(text || "");
  const fieldPattern = buildFlexibleFieldPattern(field);
  if (!source || !fieldPattern) {
    return "";
  }

  const pattern = new RegExp(`${fieldPattern}\\s*[：:]?\\s*(.+)$`, "i");
  const match = source.match(pattern);
  if (!match || !match[1]) {
    return "";
  }

  return cleanExtractedValue(stripTrailingPaginationArtifacts(match[1]));
}

function normalizeExtractedText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function isLikelyOcrLabel(text, currentField = "") {
  const normalized = normalizeFieldLabel(String(text || "").replace(/[：:]+$/g, ""));
  if (!normalized || normalized.length < 2) {
    return false;
  }
  if (normalized === normalizeFieldLabel(currentField)) {
    return false;
  }
  if (state.fields.some((field) => normalizeFieldLabel(field) === normalized)) {
    return true;
  }
  if (isMostlyLatinText(text) && !hasCjkCharacters(text)) {
    return true;
  }
  return isProbableFieldLabel(text, currentField);
}

function parseTesseractTsv(tsvText) {
  const rows = String(tsvText || "").trim().split(/\r?\n/);
  if (rows.length <= 1) {
    return [];
  }

  const groups = new Map();
  rows.slice(1).forEach((row) => {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") {
      return;
    }

    const text = normalizeWhitespace(columns[11] || "");
    if (!text) {
      return;
    }

    const left = Number(columns[6] || 0);
    const top = Number(columns[7] || 0);
    const width = Number(columns[8] || 0);
    const height = Number(columns[9] || 0);
    const key = [columns[1], columns[2], columns[3], columns[4]].join("-");

    if (!groups.has(key)) {
      groups.set(key, {
        textParts: [],
        left,
        top,
        right: left + width,
        bottom: top + height,
      });
    }

    const item = groups.get(key);
    item.textParts.push(text);
    item.left = Math.min(item.left, left);
    item.top = Math.min(item.top, top);
    item.right = Math.max(item.right, left + width);
    item.bottom = Math.max(item.bottom, top + height);
  });

  return [...groups.values()]
    .map((item) => ({
      text: normalizeWhitespace(item.textParts.join(" ")),
      left: item.left,
      top: item.top,
      right: item.right,
      bottom: item.bottom,
      width: item.right - item.left,
      height: item.bottom - item.top,
    }))
    .filter((item) => item.text)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left));
}

function pickBestOcrValueCandidate(labelLine, lines, field) {
  const labelCenterY = (labelLine.top + labelLine.bottom) / 2;
  const labelHeight = Math.max(labelLine.height, 12);

  const scoreCandidate = (line, verticalWeight, horizontalWeight) => {
    const centerY = (line.top + line.bottom) / 2;
    const yDiff = Math.abs(centerY - labelCenterY);
    const xGap = Math.max(0, line.left - labelLine.right);
    let score = yDiff * verticalWeight + xGap * horizontalWeight;

    if (isLikelyOcrLabel(line.text, field)) {
      score += 400;
    }
    if (isMostlyLatinText(line.text) && !hasCjkCharacters(line.text)) {
      score += 120;
    }
    if (hasCjkCharacters(line.text)) {
      score -= 80;
    }
    return score;
  };

  const sameRowCandidates = lines
    .filter((line) => line !== labelLine)
    .filter((line) => line.left >= labelLine.right - 8)
    .filter((line) => Math.abs(((line.top + line.bottom) / 2) - labelCenterY) <= Math.max(labelHeight * 1.6, 20))
    .map((line) => ({ line, score: scoreCandidate(line, 8, 0.3) }))
    .sort((left, right) => left.score - right.score);

  if (sameRowCandidates.length) {
    return sameRowCandidates[0].line.text;
  }

  const belowCandidates = lines
    .filter((line) => line !== labelLine)
    .filter((line) => line.top >= labelLine.bottom - 4)
    .filter((line) => line.top - labelLine.bottom <= Math.max(labelHeight * 3, 48))
    .filter((line) => line.left >= labelLine.left)
    .map((line) => ({ line, score: scoreCandidate(line, 4, 0.08) }))
    .sort((left, right) => left.score - right.score);

  return belowCandidates.length ? belowCandidates[0].line.text : "";
}

function buildStructuredTextFromOcrLines(lines, fields) {
  if (!lines.length || !fields.length) {
    return "";
  }

  const results = [];
  fields.forEach((field) => {
    const normalizedField = normalizeFieldLabel(field);
    const labelLine = lines.find((line) => normalizeFieldLabel(line.text) === normalizedField)
      || lines.find((line) => normalizeFieldLabel(line.text).includes(normalizedField));

    if (!labelLine) {
      return;
    }

    const value = cleanExtractedValue(pickBestOcrValueCandidate(labelLine, lines, field));
    if (!value) {
      return;
    }

    results.push(`${field}：${value}`);
  });

  return results.join("\n");
}

function scoreOcrLineText(text) {
  const value = normalizeWhitespace(text || "");
  if (!value) {
    return -Infinity;
  }

  let score = value.length;
  const cjkCount = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const digitCount = (value.match(/\d/g) || []).length;
  const latinCount = (value.match(/[A-Za-z]/g) || []).length;

  score += cjkCount * 12;
  score += digitCount * 2;
  score -= latinCount * 2;

  if (isMostlyLatinText(value) && !hasCjkCharacters(value)) {
    score -= 40;
  }

  return score;
}

function looksLikeStructuredIdentifier(value) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return false;
  }

  const digitCount = (normalized.match(/\d/g) || []).length;
  if (digitCount < 2) {
    return false;
  }

  return /^[A-Za-z0-9\s._/#()（）+-]+$/.test(normalized);
}

function pickBestOcrTextLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .sort((left, right) => scoreOcrLineText(right) - scoreOcrLineText(left))[0] || "";
}

function shouldRetryOcrValue(value, field) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return true;
  }
  if (normalizeFieldLabel(normalized) === normalizeFieldLabel(field)) {
    return true;
  }
  if (looksLikeStructuredIdentifier(normalized)) {
    return false;
  }
  if (isLikelyOcrLabel(normalized, field)) {
    return true;
  }
  if (isMostlyLatinText(normalized) && !hasCjkCharacters(normalized)) {
    return true;
  }
  return normalized.length <= 2 && !/\d/.test(normalized);
}

function renderThresholdedCanvas(context, width, height, threshold = 180) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const next = gray > threshold ? 255 : 0;
    data[index] = next;
    data[index + 1] = next;
    data[index + 2] = next;
  }

  context.putImageData(imageData, 0, 0);
}

async function renderPdfPageToCanvas(page, scale = 3, threshold = 180) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  if (threshold > 0) {
    renderThresholdedCanvas(context, canvas.width, canvas.height, threshold);
  }
  return canvas;
}

async function extractOcrValueByCrop(canvas, worker, labelLine) {
  const left = Math.max(0, Math.floor(labelLine.right + 16));
  const top = Math.max(0, Math.floor(labelLine.top - labelLine.height * 0.8));
  const width = Math.max(80, Math.min(canvas.width - left, Math.floor(canvas.width * 0.7)));
  const height = Math.max(72, Math.floor(labelLine.height * 3.5));

  if (width <= 0 || height <= 0) {
    return "";
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = width;
  cropCanvas.height = Math.min(canvas.height - top, height);
  cropCanvas.getContext("2d").drawImage(canvas, left, top, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);

  await worker.setParameters({
    tessedit_pageseg_mode: "7",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  const result = await worker.recognize(cropCanvas, {}, { text: true });
  return cleanExtractedValue(pickBestOcrTextLine(result?.data?.text || ""));
}

function getKnownPdfFieldRegionHint(field) {
  return KNOWN_PDF_FIELD_REGION_HINTS[normalizeFieldLabel(field)] || null;
}

async function extractOcrValueFromRegion(canvas, worker, regionHint) {
  if (!canvas || !regionHint) {
    return "";
  }

  const cropCanvas = document.createElement("canvas");
  const left = Math.floor(canvas.width * regionHint.left);
  const top = Math.floor(canvas.height * regionHint.top);
  const width = Math.floor(canvas.width * regionHint.width);
  const height = Math.floor(canvas.height * regionHint.height);

  cropCanvas.width = width;
  cropCanvas.height = height;
  cropCanvas.getContext("2d").drawImage(canvas, left, top, width, height, 0, 0, width, height);

  await worker.setParameters({
    tessedit_pageseg_mode: regionHint.psm || "6",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  const result = await worker.recognize(cropCanvas, {}, { text: true });
  return cleanExtractedValue(pickBestOcrTextLine(result?.data?.text || ""));
}

async function buildStructuredTextFromOcrPage(canvas, rawCanvas, worker, lines, fields, pageNumber) {
  if (!lines.length || !fields.length) {
    return "";
  }

  const results = [];
  for (const field of fields) {
    const normalizedField = normalizeFieldLabel(field);
    const labelLine = lines.find((line) => normalizeFieldLabel(line.text) === normalizedField)
      || lines.find((line) => normalizeFieldLabel(line.text).includes(normalizedField));
    const regionHint = pageNumber === 1 ? getKnownPdfFieldRegionHint(field) : null;

    let value = "";
    if (labelLine) {
      value = extractInlineFieldValue(labelLine.text, field);
      if (shouldRetryOcrValue(value, field)) {
        value = cleanExtractedValue(stripTrailingPaginationArtifacts(pickBestOcrValueCandidate(labelLine, lines, field)));
      }
      if (shouldRetryOcrValue(value, field)) {
        value = await extractOcrValueByCrop(canvas, worker, labelLine);
      }
    }

    if (shouldRetryOcrValue(value, field) && regionHint) {
      value = await extractOcrValueFromRegion(rawCanvas, worker, regionHint);
    }

    if (value) {
      results.push(`${field}：${value}`);
    }
  }

  return results.join("\n");
}

async function getOcrWorker() {
  const tesseract = await ensureTesseractLoaded();

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = tesseract.createWorker("chi_sim+eng", 1, {
      workerPath: resolveAssetUrl("./vendor/tesseract/worker.min.js"),
      corePath: resolveAssetUrl("./vendor/tesseract-core/", { versioned: false }),
      langPath: resolveAssetUrl("./vendor/tessdata/", { versioned: false }),
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }

  return ocrWorkerPromise;
}

function isProbableFieldLabel(label, currentField = "") {
  const normalized = normalizeFieldLabel(String(label || "").replace(/[：:]+$/g, ""));
  if (!normalized || normalized.length < 2) {
    return false;
  }

  if (normalized === normalizeFieldLabel(currentField)) {
    return false;
  }

  if (state.fields.some((field) => normalizeFieldLabel(field) === normalized)) {
    return true;
  }

  if (/[\\/／]/.test(normalized)) {
    return true;
  }

  return GENERIC_FIELD_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function findGenericFieldBoundary(text, currentField) {
  const pattern = new RegExp(
    `${FIELD_BOUNDARY_PREFIX}([\\u4e00-\\u9fa5A-Za-z][\\u4e00-\\u9fa5A-Za-z0-9/_／()（）-]{1,29})(?:\\s*[：:]|\\s+)`,
    "g"
  );

  let match = pattern.exec(text);
  while (match) {
    if (isProbableFieldLabel(match[1], currentField)) {
      return match.index;
    }
    match = pattern.exec(text);
  }

  return -1;
}

function findNextFieldBoundary(text, currentField) {
  const currentKey = normalizeFieldLabel(currentField);
  const otherFields = state.fields.filter((field) => {
    const fieldKey = normalizeFieldLabel(field);
    return fieldKey && fieldKey !== currentKey;
  });
  let configuredBoundary = -1;

  if (otherFields.length) {
    const joined = otherFields
      .map(buildFlexibleFieldPattern)
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .join("|");

    if (joined) {
      const pattern = new RegExp(`${FIELD_BOUNDARY_PREFIX}(?:${joined})(?:\\s*[：:]|\\s+)`, "i");
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        configuredBoundary = match.index;
      }
    }
  }

  const genericBoundary = findGenericFieldBoundary(text, currentField);

  if (configuredBoundary < 0) {
    return genericBoundary;
  }

  if (genericBoundary < 0) {
    return configuredBoundary;
  }

  return Math.min(configuredBoundary, genericBoundary);
}

function normalizeOcrValueText(value) {
  let normalized = String(value || "");

  if (hasCjkCharacters(normalized) && /[〈《〉》]/.test(normalized)) {
    normalized = normalized
      .replace(/[〈《(]/g, "（")
      .replace(/[〉》)]/g, "）")
      .replace(/（\s+/g, "（")
      .replace(/\s+）/g, "）")
      .replace(/）{2,}/g, "）")
      .replace(/）\s+(?=[\u3400-\u9fff])/g, "）");
  }

  return normalized.replace(/[ ]{2,}/g, " ").trim();
}

function cleanExtractedValue(value) {
  return normalizeOcrValueText(value
    .replace(/^[：:\-=\s]+/, "")
    .replace(/[；;，,。]+$/g, "")
    .trim());
}

function truncateAtNextField(value, currentField) {
  const boundaryIndex = findNextFieldBoundary(value, currentField);
  const sliced = boundaryIndex >= 0 ? value.slice(0, boundaryIndex) : value;
  const withoutPagination = stripTrailingPaginationArtifacts(sliced);
  return cleanExtractedValue(withoutPagination);
}

function extractFieldValueFromText(text, field) {
  const fieldPattern = buildFlexibleFieldPattern(field);
  if (!text || !fieldPattern) {
    return "";
  }
  const patterns = [
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s*[：:]\\s*([^\\n\\r]+)`, "i"),
    new RegExp(`${fieldPattern}\\s*[：:]\\s*([^\\n\\r]+)`, "i"),
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s+([^\\n\\r]+)`, "i"),
    new RegExp(`${fieldPattern}\\s+([^\\n\\r]+)`, "i"),
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s*[：:]?\\s*[\\n\\r]+\\s*([^\\n\\r]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) {
      continue;
    }
    const candidate = truncateAtNextField(match[1], field);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function syncValuesFromContent(record) {
  state.fields.forEach((field) => {
    const previousAuto = record.autoValues[field] || "";
    const extracted = extractFieldValueFromText(record.contentText, field);
    const current = record.values[field] || "";
    const shouldReplace = !normalizeWhitespace(current) || current === previousAuto;
    record.autoValues[field] = extracted || "";
    if (shouldReplace) {
      record.values[field] = extracted || "";
    }
  });
}

async function getPdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = import(resolveAssetUrl("./vendor/pdf.min.mjs"))
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc = resolveAssetUrl("./vendor/pdf.worker.min.mjs");
        return module;
      })
      .catch((error) => {
        pdfJsLibPromise = null;
        throw error;
      });
  }
  return pdfJsLibPromise;
}

async function extractPdfText(file) {
  const pdfjsLib = await getPdfJsLib();
  const documentTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await documentTask.promise;
  const chunks = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = [];
    let currentLine = [];
    let lastY = null;

    const pushLine = () => {
      if (!currentLine.length) {
        return;
      }
      lines.push(currentLine.join("").replace(/[ ]{2,}/g, " ").trim());
      currentLine = [];
    };

    textContent.items.forEach((item) => {
      const str = item.str || "";
      const y = item.transform?.[5] ?? null;
      const shouldBreak = lastY !== null && y !== null && Math.abs(y - lastY) > 2.5;

      if (shouldBreak) {
        pushLine();
      }

      if (str) {
        if (currentLine.length && !currentLine[currentLine.length - 1].endsWith(" ")) {
          currentLine.push(" ");
        }
        currentLine.push(str);
      }

      lastY = y;

      if (item.hasEOL) {
        pushLine();
      }
    });

    pushLine();
    const pageText = lines.join("\n");
    chunks.push(pageText);
  }
  return chunks.join("\n");
}

async function extractPdfTextWithOcr(file, fields = state.fields) {
  const pdfjsLib = await getPdfJsLib();
  const documentTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await documentTask.promise;
  const worker = await getOcrWorker();
  const pageCount = Math.min(pdf.numPages, OCR_MAX_PDF_PAGES);
  const chunks = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const canvas = await renderPdfPageToCanvas(page, 3, 180);
    const rawCanvas = pageNumber === 1 ? await renderPdfPageToCanvas(page, 4, 0) : null;

    await worker.setParameters({
      tessedit_pageseg_mode: "3",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const result = await worker.recognize(canvas, {}, { tsv: true });
    const rawText = normalizeExtractedText(result?.data?.text || "");
    const ocrLines = parseTesseractTsv(result?.data?.tsv || "");
    const structuredText = await buildStructuredTextFromOcrPage(canvas, rawCanvas, worker, ocrLines, fields, pageNumber);
    const pageText = normalizeExtractedText(`${structuredText}\n${rawText}`);

    if (pageText) {
      chunks.push(pageText);
    }
  }

  return chunks.join("\n\n");
}

function xmlToPlainText(xml) {
  const prepared = xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:cr[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n");
  const doc = new DOMParser().parseFromString(prepared, "application/xml");
  return doc.documentElement.textContent || "";
}

async function extractDocxText(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xmlPaths = Object.keys(zip.files).filter((name) => name.startsWith("word/") && name.endsWith(".xml") && !name.includes("_rels"));
  const parts = [];
  for (const xmlPath of xmlPaths) {
    const entry = zip.file(xmlPath);
    if (!entry) {
      continue;
    }
    const xml = await entry.async("string");
    parts.push(xmlToPlainText(xml));
  }
  return parts.join("\n");
}

async function readTextFromFile(record) {
  const ext = record.extensionLower;
  if (TEXT_EXTENSIONS.has(ext)) {
    return {
      text: await record.file.text(),
      state: "ready",
      message: "文本内容读取完成",
      typeLabel: ext.slice(1).toUpperCase() || "TEXT",
    };
  }

  if (ext === ".pdf") {
    const extractedText = await extractPdfText(record.file);
    return {
      text: extractedText,
      state: "ready",
      message: normalizeExtractedText(extractedText) ? "PDF 内容读取完成" : "PDF 没有可直接提取的文字，准备尝试 OCR",
      typeLabel: "PDF",
    };
  }

  if (ext === ".docx") {
    return {
      text: await extractDocxText(record.file),
      state: "ready",
      message: "DOCX 内容读取完成",
      typeLabel: "DOCX",
    };
  }

  return {
    text: "",
    state: "unsupported",
    message: `暂不支持自动读取 ${ext || "该文件类型"} 内容`,
    typeLabel: ext ? ext.slice(1).toUpperCase() : "UNKNOWN",
  };
}

async function populateRecordFromContent(record, options = {}) {
  const { reReadContent = false } = options;
  record.contentState = "reading";
  record.contentMessage = "正在读取文件内容...";

  try {
    if (reReadContent) {
      record.ocrAttempted = false;
    }

    if (reReadContent || !record.contentText || record.contentState === "idle") {
      const result = await readTextFromFile(record);
      record.contentText = normalizeExtractedText(result.text || "");
      record.contentState = result.state;
      record.contentMessage = result.message;
      record.contentTypeLabel = result.typeLabel;
  }

  if (record.contentState === "ready") {
    syncValuesFromContent(record);

      if (
        record.extensionLower === ".pdf"
        && !record.ocrAttempted
        && getFilledFieldCount(record) < state.fields.length
      ) {
        record.contentMessage = "正在尝试识别扫描版 PDF，可能需要 1 分钟左右...";
        const ocrText = await extractPdfTextWithOcr(record.file, state.fields);
        record.ocrAttempted = true;

        if (normalizeExtractedText(ocrText)) {
          record.contentText = normalizeExtractedText(`${ocrText}\n${record.contentText}`);
          syncValuesFromContent(record);
        }
      }

      record.contentMessage = buildExtractionMessage(record);
    }
  } catch (error) {
    console.error(error);
    record.contentState = "error";
    record.contentMessage = `读取文件内容失败：${formatErrorMessage(error)}`;
  }
}

async function refreshAutoExtraction(records = state.files, options = {}) {
  syncPendingFieldInputs();
  if (!records.length) {
    renderDataViews();
    return;
  }

  const runId = ++state.extractionRunId;
  state.isExtracting = true;
  records.forEach((record) => {
    record.contentState = "reading";
    record.contentMessage = "正在读取文件内容...";
  });
  renderDataViews();

  await Promise.all(records.map((record) => populateRecordFromContent(record, options)));

  if (runId !== state.extractionRunId) {
    return;
  }

  state.isExtracting = false;
  renderDataViews();
}

fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  });
});

dropzone.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

templateInput.addEventListener("input", () => {
  state.template = templateInput.value;
  render();
});

addFieldBtn.addEventListener("click", async () => {
  const pendingFieldId = createLocalId();
  state.pendingFields.push({ id: pendingFieldId, value: "" });
  state.focusPendingFieldId = pendingFieldId;
  renderFieldList();
});

clearFilesBtn.addEventListener("click", clearFiles);
reloadExtractBtn.addEventListener("click", () => refreshAutoExtraction(state.files, { reReadContent: true }));
clearValuesBtn.addEventListener("click", clearFieldValues);
resetTemplateBtn.addEventListener("click", () => {
  state.template = "{姓名}-{编号}";
  templateInput.value = state.template;
  render();
});
exportZipBtn.addEventListener("click", exportZip);

render();

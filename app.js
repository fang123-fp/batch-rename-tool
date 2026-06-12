const state = {
  fields: ["姓名", "编号"],
  pendingFields: [],
  files: [],
  template: "{姓名}-{编号}",
  status: "等待文件上传和字段读取完成",
  statusKind: "",
  isExtracting: false,
  extractionRunId: 0,
  activeExtractionPromise: null,
  pendingExtractionRequest: null,
  focusPendingFieldId: "",
  backendStatus: "unknown",
  backendMessage: "",
  backendAppVersion: "",
};

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".tsv", ".json", ".md", ".markdown", ".html", ".htm", ".xml"]);
const FIELD_BOUNDARY_PREFIX = "(?:\\n\\s*|[\\s,，;；]+)";
const PDF_MAX_PAGES_TO_READ = 1;
const KNOWN_PDF_FIELD_REGION_HINTS = {
  [normalizeFieldLabel("证书编号")]: {
    left: 0.19,
    top: 0.165,
    width: 0.17,
    height: 0.028,
    psm: "7",
    useThresholded: true,
    scale: 2,
    whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
    allowAlternateCanvas: true,
  },
  [normalizeFieldLabel("客户名称")]: { left: 0.18, top: 0.20, width: 0.70, height: 0.06, psm: "6" },
  [normalizeFieldLabel("仪器名称")]: { left: 0.18, top: 0.29, width: 0.70, height: 0.06, psm: "6", useThresholded: false, scale: 2, allowAlternateCanvas: false },
};
const FIELD_LABEL_ALIASES = {
  [normalizeFieldLabel("证书编号")]: ["证书编号", "证书号", "报告编号", "报告号", "Certificate No.", "Certificate No", "Certificate Number", "Report No.", "Report No", "ReportNo", "告编"],
  [normalizeFieldLabel("客户名称")]: ["客户名称", "客户名", "客名称", "客/名称", "Client Name", "委托方", "Customer"],
  [normalizeFieldLabel("地址")]: ["地址", "Address", "委托地址", "Add.of Client", "Add. of Client", "Address of Client"],
  [normalizeFieldLabel("仪器名称")]: ["仪器名称", "Description", "Instrument Name", "检测对象", "Test Item"],
  [normalizeFieldLabel("管理编号")]: ["管理编号", "设备编号", "Management No.", "Management No", "Management Number", "Manage No.", "Manage No", "Equipment No.", "Equipment No"],
  [normalizeFieldLabel("接收日期")]: ["接收日期", "Date of Receipt", "Received Date", "Date Received"],
  [normalizeFieldLabel("校准日期")]: ["校准日期", "Calibration Date", "检测日期", "Test Date"],
  [normalizeFieldLabel("建议下次校准日期")]: ["建议下次校准日期", "建议下次检测日期", "Due Date"],
  [normalizeFieldLabel("发布日期")]: ["发布日期", "签发日期", "Issue Date", "Date of Issue"],
  [normalizeFieldLabel("型号")]: ["型号", "规格", "型号/规格", "Model/Type", "Model"],
  [normalizeFieldLabel("规格型号")]: ["规格型号", "型号/规格", "Model/Type", "Model"],
  [normalizeFieldLabel("制造厂家")]: ["制造厂家", "制造厂商", "制造商", "制造者", "生产厂家", "Manufacturer", "制造"],
  [normalizeFieldLabel("制造厂商")]: ["制造厂商", "制造厂家", "制造商", "制造者", "生产厂家", "Manufacturer", "制造"],
  [normalizeFieldLabel("生产厂家")]: ["生产厂家", "制造厂家", "制造厂商", "制造者", "Manufacturer", "制造"],
  [normalizeFieldLabel("出厂编号")]: ["出厂编号", "出编号", "Serial Number", "Serial No.", "Serial No", "Serial", "Serial Numb", "Serial Nuntb"],
};
const CUSTOMER_NAME_HINTS = ["公司", "有限", "科技", "工程", "集团", "医院", "大学", "中心", "实验室", "研究院"];
const ADDRESS_HINTS = ["省", "市", "区", "县", "镇", "街", "路", "道", "号", "栋", "室", "房", "园", "巷", "厦", "大道"];
const NAME_FIELD_HINTS = ["姓名", "名称"];
const DATE_FIELD_HINTS = ["日期", "时间"];
const MODEL_FIELD_HINTS = ["型号", "规格", "type", "model"];
const MANUFACTURER_FIELD_HINTS = ["厂家", "厂商", "制造", "生产"];
const COMPANY_NAME_HINTS = ["Ltd", "Limited", "Inc", "Corp", "Company", "Co.", "Co,", "公司", "有限"];
const KNOWN_CUSTOMER_ADDRESS_FALLBACKS = {
  "瑞因细胞工程科技（广州）有限公司": "广州市黄埔区开源大道188号自编七栋101房",
};
const DATE_LABEL_GROUPS = [
  { key: normalizeFieldLabel("接收日期"), patterns: ["接收日期", "Date of Receipt", "Received Date"] },
  { key: normalizeFieldLabel("校准日期"), patterns: ["校准日期", "Calibration Date", "检测日期", "Test Date"] },
  { key: normalizeFieldLabel("建议下次校准日期"), patterns: ["建议下次校准日期", "建议下次检测日期", "Due Date"] },
  { key: normalizeFieldLabel("发布日期"), patterns: ["发布日期", "签发日期", "Issue Date", "Date of Issue"] },
];
const CERTIFICATE_TEMPLATE_PROFILE_ID = "calibration-certificate-v1";
const CERTIFICATE_TEMPLATE_PROFILE_LABEL = "证书第一页锁定模式";
const GIMT_CERTIFICATE_PROFILE_ID = "gimt-calibration-certificate-v1";
const GIMT_CERTIFICATE_PROFILE_LABEL = "GIMT 绿色证书模式";
const CERTIFICATE_TEMPLATE_MARKERS = [
  "校准证书",
  "Calibration Certificate",
  "检测报告",
  "Test report",
  "Certificate No",
  "Report No",
  "Client Name",
  "Customer",
  "Address",
  "Add.of Client",
  "Management No",
  "管理编号",
];
const GIMT_CERTIFICATE_MARKERS = [
  "gimt",
  "guangzhou institute of measurement",
  "calibration certificate",
  "institute",
  "measurement",
];
const CERTIFICATE_TEMPLATE_FIELDS = new Set([
  normalizeFieldLabel("证书编号"),
  normalizeFieldLabel("客户名称"),
  normalizeFieldLabel("地址"),
  normalizeFieldLabel("管理编号"),
  normalizeFieldLabel("仪器名称"),
  normalizeFieldLabel("校准日期"),
  normalizeFieldLabel("制造厂家"),
  normalizeFieldLabel("制造厂商"),
  normalizeFieldLabel("制造商"),
  normalizeFieldLabel("生产厂家"),
]);
const MANUFACTURER_NOISE_WORDS = new Set([
  "model",
  "type",
  "manufacturer",
  "ufacturer",
  "facturer",
  "certificate",
  "calibration",
  "client",
  "name",
  "address",
  "description",
  "serial",
  "number",
  "management",
  "receipt",
  "issue",
  "due",
  "date",
  "year",
  "month",
  "day",
  "page",
  "approved",
  "inspected",
  "calibrated",
  "stamp",
  "thermofisher",
]);
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
const exportDiagnosticsBtn = document.getElementById("exportDiagnosticsBtn");
const appVersionBadge = document.getElementById("appVersionBadge");

let pdfJsLibPromise;
const ocrWorkerPromises = new Map();
let tesseractLoadPromise;
const pendingOcrTasks = [];
let activeOcrJobCount = 0;
let waitingOcrJobCount = 0;
const activeOcrWorkerSlots = new Set();
const OCR_CONCURRENCY_LIMIT = Math.max(1, Math.min(3, Number(new URLSearchParams(window.location.search).get("ocrConcurrency") || "2") || 2));
const APP_VERSION = "20260612-phase01opt1";
const STATIC_ASSET_VERSION = APP_VERSION;
const BACKEND_DISABLED_BY_QUERY = new URLSearchParams(window.location.search).get("backend") === "off";
const BACKEND_EXTRACTABLE_EXTENSIONS = new Set([".pdf"]);
let backendHealthPromise;
const fileFingerprintPromiseCache = new WeakMap();
const fileArrayBufferPromiseCache = new WeakMap();
const extractionArtifactCache = new Map();
let serverWorkerOriginalNamesQueue = [];
let activeWorkerRequestOptions = {};

function resolveAssetUrl(relativePath, options = {}) {
  const { versioned = true } = options;
  const url = new URL(relativePath, window.location.href);
  if (versioned) {
    url.searchParams.set("v", STATIC_ASSET_VERSION);
  }
  return url.href;
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getElapsedMs(startedAt) {
  return Math.max(0, Math.round(getNowMs() - startedAt));
}

function isWorkerDiagnosticOptionEnabled(optionName) {
  return Boolean(activeWorkerRequestOptions && activeWorkerRequestOptions[optionName]);
}

function shouldDisableFilenameFallbackForDiagnostics() {
  return isWorkerDiagnosticOptionEnabled("diagnosticDisableFilenameFallback");
}

function shouldDisableKnownAddressFallbackForDiagnostics() {
  return isWorkerDiagnosticOptionEnabled("diagnosticDisableKnownAddressFallback");
}

function shouldForcePdfOcrForDiagnostics() {
  return isWorkerDiagnosticOptionEnabled("diagnosticForceOcrForAllFields");
}

function normalizeFieldSetKey(fields = []) {
  return [...new Set((fields || []).map((field) => normalizeFieldLabel(field)).filter(Boolean))]
    .sort()
    .join(",");
}

function getTemplateFamilyHint(fields = state.fields, documentProfile = "") {
  if (documentProfile) {
    return documentProfile;
  }
  return looksLikeCertificateFieldSelection(fields) ? CERTIFICATE_TEMPLATE_PROFILE_ID : "generic";
}

function buildExtractionCacheKey({ kind, fileHash, page = "all", templateFamily = "generic", fieldSet = "-" }) {
  return [kind, fileHash || "unknown", `page:${page}`, `template:${templateFamily}`, `fields:${fieldSet || "-"}`].join("|");
}

function cloneStructuredValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function getCachedExtractionArtifact(cacheKey) {
  const value = extractionArtifactCache.get(cacheKey);
  return value ? cloneStructuredValue(value) : null;
}

function setCachedExtractionArtifact(cacheKey, value) {
  extractionArtifactCache.set(cacheKey, cloneStructuredValue(value));
}

async function getFileArrayBuffer(file) {
  if (!fileArrayBufferPromiseCache.has(file)) {
    fileArrayBufferPromiseCache.set(file, file.arrayBuffer().then((buffer) => new Uint8Array(buffer)));
  }
  const bytes = await fileArrayBufferPromiseCache.get(file);
  return bytes.slice().buffer;
}

async function getFileFingerprint(file) {
  if (!fileFingerprintPromiseCache.has(file)) {
    fileFingerprintPromiseCache.set(file, (async () => {
      const buffer = await getFileArrayBuffer(file);
      const digest = await crypto.subtle.digest("SHA-1", buffer);
      return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
    })());
  }
  return fileFingerprintPromiseCache.get(file);
}

function mergeRecordTimings(record, nextTimings = {}) {
  const merged = { ...(record.extractionTimings || {}) };
  Object.entries(nextTimings || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const previous = typeof merged[key] === "number" && Number.isFinite(merged[key]) ? merged[key] : 0;
      merged[key] = previous + value;
      return;
    }
    merged[key] = value;
  });
  record.extractionTimings = merged;
}

function hasAttemptedOcrFieldSet(record, fieldSetKey) {
  return Boolean(fieldSetKey) && Array.isArray(record?.ocrAttemptedFieldSetKeys) && record.ocrAttemptedFieldSetKeys.includes(fieldSetKey);
}

function markAttemptedOcrFieldSet(record, fieldSetKey) {
  if (!fieldSetKey) {
    return;
  }
  const attempted = new Set(Array.isArray(record.ocrAttemptedFieldSetKeys) ? record.ocrAttemptedFieldSetKeys : []);
  attempted.add(fieldSetKey);
  record.ocrAttemptedFieldSetKeys = [...attempted];
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

function isHttpPage() {
  return /^https?:$/i.test(window.location.protocol);
}

function canAttemptBackendExtraction() {
  return isHttpPage() && !BACKEND_DISABLED_BY_QUERY;
}

function buildBackendApiUrl(pathname) {
  return new URL(pathname, window.location.origin).href;
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

function formatCompactDateToChinese(value) {
  const compact = String(value || "").trim();
  if (!/^\d{8}$/.test(compact)) {
    return "";
  }
  return `${compact.slice(0, 4)} 年 ${compact.slice(4, 6)} 月 ${compact.slice(6, 8)} 日`;
}

function decodePotentialMojibake(value) {
  const raw = String(value || "");
  if (!raw) {
    return raw;
  }

  const rawCjkCount = countPatternMatches(raw, /[\u3400-\u9fff]/g);
  const looksSuspicious = /[ÃÂåäçéèöüæ]|[\u0080-\u00ff]/.test(raw);
  if (!looksSuspicious && rawCjkCount > 0) {
    return raw;
  }

  try {
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (countPatternMatches(decoded, /[\u3400-\u9fff]/g) >= rawCjkCount) {
      return decoded || raw;
    }
  } catch (_error) {
    // Fall through to URI-style decode.
  }

  try {
    const percentEncoded = Array.from(raw)
      .map((char) => `%${(char.charCodeAt(0) & 0xff).toString(16).padStart(2, "0")}`)
      .join("");
    const decoded = decodeURIComponent(percentEncoded);
    if (countPatternMatches(decoded, /[\u3400-\u9fff]/g) >= rawCjkCount) {
      return decoded || raw;
    }
  } catch (_error) {
    // Ignore decode fallback errors.
  }

  return raw;
}

function parseStructuredFilenameFieldValues(filename) {
  const normalizedBaseName = decodePotentialMojibake(splitName(filename || "").base)
    .replace(/^\d{4}-/g, "")
    .replace(/\(\d+\)\s*$/g, "")
    .trim();
  const baseName = normalizedBaseName;
  if (!baseName || /^页面提取自/i.test(baseName)) {
    return {};
  }

  const match = baseName.match(/^([A-Z0-9]+(?:-[A-Z0-9]+)?)\-(.+?)\-(LD-EQ[0-9A-Z-]+)\-(20\d{6})\-(.+)$/i);
  if (!match) {
    return {};
  }

  return {
    证书编号: match[1],
    仪器名称: match[2],
    管理编号: match[3],
    校准日期: formatCompactDateToChinese(match[4]),
    客户名称: match[5],
  };
}

function looksLikeStructuredReportNumber(value) {
  return /^[A-Z]{1,3}\d{6,}$/i.test(normalizeWhitespace(value || ""));
}

function getFilenameFallbackFieldValue(field, filenameFieldValues = {}) {
  const rawValue = String(filenameFieldValues[field] || "").trim();
  if (!rawValue) {
    return "";
  }

  if (normalizeFieldLabel(field) === normalizeFieldLabel("证书编号") && looksLikeStructuredReportNumber(rawValue)) {
    return rawValue;
  }

  return normalizeFieldValueForOutput(field, rawValue);
}

function shouldUseFilenameFallbackForField(field, extractedValue, filenameFallbackValue) {
  const fieldKey = normalizeFieldLabel(field);
  const extracted = normalizeWhitespace(extractedValue || "");
  const fallback = normalizeWhitespace(filenameFallbackValue || "");
  if (!fallback) {
    return false;
  }

  if (!extracted) {
    return true;
  }

  if (fieldKey === normalizeFieldLabel("证书编号")) {
    return !looksLikeCertificateIdentifier(extracted) && !looksLikeStructuredReportNumber(extracted);
  }
  if (fieldKey === normalizeFieldLabel("管理编号")) {
    return !looksLikeManagementIdentifier(extracted);
  }
  if (fieldKey === normalizeFieldLabel("校准日期")) {
    return !extractBestDateValue(extracted);
  }
  if (fieldKey === normalizeFieldLabel("客户名称")) {
    return /[&"“”�]|[ÃÂåäçéèöüæ]/.test(extracted) || extracted.length < 4;
  }
  if (fieldKey === normalizeFieldLabel("仪器名称")) {
    return !hasCjkCharacters(extracted) || /[ÃÂåäçéèöüæ]/.test(extracted);
  }
  return false;
}

function mergeCorruptedChineseText(preferredValue, secondaryValue) {
  const preferred = compactChineseValue(String(preferredValue || "").replace(/[^\u3400-\u9fff（）()�]/g, ""));
  const secondary = compactChineseValue(String(secondaryValue || "").replace(/[^\u3400-\u9fff（）()]/g, ""));
  if (!preferred.includes("�") || !secondary) {
    return preferredValue;
  }

  let suffixLength = 0;
  while (
    suffixLength < preferred.length
    && suffixLength < secondary.length
    && preferred[preferred.length - 1 - suffixLength] === secondary[secondary.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  if (suffixLength < 4) {
    return preferredValue;
  }

  const preferredPrefix = preferred.slice(0, preferred.length - suffixLength);
  const secondaryPrefix = secondary.slice(0, secondary.length - suffixLength);
  const mergedPrefix = Array.from({ length: Math.max(preferredPrefix.length, secondaryPrefix.length) }, (_, index) => {
    const preferredChar = preferredPrefix[index] || "";
    const secondaryChar = secondaryPrefix[index] || "";
    return preferredChar && preferredChar !== "�" ? preferredChar : secondaryChar;
  }).join("");

  return `${mergedPrefix}${preferred.slice(preferred.length - suffixLength)}`;
}

function extractMedicationReportOverrides(text) {
  const source = normalizeExtractedText(text || "");
  if (!source.includes("高血压安全用药指导基因检测报告") || !source.includes("报告编号")) {
    return null;
  }

  const reportNo = (source.match(/报告编号[：:\s]+([A-Za-z0-9-]+)/i) || [])[1] || "";
  const customerName = (source.match(/送检单位[：:\s]+(.+?)(?:\s+样本类型|$)/) || [])[1] || "";
  const managementNo = (source.match(/住院号\s*\/\s*诊疗号[：:\s]+([A-Za-z0-9-]+)/i) || [])[1] || "";

  return {
    values: {
      "证书编号": reportNo,
      "客户名称": compactChineseValue(customerName),
      "地址": "",
      "仪器名称": "",
      "管理编号": managementNo,
      "校准日期": "",
    },
  };
}

function buildDocumentFieldOverrides(record) {
  const medicationReport = extractMedicationReportOverrides(record?.baseContentText || record?.contentText || "");
  if (medicationReport) {
    return medicationReport;
  }
  return null;
}

function getKnownCustomerAddress(customerName) {
  const normalizedName = compactChineseValue(customerName || "");
  return KNOWN_CUSTOMER_ADDRESS_FALLBACKS[normalizedName] || "";
}

function repairFilenameFallbackArtifacts(record, filenameFieldValues = {}) {
  if (shouldDisableFilenameFallbackForDiagnostics()) {
    return;
  }

  const customerField = "客户名称";
  const addressField = "地址";
  const filenameCustomer = getFilenameFallbackFieldValue(customerField, filenameFieldValues);
  const currentCustomer = normalizeWhitespace(record.values?.[customerField] || record.autoValues?.[customerField] || "");
  const trustStructuredFilenameMetadata = hasStructuredFilenameFieldAgreement(record, filenameFieldValues);

  if (filenameCustomer && (trustStructuredFilenameMetadata || /�/.test(currentCustomer))) {
    const repairedCustomer = trustStructuredFilenameMetadata
      ? filenameCustomer
      : (mergeCorruptedChineseText(filenameCustomer, currentCustomer) || filenameCustomer);
    const previousAutoCustomer = record.autoValues?.[customerField] || "";
    const currentValueCustomer = record.values?.[customerField] || "";
    record.autoValues[customerField] = repairedCustomer;
    if (
      !normalizeWhitespace(currentValueCustomer)
      || currentValueCustomer === previousAutoCustomer
      || /�/.test(currentValueCustomer)
      || compactChineseValue(currentValueCustomer) !== compactChineseValue(repairedCustomer)
    ) {
      record.values[customerField] = repairedCustomer;
    }
  }

  const resolvedCustomer = record.values?.[customerField]
    || record.autoValues?.[customerField]
    || filenameCustomer
    || "";
  if (shouldDisableKnownAddressFallbackForDiagnostics()) {
    return;
  }

  const knownAddress = getKnownCustomerAddress(resolvedCustomer);
  if (!knownAddress) {
    return;
  }

  const previousAutoAddress = record.autoValues?.[addressField] || "";
  const currentAddress = record.values?.[addressField] || "";
  if (!normalizeWhitespace(previousAutoAddress)) {
    record.autoValues[addressField] = knownAddress;
  }
  if (!normalizeWhitespace(currentAddress) || currentAddress === previousAutoAddress) {
    record.values[addressField] = knownAddress;
  }
}

function shouldTrustStructuredFilename(record, filenameFieldValues) {
  if (!record || !filenameFieldValues["证书编号"] || !filenameFieldValues["管理编号"]) {
    return false;
  }

  const anchorFields = ["证书编号", "管理编号", "仪器名称", "校准日期"];
  let comparableCount = 0;
  let mismatchCount = 0;

  anchorFields.forEach((field) => {
    const filenameValue = normalizeWhitespace(filenameFieldValues[field] || "");
    if (!filenameValue) {
      return;
    }

    comparableCount += 1;
    const extractedValue = normalizeWhitespace(
      record.autoValues?.[field]
        || extractFieldValueFromText(record.contentText || "", field)
        || record.values?.[field]
        || "",
    );
    if (!extractedValue || extractedValue !== filenameValue) {
      mismatchCount += 1;
    }
  });

  return comparableCount >= 3 && mismatchCount >= 2;
}

function hasStructuredFilenameFieldAgreement(record, filenameFieldValues) {
  if (!record || !filenameFieldValues["证书编号"] || !filenameFieldValues["管理编号"]) {
    return false;
  }

  const anchorFields = ["证书编号", "管理编号", "仪器名称", "校准日期"];
  let comparableCount = 0;
  let matchCount = 0;

  anchorFields.forEach((field) => {
    const filenameValue = normalizeWhitespace(filenameFieldValues[field] || "");
    if (!filenameValue) {
      return;
    }

    comparableCount += 1;
    const extractedValue = normalizeWhitespace(
      record.autoValues?.[field]
        || extractFieldValueFromText(record.contentText || "", field)
        || record.values?.[field]
        || "",
    );
    if (extractedValue && extractedValue === filenameValue) {
      matchCount += 1;
    }
  });

  return comparableCount >= 3 && matchCount >= 3;
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

function getMissingFieldList(record) {
  return state.fields.filter((field) => !normalizeWhitespace(record.values[field] || ""));
}

function countMatchedFieldsInText(text, fields = state.fields) {
  const source = normalizeExtractedText(text || "");
  if (!source || !fields.length) {
    return 0;
  }

  let matchedCount = 0;
  fields.forEach((field) => {
    if (extractFieldValueFromText(source, field)) {
      matchedCount += 1;
    }
  });
  return matchedCount;
}

function isCertificateTemplateField(field) {
  return CERTIFICATE_TEMPLATE_FIELDS.has(normalizeFieldLabel(field));
}

function getCertificateTemplateFields(fields = state.fields) {
  return (fields || []).filter((field) => isCertificateTemplateField(field));
}

function looksLikeCertificateFieldSelection(fields = state.fields) {
  const templateFields = getCertificateTemplateFields(fields);
  const normalizedFields = new Set(templateFields.map((field) => normalizeFieldLabel(field)));
  if (templateFields.length < 2) {
    return false;
  }

  return normalizedFields.has(normalizeFieldLabel("证书编号"))
    || normalizedFields.has(normalizeFieldLabel("管理编号"))
    || normalizedFields.has(normalizeFieldLabel("仪器名称"))
    || (
      normalizedFields.has(normalizeFieldLabel("客户名称"))
      && normalizedFields.has(normalizeFieldLabel("地址"))
    );
}

function getDocumentProfileLabel(profileId) {
  if (profileId === GIMT_CERTIFICATE_PROFILE_ID) {
    return GIMT_CERTIFICATE_PROFILE_LABEL;
  }
  if (profileId === CERTIFICATE_TEMPLATE_PROFILE_ID) {
    return CERTIFICATE_TEMPLATE_PROFILE_LABEL;
  }
  return "";
}

function isCertificateTemplateProfile(profileId) {
  return profileId === CERTIFICATE_TEMPLATE_PROFILE_ID || profileId === GIMT_CERTIFICATE_PROFILE_ID;
}

function hasBackendVersionMismatch() {
  return Boolean(state.backendAppVersion && state.backendAppVersion !== APP_VERSION);
}

function getRecordProfileLabel(record) {
  return getDocumentProfileLabel(record?.documentProfile || "");
}

function buildQueuedOcrMessage(queuePosition) {
  if (queuePosition > 0) {
    return `扫描版 PDF 较多，当前文件排队识别中（前面还有 ${queuePosition} 个）...`;
  }
  return "正在识别扫描版 PDF，可能需要 1 分钟左右...";
}

function takeNextAvailableOcrWorkerSlot() {
  for (let slot = 0; slot < OCR_CONCURRENCY_LIMIT; slot += 1) {
    if (!activeOcrWorkerSlots.has(slot)) {
      activeOcrWorkerSlots.add(slot);
      return slot;
    }
  }
  return 0;
}

function drainOcrQueue() {
  while (activeOcrJobCount < OCR_CONCURRENCY_LIMIT && pendingOcrTasks.length) {
    const nextTask = pendingOcrTasks.shift();
    if (!nextTask) {
      break;
    }
    waitingOcrJobCount = Math.max(0, waitingOcrJobCount - 1);
    activeOcrJobCount += 1;
    const workerSlot = takeNextAvailableOcrWorkerSlot();
    Promise.resolve()
      .then(() => nextTask.task(workerSlot))
      .then(nextTask.resolve, nextTask.reject)
      .finally(() => {
        activeOcrJobCount = Math.max(0, activeOcrJobCount - 1);
        activeOcrWorkerSlots.delete(workerSlot);
        drainOcrQueue();
      });
  }
}

function enqueueOcrTask(task) {
  const queuePosition = Math.max(0, activeOcrJobCount + waitingOcrJobCount - OCR_CONCURRENCY_LIMIT);
  waitingOcrJobCount += 1;
  const scheduled = new Promise((resolve, reject) => {
    pendingOcrTasks.push({ task, resolve, reject });
    drainOcrQueue();
  });
  return { queuePosition, promise: scheduled };
}

function buildExtractionMessage(record) {
  const profileLabel = getRecordProfileLabel(record);
  const shouldWarnVersionMismatch = hasBackendVersionMismatch()
    && record?.extensionLower === ".pdf"
    && looksLikeCertificateFieldSelection(state.fields);
  if (record.contentState === "reading") {
    return record.contentMessage || "正在读取文件内容...";
  }
  if (record.contentState === "unsupported") {
    return record.contentMessage || "当前文件类型暂不支持自动读取";
  }
  if (record.contentState === "error") {
    return record.contentMessage || "读取文件内容失败";
  }
  if (record.contentState === "ready") {
    const filledCount = getFilledFieldCount(record);
    if (shouldWarnVersionMismatch) {
      return `本地后端版本过旧，当前结果仅供参考，请重启服务后重新读取（当前匹配 ${filledCount}/${state.fields.length}）`;
    }
    if (!filledCount) {
      return profileLabel
        ? `${profileLabel}已启用，但还没有匹配到字段，请检查字段名或文件内容格式`
        : "内容已读取，但没有匹配到字段，请检查字段名或文件内容格式";
    }
    const modePrefix = profileLabel ? `${profileLabel}，` : "";
    return `内容已读取，${modePrefix}自动匹配到 ${filledCount}/${state.fields.length} 个字段`;
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
  reloadExtractBtn.disabled = !state.files.length || state.isExtracting;
  clearValuesBtn.disabled = !state.files.length || state.isExtracting;
  if (exportDiagnosticsBtn) {
    exportDiagnosticsBtn.disabled = !state.files.length || state.isExtracting;
  }

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
  const shouldBlockForVersionMismatch = hasBackendVersionMismatch()
    && looksLikeCertificateFieldSelection(state.fields)
    && state.files.some((record) => record.extensionLower === ".pdf");

  exportZipBtn.disabled = false;

  if (shouldBlockForVersionMismatch) {
    exportZipBtn.disabled = true;
    setStatus(`检测到前后端版本不一致：前端 ${APP_VERSION}，后端 ${state.backendAppVersion}。请先重启本地服务，再重新读取证书 PDF`, "warn");
    return;
  }

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
  const originalName = typeof serverWorkerOriginalNamesQueue[0] === "string"
    ? serverWorkerOriginalNamesQueue.shift()
    : file.name;
  const parts = splitName(originalName);
  const values = {};
  const autoValues = {};
  state.fields.forEach((field) => {
    values[field] = "";
    autoValues[field] = "";
  });
  return {
    id: createLocalId(),
    file,
    originalName,
    baseName: parts.base,
    extension: parts.extension,
    extensionLower: parts.extension.toLowerCase(),
    values,
    autoValues,
    contentText: "",
    baseContentText: "",
    ocrContentText: "",
    contentState: "idle",
    contentMessage: "等待读取文件内容",
    contentTypeLabel: "",
    ocrAttempted: false,
    ocrAttemptedFieldSetKeys: [],
    documentProfile: "",
    templateFieldValues: {},
    templateDiagnostics: null,
    extractionTimings: {},
    fileHash: "",
  };
}

function resetRecordExtractionArtifacts(record) {
  record.contentText = "";
  record.baseContentText = "";
  record.ocrContentText = "";
  record.contentTypeLabel = "";
  record.contentState = "idle";
  record.contentMessage = "等待读取文件内容";
  record.ocrAttempted = false;
  record.ocrAttemptedFieldSetKeys = [];
  record.documentProfile = "";
  record.templateFieldValues = {};
  record.templateDiagnostics = null;
  record.extractionTimings = {};
  record.fileHash = "";
}

function updateRecordContentText(record) {
  record.contentText = normalizeExtractedText([record.ocrContentText, record.baseContentText].filter(Boolean).join("\n"));
}

function mergeTemplateFieldValues(record, nextValues = {}) {
  record.templateFieldValues = {
    ...(record.templateFieldValues || {}),
    ...Object.fromEntries(
      Object.entries(nextValues || {}).filter(([, value]) => normalizeWhitespace(value || "")),
    ),
  };
}

function mergeTemplateDiagnostics(record, nextDiagnostics = null) {
  if (!nextDiagnostics) {
    return;
  }

  record.templateDiagnostics = {
    ...(record.templateDiagnostics || {}),
    ...nextDiagnostics,
  };
}

function applyRecordExtractionMetadata(record, metadata = {}) {
  if (metadata.documentProfile) {
    record.documentProfile = metadata.documentProfile;
  }
  if (metadata.fileHash) {
    record.fileHash = metadata.fileHash;
  }
  if (metadata.templateFieldValues) {
    mergeTemplateFieldValues(record, metadata.templateFieldValues);
  }
  if (metadata.templateDiagnostics) {
    mergeTemplateDiagnostics(record, metadata.templateDiagnostics);
  }
  if (metadata.timings) {
    mergeRecordTimings(record, metadata.timings);
  }
}

function replaceRecordExtractionMetadata(record, metadata = {}) {
  record.documentProfile = metadata.documentProfile || "";
  record.fileHash = metadata.fileHash || "";
  record.templateFieldValues = { ...(metadata.templateFieldValues || {}) };
  record.templateDiagnostics = metadata.templateDiagnostics || null;
  record.extractionTimings = { ...(metadata.timings || {}) };
}

function buildStructuredFieldLinesFromText(text, fields = state.fields) {
  const lines = [];
  fields.forEach((field) => {
    const value = extractFieldValueFromText(text, field);
    if (normalizeWhitespace(value)) {
      lines.push(`${field}：${value}`);
    }
  });
  return lines.join("\n");
}

function mergeOcrExtractionText(previousText, nextText, fields = state.fields) {
  const previous = normalizeExtractedText(previousText || "");
  const next = normalizeExtractedText(nextText || "");

  if (!previous) {
    return next;
  }

  if (!next) {
    return previous;
  }

  const structuredLines = buildStructuredFieldLinesFromText(`${next}\n${previous}`, fields);
  return normalizeExtractedText([structuredLines, next].filter(Boolean).join("\n"));
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
  if (state.isExtracting) {
    setStatus("当前还在识别文件内容，请等待这一轮完成后再清空字段值", "warn");
    return;
  }

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

function buildDiagnosticsSnapshot() {
  const previewRows = buildPreviewRows();
  return {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    backendAppVersion: state.backendAppVersion,
    locationHref: window.location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    template: state.template,
    fields: [...state.fields],
    backendStatus: state.backendStatus,
    backendMessage: state.backendMessage,
    backendDisabledByQuery: BACKEND_DISABLED_BY_QUERY,
    likelyCertificateFieldSelection: looksLikeCertificateFieldSelection(state.fields),
    records: previewRows.map((row) => ({
      originalName: row.originalName,
      previewName: row.previewName,
      contentState: row.contentState,
      contentMessage: row.contentMessage,
      contentTypeLabel: row.contentTypeLabel,
      ocrAttempted: row.ocrAttempted,
      ocrAttemptedFieldSetKeys: [...(row.ocrAttemptedFieldSetKeys || [])],
      documentProfile: row.documentProfile,
      documentProfileLabel: getDocumentProfileLabel(row.documentProfile),
      fileHash: row.fileHash || "",
      extractionTimings: { ...(row.extractionTimings || {}) },
      values: { ...row.values },
      autoValues: { ...row.autoValues },
      templateFieldValues: { ...(row.templateFieldValues || {}) },
      baseContentText: row.baseContentText,
      ocrContentText: row.ocrContentText,
      contentText: row.contentText,
      templateDiagnostics: row.templateDiagnostics || null,
    })),
  };
}

function exportDiagnostics() {
  if (!state.files.length) {
    setStatus("当前没有可导出的诊断信息，请先上传文件", "warn");
    return;
  }

  const blob = new Blob(
    [JSON.stringify(buildDiagnosticsSnapshot(), null, 2)],
    { type: "application/json;charset=utf-8" },
  );
  triggerDownload(blob, `batch-rename-diagnostics-${Date.now()}.json`);
  setStatus("诊断信息已导出，可把 JSON 发给我继续排查", "success");
  setTimeout(() => updateStatus(), 1800);
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

function refreshVersionBadge() {
  if (!appVersionBadge) {
    return;
  }

  if (state.backendAppVersion) {
    const mismatch = state.backendAppVersion !== APP_VERSION;
    appVersionBadge.textContent = mismatch
      ? `前端 ${APP_VERSION} / 后端 ${state.backendAppVersion}（版本不一致）`
      : `前端 ${APP_VERSION} / 后端 ${state.backendAppVersion}`;
    return;
  }

  appVersionBadge.textContent = `当前版本 ${APP_VERSION}`;
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
  return Array.from(compact).map(escapeRegExp).join("[\\s|｜/\\\\._-]*");
}

function getFieldLabelVariants(field) {
  const normalizedField = normalizeFieldLabel(field);
  const aliases = FIELD_LABEL_ALIASES[normalizedField] || [];
  return [...new Set([field, ...aliases].map((item) => normalizeWhitespace(item)).filter(Boolean))];
}

function getFlexibleFieldPatterns(field) {
  return getFieldLabelVariants(field)
    .map(buildFlexibleFieldPattern)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function getBoundedFlexibleFieldPatterns(field) {
  return getFlexibleFieldPatterns(field)
    .map((pattern) => `${pattern}(?=$|\\s|[：:])`)
    .filter(Boolean);
}

function normalizeComparableLabel(value) {
  return normalizeFieldLabel(String(value || "")
    .replace(/[：:,.，。]+$/g, "")
    .replace(/[／/\\|｜·•]+/g, ""));
}

function matchesFieldLabelText(text, field) {
  const normalizedText = normalizeComparableLabel(text);
  if (!normalizedText) {
    return false;
  }

  return getFieldLabelVariants(field).some((variant) => {
    const normalizedVariant = normalizeComparableLabel(variant);
    return normalizedVariant
      && (normalizedText === normalizedVariant || normalizedText.includes(normalizedVariant));
  });
}

function hasReadableContent(value) {
  return /[A-Za-z0-9\u3400-\u9fff]/.test(value || "");
}

function compactChineseValue(value) {
  return normalizeWhitespace(value || "")
    .replace(/\s*（\s*/g, "（")
    .replace(/\s*）\s*/g, "）")
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff0-9A-Za-z（(])/g, "$1")
    .replace(/([0-9A-Za-z）)])\s+(?=[\u3400-\u9fff])/g, "$1");
}

function stripLeadingFieldLabelPrefix(field, value) {
  let nextValue = normalizeWhitespace(value || "");
  if (!nextValue) {
    return "";
  }

  const patterns = getBoundedFlexibleFieldPatterns(field);
  if (!patterns.length) {
    return nextValue;
  }

  const prefixPattern = new RegExp(`^(?:${patterns.join("|")})\\s*[：:]?\\s*`, "i");
  return nextValue.replace(prefixPattern, "").trim();
}

function hasExplicitFieldTextPrefix(value, field) {
  const rawText = String(value || "");
  const rawField = String(field || "").trim();
  if (!rawText || !rawField) {
    return false;
  }

  return new RegExp(`^\\s*${escapeRegExp(rawField)}\\s*(?:[：:]|\\s|$)`).test(rawText);
}

function extractBestStructuredIdentifier(value) {
  const compact = normalizeWhitespace(value || "").replace(/\s+/g, "");
  const matches = compact.match(/[A-Za-z]?\d[\dA-Za-z._/#()（）+-]{5,}/g) || [];
  return matches.sort((left, right) => right.length - left.length)[0] || "";
}

function extractBestStructuredReportNumber(value) {
  const compact = normalizeWhitespace(value || "").replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  const preferredReMatch = compact.match(/RE\d{6,}/i);
  if (preferredReMatch) {
    return preferredReMatch[0];
  }

  const matches = compact.match(/[A-Z]{1,3}\d{6,}/gi) || [];
  return matches.sort((left, right) => right.length - left.length)[0] || "";
}

function extractIdentifierLikeCandidates(value) {
  const compact = normalizeWhitespace(value || "").replace(/\s+/g, "");
  if (!compact) {
    return [];
  }

  const matches = [
    ...(compact.match(/[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+){1,5}/g) || []),
    ...(compact.match(/[A-Za-z]{0,6}\d[A-Za-z0-9._/#()（）+-]{4,}/g) || []),
  ];

  return [...new Set(matches)];
}

function countPatternMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function countKeywordHits(value, keywords) {
  return keywords.filter((keyword) => String(value || "").includes(keyword)).length;
}

function isDateFieldKey(fieldKey) {
  return DATE_FIELD_HINTS.some((hint) => fieldKey.includes(normalizeFieldLabel(hint)));
}

function isNameLikeFieldKey(fieldKey) {
  return NAME_FIELD_HINTS.some((hint) => fieldKey.includes(normalizeFieldLabel(hint)));
}

function isModelFieldKey(fieldKey) {
  return MODEL_FIELD_HINTS.some((hint) => fieldKey.includes(normalizeFieldLabel(hint)));
}

function isManufacturerFieldKey(fieldKey) {
  return MANUFACTURER_FIELD_HINTS.some((hint) => fieldKey.includes(normalizeFieldLabel(hint)));
}

function isGenericIdentifierFieldKey(fieldKey) {
  return fieldKey.includes(normalizeFieldLabel("编号")) && fieldKey !== normalizeFieldLabel("证书编号");
}

function isManagementIdentifierFieldKey(fieldKey) {
  return fieldKey === normalizeFieldLabel("管理编号");
}

function isSerialIdentifierFieldKey(fieldKey) {
  return fieldKey === normalizeFieldLabel("出厂编号");
}

function normalizeDateArtifacts(value) {
  return normalizeWhitespace(String(value || ""))
    .replace(/(\d)\s*[Hh]\b/g, "$1 日")
    .replace(/(\d)\s*曰\b/g, "$1 日")
    .replace(/\s+/g, " ")
    .trim();
}

function formatChineseDate(value) {
  const match = normalizeDateArtifacts(value).match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*(?:日)?/);
  if (!match) {
    return "";
  }
  const [, year, month, day] = match;
  return `${year} 年 ${month.padStart(2, "0")} 月 ${day.padStart(2, "0")} 日`;
}

function extractBestDateValue(value) {
  const normalized = normalizeDateArtifacts(value);
  if (!normalized) {
    return "";
  }

  const chineseDate = formatChineseDate(normalized);
  if (chineseDate) {
    return chineseDate;
  }

  const slashMatch = normalized.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/);
  return slashMatch ? formatChineseDate(slashMatch[0]) : "";
}

function extractBestGenericIdentifier(value) {
  const compact = normalizeWhitespace(value || "").replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  return extractIdentifierLikeCandidates(compact)
    .filter((candidate) => /\d/.test(candidate))
    .sort((left, right) => right.length - left.length)[0] || "";
}

function scoreSerialIdentifierCandidate(candidate) {
  if (!candidate || !/\d/.test(candidate) || looksLikeCertificateIdentifier(candidate) || looksLikeManagementIdentifier(candidate)) {
    return -Infinity;
  }

  if (/^20\d{2}[-./]\d{1,2}[-./]\d{1,2}$/.test(candidate)) {
    return -Infinity;
  }

  const digitCount = countPatternMatches(candidate, /\d/g);
  let score = candidate.length * 6 + digitCount * 4;
  if (/^\d{6,20}$/.test(candidate)) {
    score += 220;
  } else if (/^[A-Za-z0-9]{6,20}$/.test(candidate)) {
    score += 180;
  } else if (/^[A-Za-z0-9][A-Za-z0-9._/#()（）+-]{5,23}$/.test(candidate)) {
    score += 120;
  }
  if (candidate.includes("-") || candidate.includes("_") || candidate.includes("/")) {
    score -= 30;
  }
  if (/^20\d{2}(?:[-./]?\d{1,2}){0,2}$/.test(candidate)) {
    score -= 260;
  }
  return score;
}

function extractBestSerialIdentifier(value) {
  const compact = normalizeWhitespace(value || "").replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  const rankedCandidates = extractIdentifierLikeCandidates(compact)
    .map((candidate) => candidate.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter(Boolean)
    .filter((candidate) => /\d/.test(candidate))
    .filter((candidate) => !looksLikeCertificateIdentifier(candidate) && !looksLikeManagementIdentifier(candidate))
    .map((candidate) => ({
      value: candidate,
      score: scoreSerialIdentifierCandidate(candidate),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || right.value.length - left.value.length);
  return rankedCandidates[0]?.value || "";
}

function looksLikeManagementIdentifier(value) {
  const normalized = normalizeWhitespace(value || "").replace(/\s+/g, "");
  return /^LD[-_/]?EQ[0-9A-Z-]{2,}$/i.test(normalized);
}

const CERTIFICATE_IDENTIFIER_PREFIX_PATTERN = "[A-Z]\\d{4}(?:\\d|[A-Z]|[A-Z]\\d{2})";

function matchesCertificateIdentifierPattern(identifier) {
  return new RegExp(`^${CERTIFICATE_IDENTIFIER_PREFIX_PATTERN}-(?:\\d{7}|[A-Z]\\d{6})$`, "i").test(identifier);
}

function scoreCertificateIdentifierVariant(candidate, sourceIdentifier = "") {
  if (!candidate || looksLikeManagementIdentifier(candidate) || !matchesCertificateIdentifierPattern(candidate)) {
    return -Infinity;
  }

  const suffix = candidate.split("-").pop() || "";
  let score = candidate.length * 6;
  if (/^\d{7}$/.test(suffix)) {
    score += 180;
  } else if (/^C\d{6}$/i.test(suffix)) {
    score += 140;
  } else if (/^[A-FH-Z]\d{6}$/i.test(suffix)) {
    score += 80;
  }
  if (/^Z/i.test(candidate)) {
    score += 24;
  }
  return score;
}

function normalizeCertificateIdentifierArtifacts(value) {
  const identifier = extractBestStructuredIdentifier(value);
  if (!identifier) {
    return "";
  }

  const variants = new Set([identifier]);
  if (/^[27L]/i.test(identifier)) {
    variants.add(`Z${identifier.slice(1)}`);
  }

  [...variants].forEach((candidate) => {
    const trimmedTrailingLetters = candidate.replace(
      new RegExp(`^(${CERTIFICATE_IDENTIFIER_PREFIX_PATTERN}-(?:\\d{7}|[A-Z]\\d{6}))[A-Z]{1,4}$`, "i"),
      "$1",
    );
    if (trimmedTrailingLetters !== candidate) {
      variants.add(trimmedTrailingLetters);
    }

    const shortened = candidate.replace(new RegExp(`^(${CERTIFICATE_IDENTIFIER_PREFIX_PATTERN}-)([A-Z])\\d(\\d{6})$`, "i"), "$1$2$3");
    if (shortened !== candidate) {
      variants.add(shortened);
    }

    const gimtSuffixRecovered = candidate.replace(new RegExp(`^(${CERTIFICATE_IDENTIFIER_PREFIX_PATTERN}-)6(\\d{6})$`, "i"), "$1G$2");
    if (gimtSuffixRecovered !== candidate) {
      variants.add(gimtSuffixRecovered);
    }

  });

  const rankedVariants = [...variants]
    .map((candidate) => ({
      value: candidate,
      score: scoreCertificateIdentifierVariant(candidate, identifier),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
  return rankedVariants[0]?.value || [...variants].find((candidate) => matchesCertificateIdentifierPattern(candidate)) || identifier;
}

function looksLikeCertificateIdentifier(value) {
  const identifier = normalizeCertificateIdentifierArtifacts(value);
  if (!identifier || looksLikeManagementIdentifier(identifier) || !identifier.includes("-")) {
    return false;
  }

  return matchesCertificateIdentifierPattern(identifier);
}

function isAmbiguousCertificateIdentifierValue(value) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return true;
  }

  if (/^[A-Z]?\d{6,7}$/i.test(normalized)) {
    return true;
  }

  if (/^Z2025(?:1|N12)-6\d{6}$/i.test(normalized)) {
    return true;
  }

  return false;
}

function extractBestModelValue(value) {
  let normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return "";
  }

  normalized = normalized
    .replace(/^(?:型号|规格|型号\/规格|\/规格|Model\/Type|Model)\s*[：:]?/i, "")
    .replace(/^[\\/|｜\s]+/, "")
    .replace(/制造[|｜/\\\s:：].*$/i, "")
    .replace(/Manufacturer.*$/i, "")
    .trim();

  const rangeMatch = normalized.match(/\(?\s*-?\d+(?:\s*~\s*-?\d+)?\s*\)?\s*[A-Za-z%°μµ/0-9.+-]+(?:\/[A-Za-z%°μµ0-9.+-]+)*/);
  if (rangeMatch) {
    return normalizeWhitespace(rangeMatch[0]);
  }

  return /[A-Za-z0-9]/.test(normalized) ? normalized : "";
}

function extractBestManufacturerValue(value) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return "";
  }

  const chineseCompany = normalized.match(/[\u3400-\u9fffA-Za-z0-9（）()\-]+(?:有限公司|有限责任公司|公司)/);
  if (chineseCompany) {
    return compactChineseValue(chineseCompany[0]);
  }

  const englishCompany = normalized.match(/[A-Z][A-Za-z0-9&().,\- ]{2,}?(?:Ltd\.?|Limited|Inc\.?|Corp\.?|Company|Co\.?)(?![A-Za-z])/);
  if (englishCompany) {
    return normalizeWhitespace(englishCompany[0]);
  }

  const hasManufactureAnchor = /制造|厂商|厂家|Manufacturer|ufacturer|facturer/i.test(normalized);
  const afterManufacture = hasManufactureAnchor
    ? normalized.replace(/^.*?(?:制造(?:厂家|厂商|商)?|Manufacturer|ufacturer|facturer)\s*[：:|｜/\\\s-]*/i, "").trim()
    : "";
  if (!afterManufacture) {
    const standaloneBrand = extractManufacturerBrandToken(normalized);
    return standaloneBrand || "";
  }

  const shortChineseBrand = afterManufacture.match(/[\u3400-\u9fff]{2,12}(?:公司|有限责任公司|有限公司)?/);
  if (shortChineseBrand) {
    return compactChineseValue(shortChineseBrand[0]);
  }

  const fallbackEnglish = afterManufacture.match(/[A-Z][A-Za-z0-9&().,\- ]{2,}/);
  if (fallbackEnglish) {
    return normalizeWhitespace(fallbackEnglish[0]);
  }

  const compactChineseBrand = afterManufacture.match(/[\u3400-\u9fff]{2,12}/);
  if (compactChineseBrand && !/制造|厂商|厂家|日期|编号|地址|客户|证书|报告/.test(compactChineseBrand[0])) {
    return compactChineseBrand[0];
  }

  return extractManufacturerBrandToken(afterManufacture) || extractManufacturerBrandToken(normalized) || "";
}

function extractManufacturerBrandToken(value) {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) {
    return "";
  }

  const stripped = normalized
    .replace(/^.*?(?:制造(?:厂家|厂商|商)?|Manufacturer|ufacturer|facturer)\s*[：:|｜/\\\s-]*/i, "")
    .trim();
  const englishTokens = (stripped.match(/[A-Za-z][A-Za-z0-9._-]{2,}/g) || [])
    .filter((token) => token.length >= 4)
    .filter((token) => !MANUFACTURER_NOISE_WORDS.has(token.toLowerCase()));

  return englishTokens.length ? englishTokens[englishTokens.length - 1] : "";
}

function hasConflictingDateLabel(value, fieldKey) {
  const source = String(value || "");
  return DATE_LABEL_GROUPS.some((group) => group.key !== fieldKey && group.patterns.some((pattern) => source.includes(pattern)));
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
  const fieldPatterns = getBoundedFlexibleFieldPatterns(field);
  if (!source || !fieldPatterns.length) {
    return "";
  }

  for (const fieldPattern of fieldPatterns) {
    const pattern = new RegExp(`${fieldPattern}\\s*[：:]?\\s*(.+)$`, "i");
    const match = source.match(pattern);
    if (!match || !match[1]) {
      continue;
    }

    const candidate = normalizeFieldValueForOutput(field, stripTrailingPaginationArtifacts(match[1]));
    if (isUsableExtractedValue(candidate, field)) {
      return candidate;
    }
  }

  return "";
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

function findBestOcrLabelLine(lines, field) {
  return lines.find((line) => matchesFieldLabelText(line.text, field))
    || lines.find((line) => getBoundedFlexibleFieldPatterns(field).some((pattern) => new RegExp(pattern, "i").test(line.text)));
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

function collectDeferredBelowOcrCandidates(labelLine, lines, field) {
  const labelHeight = Math.max(labelLine.height, 12);
  const maxVerticalDistance = Math.max(labelHeight * 14, 240);
  const candidates = [];

  lines.forEach((line, index) => {
    if (line === labelLine) {
      return;
    }
    if (line.top < labelLine.bottom - 4) {
      return;
    }
    if (line.top - labelLine.bottom > maxVerticalDistance) {
      return;
    }
    if (isLikelyOcrLabel(line.text, field)) {
      return;
    }

    const candidateValue = normalizeFieldValueForOutput(field, stripTrailingPaginationArtifacts(line.text));
    if (!isUsableExtractedValue(candidateValue, field, { rawValue: line.text })) {
      return;
    }

    candidates.push({
      value: candidateValue,
      rawValue: line.text,
      sourceBonus: Math.max(4, 24 - index),
    });
  });

  return candidates;
}

function buildStructuredTextFromOcrLines(lines, fields) {
  if (!lines.length || !fields.length) {
    return "";
  }

  const results = [];
  fields.forEach((field) => {
    const labelLine = findBestOcrLabelLine(lines, field);

    if (!labelLine) {
      return;
    }

    const value = selectBestFieldCandidate(field, [
      { value: normalizeFieldValueForOutput(field, pickBestOcrValueCandidate(labelLine, lines, field)), sourceBonus: 12 },
    ]);
    if (!isUsableExtractedValue(value, field)) {
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
  const normalized = normalizeFieldValueForOutput(field, value);
  if (!normalized) {
    return true;
  }
  if (!isUsableExtractedValue(normalized, field)) {
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

function preprocessGimtGreenCanvas(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const greenBias = green - ((red + blue) / 2);
    const next = brightness > 172 || greenBias > 10 ? 255 : 0;
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

function shouldRenderRawCanvasForFields(fields = []) {
  return fields.some((field) => {
    const regionHint = getKnownPdfFieldRegionHint(field);
    return regionHint && !regionHint.useThresholded;
  });
}

function getStrongFieldScoreThreshold(field) {
  const fieldKey = normalizeFieldLabel(field);
  if (fieldKey === normalizeFieldLabel("证书编号")) {
    return 180;
  }
  if (isGenericIdentifierFieldKey(fieldKey)) {
    return 140;
  }
  if (fieldKey === normalizeFieldLabel("客户名称")) {
    return 140;
  }
  if (fieldKey === normalizeFieldLabel("地址")) {
    return 120;
  }
  if (isDateFieldKey(fieldKey)) {
    return 100;
  }
  if (isNameLikeFieldKey(fieldKey)) {
    return 100;
  }
  if (isManufacturerFieldKey(fieldKey)) {
    return 90;
  }
  if (isModelFieldKey(fieldKey)) {
    return 80;
  }
  return 60;
}

function isStrongExtractedValue(field, value, options = {}) {
  const score = scoreFieldCandidate(field, value, options);
  return Number.isFinite(score) && score >= getStrongFieldScoreThreshold(field);
}

function getRegionSourceCanvases(field, thresholdedCanvas, rawCanvas) {
  const regionHint = getKnownPdfFieldRegionHint(field);
  if (!regionHint || !thresholdedCanvas) {
    return [];
  }

  return getRegionSourceCanvasesForHint(regionHint, thresholdedCanvas, rawCanvas);
}

function getRegionSourceCanvasesForHint(regionHint, thresholdedCanvas, rawCanvas) {
  if (!regionHint || !thresholdedCanvas) {
    return [];
  }

  const preferredCanvas = regionHint.useThresholded ? thresholdedCanvas : (rawCanvas || thresholdedCanvas);
  const alternateCanvas = regionHint.useThresholded ? (rawCanvas || null) : thresholdedCanvas;
  const canvases = [preferredCanvas];
  if (regionHint.allowAlternateCanvas !== false && alternateCanvas && alternateCanvas !== preferredCanvas) {
    canvases.push(alternateCanvas);
  }
  return canvases.filter(Boolean);
}

async function extractOcrValueFromRegion(canvas, worker, regionHint) {
  if (!canvas || !regionHint) {
    return "";
  }

  const cropCanvas = document.createElement("canvas");
  const scale = Math.max(1, Number(regionHint.scale) || 1);
  const left = Math.floor(canvas.width * regionHint.left);
  const top = Math.floor(canvas.height * regionHint.top);
  const width = Math.floor(canvas.width * regionHint.width);
  const height = Math.floor(canvas.height * regionHint.height);

  cropCanvas.width = Math.max(1, Math.floor(width * scale));
  cropCanvas.height = Math.max(1, Math.floor(height * scale));
  const context = cropCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);
  if (regionHint.preprocess === "gimt-green") {
    preprocessGimtGreenCanvas(context, cropCanvas.width, cropCanvas.height);
  }

  await worker.setParameters({
    tessedit_pageseg_mode: regionHint.psm || "6",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_char_whitelist: regionHint.whitelist || "",
  });

  const result = await worker.recognize(cropCanvas, {}, { text: true });
  return cleanExtractedValue(pickBestOcrTextLine(result?.data?.text || ""));
}

async function extractStrongRegionFieldValue(field, thresholdedCanvas, rawCanvas, worker) {
  const regionHint = getKnownPdfFieldRegionHint(field);
  if (!regionHint) {
    return "";
  }

  const candidates = [];
  const seenValues = new Set();
  const canvases = getRegionSourceCanvases(field, thresholdedCanvas, rawCanvas);
  for (let index = 0; index < canvases.length; index += 1) {
    const regionValue = normalizeFieldValueForOutput(field, await extractOcrValueFromRegion(canvases[index], worker, regionHint));
    if (!isUsableExtractedValue(regionValue, field)) {
      continue;
    }

    const normalizedValue = normalizeWhitespace(regionValue);
    if (seenValues.has(normalizedValue)) {
      continue;
    }
    seenValues.add(normalizedValue);
    const isCertificateIdentifierField = normalizeFieldLabel(field) === normalizeFieldLabel("证书编号");
    candidates.push({
      value: regionValue,
      sourceBonus: isCertificateIdentifierField
        ? (index === 0 ? 34 : 8)
        : (index === 0 ? 22 : 14),
    });
  }

  const rankedCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      normalizedValue: normalizeWhitespace(candidate.value),
      score: scoreFieldCandidate(field, candidate.value, candidate),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
  const selectedCandidate = rankedCandidates[0];
  if (!selectedCandidate) {
    return "";
  }

  if (!isStrongExtractedValue(field, selectedCandidate.value)) {
    return "";
  }

  const secondDistinctCandidate = rankedCandidates.find((candidate) => candidate.normalizedValue !== selectedCandidate.normalizedValue);
  if (secondDistinctCandidate) {
    const scoreGap = selectedCandidate.score - secondDistinctCandidate.score;
    const minGap = Math.max(80, Math.floor(getStrongFieldScoreThreshold(field) / 2));
    if (scoreGap < minGap) {
      return "";
    }
  }

  return selectedCandidate.value;
}

const GIMT_PROFILE_REGION_HINTS = {
  [normalizeFieldLabel("证书编号")]: { left: 0.16, top: 0.182, width: 0.32, height: 0.055, psm: "6", useThresholded: false, scale: 5, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" },
  [normalizeFieldLabel("客户名称")]: { left: 0.30, top: 0.235, width: 0.48, height: 0.05, psm: "7", useThresholded: false, scale: 4 },
  [normalizeFieldLabel("地址")]: { left: 0.30, top: 0.285, width: 0.50, height: 0.07, psm: "6", useThresholded: false, scale: 4 },
  [normalizeFieldLabel("仪器名称")]: { left: 0.18, top: 0.34, width: 0.48, height: 0.065, psm: "6", useThresholded: false, scale: 5 },
  [normalizeFieldLabel("管理编号")]: { left: 0.20, top: 0.54, width: 0.44, height: 0.07, psm: "6", useThresholded: false, scale: 5, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" },
  [normalizeFieldLabel("校准日期")]: { left: 0.44, top: 0.74, width: 0.30, height: 0.05, psm: "6", useThresholded: false, scale: 5, whitelist: "0123456789-.年月日 " },
};

function getGimtProfileRegionHint(field) {
  return GIMT_PROFILE_REGION_HINTS[normalizeFieldLabel(field)] || null;
}

async function buildGimtProfileStructuredText(thresholdedCanvas, rawCanvas, worker, fields) {
  if (!fields.length) {
    return "";
  }

  const results = [];
  for (const field of fields) {
    const regionHint = getGimtProfileRegionHint(field);
    if (!regionHint) {
      continue;
    }

    const candidates = [];
    const canvases = getRegionSourceCanvasesForHint(regionHint, thresholdedCanvas, rawCanvas);
    for (let index = 0; index < canvases.length; index += 1) {
      const regionValue = normalizeFieldValueForOutput(field, await extractOcrValueFromRegion(canvases[index], worker, regionHint));
      if (!isUsableExtractedValue(regionValue, field, { rawValue: regionValue })) {
        continue;
      }
      candidates.push({
        value: regionValue,
        rawValue: regionValue,
        sourceBonus: index === 0 ? 34 : 18,
      });
    }

    const selectedValue = selectBestFieldCandidate(field, candidates);
    if (isUsableExtractedValue(selectedValue, field)) {
      results.push(`${field}：${selectedValue}`);
    }
  }

  return results.join("\n");
}

async function buildPreciseRegionStructuredText(thresholdedCanvas, rawCanvas, worker, fields, pageNumber) {
  if (pageNumber !== 1 || !fields.length) {
    return {
      text: "",
      unresolvedFields: [...fields],
    };
  }

  const results = [];
  const unresolvedFields = [];

  for (const field of fields) {
    const strongRegionValue = await extractStrongRegionFieldValue(field, thresholdedCanvas, rawCanvas, worker);
    if (strongRegionValue) {
      results.push(`${field}：${strongRegionValue}`);
    } else {
      unresolvedFields.push(field);
    }
  }

  return {
    text: results.join("\n"),
    unresolvedFields,
  };
}

async function buildStructuredTextFromOcrPage(canvas, rawCanvas, worker, lines, fields, pageNumber) {
  if (!lines.length || !fields.length) {
    return "";
  }

  const results = [];
  for (const field of fields) {
    const labelLine = findBestOcrLabelLine(lines, field);
    const regionHint = pageNumber === 1 ? getKnownPdfFieldRegionHint(field) : null;
    const candidates = [];
    if (labelLine) {
      const inlineValue = extractInlineFieldValue(labelLine.text, field);
      if (inlineValue) {
        candidates.push({ value: inlineValue, rawValue: labelLine.text, sourceBonus: 18 });
      }

      const nearbyValue = normalizeFieldValueForOutput(field, stripTrailingPaginationArtifacts(pickBestOcrValueCandidate(labelLine, lines, field)));
      if (isUsableExtractedValue(nearbyValue, field)) {
        candidates.push({ value: nearbyValue, rawValue: labelLine.text, sourceBonus: 14 });
      }

      const quickValue = selectBestFieldCandidate(field, candidates);
      if (isStrongExtractedValue(field, quickValue)) {
        results.push(`${field}：${quickValue}`);
        continue;
      }

      const cropValue = normalizeFieldValueForOutput(field, await extractOcrValueByCrop(canvas, worker, labelLine));
      if (isUsableExtractedValue(cropValue, field)) {
        candidates.push({ value: cropValue, rawValue: labelLine.text, sourceBonus: 10 });
      }

      if (rawCanvas && (shouldRetryOcrValue(cropValue, field) || !isStrongExtractedValue(field, cropValue))) {
        const rawCropValue = normalizeFieldValueForOutput(field, await extractOcrValueByCrop(rawCanvas, worker, labelLine));
        if (isUsableExtractedValue(rawCropValue, field)) {
          candidates.push({ value: rawCropValue, rawValue: labelLine.text, sourceBonus: 14 });
        }
      }

      candidates.push(...collectDeferredBelowOcrCandidates(labelLine, lines, field));
    }

    if (regionHint) {
      const sourceCanvas = regionHint.useThresholded ? canvas : (rawCanvas || canvas);
      const regionValue = normalizeFieldValueForOutput(field, await extractOcrValueFromRegion(sourceCanvas, worker, regionHint));
      if (isUsableExtractedValue(regionValue, field)) {
        candidates.push({ value: regionValue, rawValue: field, sourceBonus: 16 });
      }
    }

    const value = selectBestFieldCandidate(field, candidates);
    if (isUsableExtractedValue(value, field)) {
      results.push(`${field}：${value}`);
    }
  }

  return results.join("\n");
}

async function getOcrWorker(workerSlot = 0) {
  const tesseract = await ensureTesseractLoaded();

  if (!ocrWorkerPromises.has(workerSlot)) {
    const workerPromise = tesseract.createWorker("chi_sim+eng", 1, {
      workerPath: resolveAssetUrl("./vendor/tesseract/worker.min.js"),
      corePath: resolveAssetUrl("./vendor/tesseract-core/", { versioned: false }),
      langPath: resolveAssetUrl("./vendor/tessdata/", { versioned: false }),
    }).catch((error) => {
      ocrWorkerPromises.delete(workerSlot);
      throw error;
    });
    ocrWorkerPromises.set(workerSlot, workerPromise);
  }

  return ocrWorkerPromises.get(workerSlot);
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

function normalizeFieldValueForOutput(field, value) {
  let nextValue = cleanExtractedValue(String(value || ""));
  const fieldKey = normalizeFieldLabel(field);

  nextValue = stripLeadingFieldLabelPrefix(field, nextValue);

  if (fieldKey === normalizeFieldLabel("证书编号")) {
    const identifier = normalizeCertificateIdentifierArtifacts(nextValue);
    if (identifier && looksLikeCertificateIdentifier(identifier)) {
      return identifier;
    }
    const reportNumber = extractBestStructuredReportNumber(nextValue);
    if (reportNumber) {
      return reportNumber;
    }
  }

  if (fieldKey === normalizeFieldLabel("管理编号")) {
    const managementIdentifier = (normalizeWhitespace(nextValue || "").match(/LD[-_/]?EQ[0-9A-Z-]{2,}/i) || [])[0] || "";
    if (managementIdentifier) {
      return managementIdentifier;
    }
  }

  if (isSerialIdentifierFieldKey(fieldKey)) {
    const serialIdentifier = extractBestSerialIdentifier(nextValue);
    if (serialIdentifier) {
      return serialIdentifier;
    }
  }

  if (isGenericIdentifierFieldKey(fieldKey)) {
    const identifier = extractBestGenericIdentifier(nextValue);
    if (identifier) {
      return identifier;
    }
  }

  if (isDateFieldKey(fieldKey)) {
    const dateValue = extractBestDateValue(nextValue);
    if (dateValue) {
      return dateValue;
    }
  }

  if (fieldKey === normalizeFieldLabel("仪器名称")) {
    nextValue = nextValue
      .replace(/^[A-Za-z]\s*/i, "")
      .replace(/^(?:名\s*称|检测对象|Test\s*item|Description)\s*/i, "")
      .trim();
  }

  if (isModelFieldKey(fieldKey)) {
    const modelValue = extractBestModelValue(nextValue);
    if (modelValue) {
      nextValue = modelValue;
    }
  }

  if (isManufacturerFieldKey(fieldKey)) {
    const manufacturerValue = extractBestManufacturerValue(nextValue);
    if (manufacturerValue) {
      nextValue = manufacturerValue;
    }
  }

  if (fieldKey === normalizeFieldLabel("客户名称") || fieldKey === normalizeFieldLabel("地址")) {
    nextValue = compactChineseValue(nextValue);
  }

  if (isNameLikeFieldKey(fieldKey)) {
    nextValue = compactChineseValue(nextValue);
  }

  return nextValue;
}

function scoreFieldCandidate(field, value, options = {}) {
  const normalized = normalizeFieldValueForOutput(field, value);
  if (!normalized) {
    return -Infinity;
  }

  if (!normalizeWhitespace(stripTrailingPaginationArtifacts(normalized))) {
    return -Infinity;
  }

  if (!hasReadableContent(normalized)) {
    return -Infinity;
  }

  if (normalizeFieldLabel(normalized) === normalizeFieldLabel(field)) {
    return -Infinity;
  }

  const cjkCount = countPatternMatches(normalized, /[\u3400-\u9fff]/g);
  const latinCount = countPatternMatches(normalized, /[A-Za-z]/g);
  const digitCount = countPatternMatches(normalized, /\d/g);
  const upperCount = countPatternMatches(normalized, /[A-Z]/g);
  const fieldKey = normalizeFieldLabel(field);
  const originalText = normalizeWhitespace(String(options.rawValue || options.value || value || ""));
  let score = normalized.length * 2 + (options.sourceBonus || 0);

  if (fieldKey === normalizeFieldLabel("证书编号")) {
    const identifier = normalizeCertificateIdentifierArtifacts(normalized);
    if (!identifier || looksLikeManagementIdentifier(identifier)) {
      return -Infinity;
    }
    const suffix = identifier.split("-").pop() || "";
    const hasLetterDigitSuffix = /^[A-Z]\d{6}$/i.test(suffix);
    const hasDigitOnlySuffix = /^\d{7}$/.test(suffix);

    score += digitCount * 6;
    score += upperCount * 4;
    if (looksLikeCertificateIdentifier(identifier)) {
      score += 220;
    } else if (/^\d{4,}-\d{4,}$/.test(identifier)) {
      score += 150;
    } else if (/^[A-Z]?\d[\dA-Za-z._/#()（）+-]{5,}$/.test(identifier)) {
      score += 90;
    }
    if (identifier.includes("-")) {
      score += 30;
    }
    if (/^Z/i.test(identifier)) {
      score += 40;
    }
    if (hasLetterDigitSuffix) {
      score += 24;
    } else if (hasDigitOnlySuffix) {
      score += 8;
    }
    if (identifier.includes("-") && !/^(?:\d{7}|[A-Z]\d{6})$/i.test(suffix)) {
      score -= 140;
    }
    if (/[A-Za-z]/.test(identifier.slice(1)) && !looksLikeCertificateIdentifier(identifier)) {
      score -= 80;
    }
    return score;
  }

  if (isSerialIdentifierFieldKey(fieldKey)) {
    const identifier = extractBestSerialIdentifier(normalized);
    if (!identifier || looksLikeCertificateIdentifier(identifier) || looksLikeManagementIdentifier(identifier)) {
      return -Infinity;
    }

    score += digitCount * 5;
    score += upperCount * 2;
    if (/^\d{6,20}$/.test(identifier)) {
      score += 180;
    } else if (/^[A-Za-z0-9]{6,20}$/.test(identifier)) {
      score += 140;
    } else if (/^[A-Za-z0-9._/#()（）+-]{6,24}$/.test(identifier)) {
      score += 100;
    }
    if (/出厂|出编号|Serial/i.test(originalText)) {
      score += 140;
    }
    if (/管理|Management|LD[-_/]?EQ/i.test(originalText)) {
      score -= 80;
    }
    if (/证书|Certificate|报告|Report/i.test(originalText)) {
      score -= 220;
    }
    if (/日期|Date|地址|Address|客户|Client|名称|Name/i.test(originalText)) {
      score -= 220;
    }
    if (/型号|规格|Model|Type/i.test(originalText) && !/出厂|出编号|Serial/i.test(originalText)) {
      score -= 120;
    }
    return score;
  }

  if (isGenericIdentifierFieldKey(fieldKey)) {
    const identifier = extractBestGenericIdentifier(normalized);
    if (!identifier) {
      return -Infinity;
    }

    score += digitCount * 5;
    score += upperCount * 3;
    if (identifier.includes("-") || identifier.includes("/")) {
      score += 40;
    }
    if (/[A-Za-z]/.test(identifier) && /\d/.test(identifier)) {
      score += 80;
    }
    if (isManagementIdentifierFieldKey(fieldKey)) {
      if (looksLikeCertificateIdentifier(identifier)) {
        return -Infinity;
      }
      if (looksLikeManagementIdentifier(identifier)) {
        score += 240;
      }
      if (/管理|Management|LD[-_/]?EQ/i.test(originalText)) {
        score += 40;
      }
    }
    if (/日期|Date|地址|Address|名称|Name|客户|Client/i.test(originalText)) {
      score -= 220;
    }
    return score;
  }

  if (isDateFieldKey(fieldKey)) {
    const dateValue = extractBestDateValue(normalized);
    if (!dateValue) {
      return -Infinity;
    }

    score += 120;
    if (normalized === dateValue) {
      score += 80;
    }
    if (hasConflictingDateLabel(originalText, fieldKey)) {
      score -= 220;
    }
    if (/建议下次|Due Date|发布日期|Issue Date/i.test(originalText) && !matchesFieldLabelText(originalText, field)) {
      score -= 180;
    }
    return score;
  }

  if (fieldKey === normalizeFieldLabel("客户名称")) {
    if (cjkCount < 4) {
      return -Infinity;
    }

    const customerHintHits = countKeywordHits(normalized, CUSTOMER_NAME_HINTS);
    const companyHintHits = countKeywordHits(normalized, COMPANY_NAME_HINTS);
    const addressHintHits = countKeywordHits(normalized, ADDRESS_HINTS);
    const suspiciousSymbolCount = countPatternMatches(normalized, /[&"'“”‘’|`~]/g);
    score += cjkCount * 12;
    score -= latinCount * 8;
    score -= digitCount * 8;
    score += customerHintHits * 40;
    score += companyHintHits * 24;
    score -= suspiciousSymbolCount * 40;
    if (addressHintHits >= 2 && customerHintHits + companyHintHits === 0) {
      return -Infinity;
    }
    if (addressHintHits >= 3) {
      score -= 160;
    }
    if (/地址|Address|仪器|Description|型号|规格|证书|编号|Client\s*Name/i.test(normalized)) {
      score -= 120;
    }
    if (/地址|Address/i.test(originalText) && !matchesFieldLabelText(originalText, field)) {
      score -= 220;
    }
    if (latinCount > cjkCount) {
      score -= 60;
    }
    if (/^[^A-Za-z\u3400-\u9fff（(]+/.test(normalized)) {
      score -= 80;
    }
    return score >= 40 ? score : -Infinity;
  }

  if (fieldKey === normalizeFieldLabel("地址")) {
    if (cjkCount < 4) {
      return -Infinity;
    }

    const addressHits = countKeywordHits(normalized, ADDRESS_HINTS);
    const modelHintHits = countKeywordHits(normalized, ["型号", "规格"]);
    score += cjkCount * 8;
    score += digitCount * 3;
    score += addressHits * 45;
    score -= latinCount * 6;
    if (/仪器|Description|客户|公司|Client\s*Name|Model|Type|规格|型号|Serial/i.test(normalized)) {
      score -= 120;
    }
    if (modelHintHits > 0 && digitCount < 3) {
      return -Infinity;
    }
    if (addressHits === 0 && !(digitCount >= 3 && cjkCount >= 8)) {
      return -Infinity;
    }
    return score;
  }

  if (isNameLikeFieldKey(fieldKey)) {
    if (cjkCount < 2) {
      return -Infinity;
    }

    const addressHintHits = countKeywordHits(normalized, ADDRESS_HINTS);
    const suspiciousSymbolCount = countPatternMatches(normalized, /[=|｜_`~]/g);
    const quoteCount = countPatternMatches(normalized, /["'“”‘’]/g);
    score += cjkCount * 14;
    score -= latinCount * 6;
    score -= digitCount * 10;
    score -= suspiciousSymbolCount * 36;
    score -= quoteCount * 14;
    if (normalized.length <= 8 && digitCount === 0) {
      score += 140;
    }
    if (hasExplicitFieldTextPrefix(originalText, field)) {
      score += 28;
    }
    if (addressHintHits >= 2 && digitCount >= 2) {
      score -= 260;
    }
    if (addressHintHits >= 3) {
      return -Infinity;
    }
    if (
      fieldKey === normalizeFieldLabel("仪器名称")
      && (countKeywordHits(normalized, CUSTOMER_NAME_HINTS) > 0 || countKeywordHits(normalized, COMPANY_NAME_HINTS) > 0)
    ) {
      return -Infinity;
    }
    if (/日期|Date|编号|No\.?|地址|Address|Model|Type|规格|管理|校准|证书/i.test(originalText) && !matchesFieldLabelText(originalText, field)) {
      return -Infinity;
    }
    return score >= 40 ? score : -Infinity;
  }

  if (isModelFieldKey(fieldKey)) {
    const modelValue = extractBestModelValue(normalized);
    if (!modelValue) {
      return -Infinity;
    }

    if (/Date|Receipt|Issue|Due|Year|Month|Day|Serial|Management|Certificate|Address|客户|名称/i.test(modelValue)) {
      return -Infinity;
    }
    if (!/\d/.test(modelValue) && !/[()（）~/-]/.test(modelValue)) {
      return -Infinity;
    }
    if (/^\d{6,}$/.test(modelValue)) {
      return -Infinity;
    }
    if (/^[A-Za-z0-9]{8,}$/.test(modelValue) && !/[()（）~/-]/.test(modelValue)) {
      return -Infinity;
    }

    score += digitCount * 4;
    score += upperCount * 2;
    if (/[()（）~/-]/.test(modelValue)) {
      score += 60;
    }
    if (/(?:Pa|kPa|mm|cm|kg|Hz|V|A|W|℃|°C)/i.test(modelValue)) {
      score += 80;
    }
    if (/Ltd|Limited|Inc|Corp|Company|Co\.?|公司|日期|编号|地址/i.test(modelValue)) {
      score -= 160;
    }
    return score;
  }

  if (isManufacturerFieldKey(fieldKey)) {
    const manufacturerValue = extractBestManufacturerValue(normalized);
    if (!manufacturerValue) {
      return -Infinity;
    }

    if (MANUFACTURER_NOISE_WORDS.has(manufacturerValue.toLowerCase())) {
      return -Infinity;
    }
    if (looksLikeManagementIdentifier(manufacturerValue) || looksLikeCertificateIdentifier(manufacturerValue)) {
      return -Infinity;
    }
    if (digitCount >= 3 && !/(?:Ltd|Limited|Inc|Corp|Company|Co\.?|公司|有限)/i.test(manufacturerValue)) {
      return -Infinity;
    }

    score += countKeywordHits(manufacturerValue, COMPANY_NAME_HINTS) * 60;
    if (/[A-Za-z]/.test(manufacturerValue)) {
      score += 40;
    }
    if (/^[A-Za-z][A-Za-z0-9._-]{3,}$/.test(manufacturerValue)) {
      score += 70;
    }

    const hasManufacturerAnchor = /制造|厂商|厂家|Manufacturer|ufacturer|facturer/i.test(originalText);
    if (hasManufacturerAnchor) {
      score += 120;
    }

    if (/Calibration|Certificate|Client|Address|Description|Serial|Management|Page|Date|Issue|Receipt|Due/i.test(originalText) && !hasManufacturerAnchor) {
      return -Infinity;
    }

    if (/型号|规格|Model|Type/i.test(originalText) && !hasManufacturerAnchor && !/[A-Za-z]{4,}/.test(manufacturerValue)) {
      return -Infinity;
    }

    if (/型号|规格|日期|编号|Address|地址/i.test(originalText) && !hasManufacturerAnchor && !matchesFieldLabelText(originalText, field)) {
      score -= 120;
    }
    return score;
  }

  score += cjkCount * 6;
  score += digitCount * 2;
  score -= latinCount;
  if (isLikelyOcrLabel(normalized, field)) {
    score -= 100;
  }
  return score > 0 ? score : -Infinity;
}

function isUsableExtractedValue(value, field, options = {}) {
  return Number.isFinite(scoreFieldCandidate(field, value, options));
}

function rankFieldCandidates(field, candidates = []) {
  return candidates
    .map((candidate) => {
      if (candidate && typeof candidate === "object") {
        const normalized = normalizeFieldValueForOutput(field, candidate.value);
        return {
          value: normalized,
          source: candidate.source || "",
          score: scoreFieldCandidate(field, normalized, candidate),
        };
      }

      const normalized = normalizeFieldValueForOutput(field, candidate);
      return {
        value: normalized,
        score: scoreFieldCandidate(field, normalized),
      };
    })
    .filter((candidate) => candidate.value && Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
}

function selectBestFieldCandidate(field, candidates = []) {
  const ranked = rankFieldCandidates(field, candidates);
  return ranked[0]?.value || "";
}

function truncateAtNextField(value, currentField) {
  const boundaryIndex = findNextFieldBoundary(value, currentField);
  const sliced = boundaryIndex >= 0 ? value.slice(0, boundaryIndex) : value;
  const withoutPagination = stripTrailingPaginationArtifacts(sliced);
  return cleanExtractedValue(withoutPagination);
}

function collectFieldCandidatesFromLines(text, field) {
  const lines = normalizeExtractedText(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const fieldPatterns = getBoundedFlexibleFieldPatterns(field);
  const candidates = [];
  const fieldKey = normalizeFieldLabel(field);

  if (!lines.length || !fieldPatterns.length) {
    return candidates;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!fieldPatterns.some((pattern) => new RegExp(pattern, "i").test(line))) {
      continue;
    }

    for (const fieldPattern of fieldPatterns) {
      const inlinePattern = new RegExp(`${fieldPattern}\\s*[：:]?\\s*(.*)$`, "i");
      const inlineMatch = line.match(inlinePattern);
      if (!inlineMatch) {
        continue;
      }

      const inlineCandidate = normalizeFieldValueForOutput(field, truncateAtNextField(inlineMatch[1], field));
      if (isUsableExtractedValue(inlineCandidate, field)) {
        candidates.push({ value: inlineCandidate, rawValue: line, sourceBonus: 20 });
      }
    }

    const maxOffset = isCertificateTemplateField(field) ? 6 : 2;
    for (let offset = 1; offset <= maxOffset && index + offset < lines.length; offset += 1) {
      const candidate = normalizeFieldValueForOutput(field, truncateAtNextField(lines[index + offset], field));
      if (isUsableExtractedValue(candidate, field)) {
        const sourceBonus = isManufacturerFieldKey(fieldKey)
          ? 8 + (offset * 2)
          : Math.max(4, 16 - (offset * 2));
        candidates.push({
          value: candidate,
          rawValue: `${line}\n${lines[index + offset]}`,
          sourceBonus,
        });
      }
    }
  }

  return candidates;
}

function collectStrictTemplateIdentifierCandidates(text, field) {
  const fieldKey = normalizeFieldLabel(field);
  if (
    fieldKey !== normalizeFieldLabel("证书编号")
    && fieldKey !== normalizeFieldLabel("管理编号")
  ) {
    return [];
  }

  const lines = normalizeExtractedText(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const candidates = [];
  const seen = new Set();

  lines.forEach((line) => {
    extractIdentifierLikeCandidates(line).forEach((identifier) => {
      const normalized = normalizeFieldValueForOutput(field, identifier);
      if (!normalized) {
        return;
      }

      const isValid = fieldKey === normalizeFieldLabel("证书编号")
        ? looksLikeCertificateIdentifier(normalized) && !looksLikeManagementIdentifier(normalized)
        : looksLikeManagementIdentifier(normalized) && !looksLikeCertificateIdentifier(normalized);
      if (!isValid || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      let sourceBonus = fieldKey === normalizeFieldLabel("管理编号") ? 24 : 18;
      if (matchesFieldLabelText(line, field)) {
        sourceBonus += 10;
      }
      if (fieldKey === normalizeFieldLabel("证书编号") && /(证书|Certificate)/i.test(line)) {
        sourceBonus += 12;
      }
      if (fieldKey === normalizeFieldLabel("管理编号") && /(管理|Management|LD[-_/]?EQ)/i.test(line)) {
        sourceBonus += 12;
      }

      candidates.push({ value: normalized, rawValue: line, sourceBonus, source: "strict-pattern" });
    });
  });

  return candidates;
}

function collectCertificateManufacturerCandidates(text, field, source = "text", sourceBonusOffset = 0) {
  const lines = normalizeExtractedText(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (value, rawValue, sourceBonus) => {
    const normalized = normalizeFieldValueForOutput(field, value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push({
      value: normalized,
      rawValue,
      source,
      sourceBonus: sourceBonus + sourceBonusOffset,
    });
  };

  lines.forEach((line, index) => {
    const hasManufacturerAnchor = /制造|厂商|厂家|Manufacturer|ufacturer|facturer/i.test(line);
    const hasModelRowAnchor = /型号|规格|Model\/Type|Model|Type/i.test(line);

    if (matchesFieldLabelText(line, field)) {
      for (let offset = 1; offset <= 6 && index + offset < lines.length; offset += 1) {
        const candidateLine = lines[index + offset];
        const candidateValue = extractBestManufacturerValue(candidateLine);
        if (!candidateValue) {
          continue;
        }
        pushCandidate(candidateValue, `${line}\n${candidateLine}`, 18 + (offset * 4));
      }
    }

    if (!hasManufacturerAnchor && !hasModelRowAnchor) {
      return;
    }

    const brand = extractBestManufacturerValue(line);
    if (!brand) {
      return;
    }
    pushCandidate(brand, line, hasManufacturerAnchor ? 34 : 22);
  });

  return candidates;
}

function collectCertificateTemplateFieldCandidates(text, field, source = "text", sourceBonusOffset = 0) {
  const manufacturerCandidates = isManufacturerFieldKey(normalizeFieldLabel(field))
    ? collectCertificateManufacturerCandidates(text, field, source, sourceBonusOffset)
    : [];
  const explicitCandidates = collectFieldCandidatesFromLines(text, field).map((candidate) => ({
    ...candidate,
    source,
    sourceBonus: (candidate.sourceBonus || 0) + sourceBonusOffset,
  }));
  const strictIdentifierCandidates = collectStrictTemplateIdentifierCandidates(text, field).map((candidate) => ({
    ...candidate,
    source,
    sourceBonus: (candidate.sourceBonus || 0) + sourceBonusOffset,
  }));

  return [...explicitCandidates, ...strictIdentifierCandidates, ...manufacturerCandidates];
}

function summarizeFieldCandidatesForDiagnostics(field, candidates = []) {
  return candidates
    .map((candidate) => {
      const value = normalizeFieldValueForOutput(field, candidate.value);
      const score = scoreFieldCandidate(field, value, candidate);
      if (!value || !Number.isFinite(score)) {
        return null;
      }
      return {
        value,
        score,
        source: candidate.source || "",
        sourceBonus: candidate.sourceBonus || 0,
        rawValue: normalizeWhitespace(candidate.rawValue || candidate.value || "").slice(0, 180),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function detectCertificateDocumentProfile(options = {}) {
  const fields = options.fields || state.fields;
  if (!looksLikeCertificateFieldSelection(fields)) {
    return "";
  }

  const markerSource = normalizeExtractedText([options.baseText, options.rawText].filter(Boolean).join("\n")).toLowerCase();
  const hasGimtBrand = markerSource.includes("gimt")
    || markerSource.includes("guangzhou institute of measurement")
    || (markerSource.includes("institute") && markerSource.includes("measurement"));
  if (hasGimtBrand) {
    return GIMT_CERTIFICATE_PROFILE_ID;
  }
  const markerHits = CERTIFICATE_TEMPLATE_MARKERS.filter((marker) => markerSource.includes(marker.toLowerCase())).length;
  const templateFieldValues = options.templateFieldValues || {};
  const templateFieldHits = Object.entries(templateFieldValues)
    .filter(([field, value]) => isCertificateTemplateField(field) && normalizeWhitespace(value || ""))
    .length;
  const normalizedTemplateFieldKeys = new Set(
    Object.entries(templateFieldValues)
      .filter(([, value]) => normalizeWhitespace(value || ""))
      .map(([field]) => normalizeFieldLabel(field)),
  );
  const hasAnchorField = normalizedTemplateFieldKeys.has(normalizeFieldLabel("证书编号"))
    || normalizedTemplateFieldKeys.has(normalizeFieldLabel("管理编号"))
    || normalizedTemplateFieldKeys.has(normalizeFieldLabel("仪器名称"));

  if (markerHits >= 2) {
    return CERTIFICATE_TEMPLATE_PROFILE_ID;
  }
  if (markerHits >= 1 && templateFieldHits >= 2 && hasAnchorField) {
    return CERTIFICATE_TEMPLATE_PROFILE_ID;
  }
  if (templateFieldHits >= 3 && hasAnchorField) {
    return CERTIFICATE_TEMPLATE_PROFILE_ID;
  }
  return "";
}

function selectCertificateTemplateFieldValue(field, candidates = []) {
  const fieldKey = normalizeFieldLabel(field);
  const ranked = rankFieldCandidates(field, candidates);
  if (!ranked.length) {
    return "";
  }

  if (fieldKey === normalizeFieldLabel("证书编号")) {
    const strongStructuredCandidate = ranked.find((candidate) => (
      candidate.source === "structured"
      && (looksLikeCertificateIdentifier(candidate.value) || looksLikeStructuredReportNumber(candidate.value))
      && candidate.score >= getStrongFieldScoreThreshold(field)
    ));
    if (strongStructuredCandidate) {
      return strongStructuredCandidate.value;
    }
  }

  if (fieldKey === normalizeFieldLabel("管理编号")) {
    const strongRawCandidate = ranked.find((candidate) => {
      if (candidate.source !== "raw") {
        return false;
      }
      return looksLikeManagementIdentifier(candidate.value) && candidate.score >= 300;
    });

    if (strongRawCandidate) {
      return strongRawCandidate.value;
    }
  }

  return ranked[0]?.value || "";
}

function extractCertificateTemplateFieldBundle(options = {}) {
  const fields = options.fields || state.fields;
  const templateFields = getCertificateTemplateFields(fields);
  const structuredText = normalizeExtractedText(options.structuredText || "");
  const rawText = normalizeExtractedText(options.rawText || "");
  const values = {};
  const fieldCandidates = {};

  templateFields.forEach((field) => {
    const candidates = [
      ...collectCertificateTemplateFieldCandidates(structuredText, field, "structured", 28),
      ...collectCertificateTemplateFieldCandidates(rawText, field, "raw", 8),
    ];
    const value = selectCertificateTemplateFieldValue(field, candidates);
    if (value) {
      values[field] = value;
    }
    fieldCandidates[field] = summarizeFieldCandidatesForDiagnostics(field, candidates);
  });

  return {
    values,
    fieldCandidates,
  };
}

function collectLooseIdentifierCandidates(text, field) {
  const fieldKey = normalizeFieldLabel(field);
  if (fieldKey !== normalizeFieldLabel("证书编号") && !isGenericIdentifierFieldKey(fieldKey)) {
    return [];
  }

  const lines = normalizeExtractedText(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const candidates = [];
  const seen = new Set();

  lines.forEach((line) => {
    extractIdentifierLikeCandidates(line).forEach((identifier) => {
      const normalized = normalizeFieldValueForOutput(field, identifier);
      const dedupeKey = `${fieldKey}::${normalized}::${line}`;
      if (!normalized || seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      let sourceBonus = 6;
      if (matchesFieldLabelText(line, field)) {
        sourceBonus += 12;
      }
      if (fieldKey === normalizeFieldLabel("证书编号") && /(证书|Certificate)/i.test(line)) {
        sourceBonus += 12;
      }
      if (isManagementIdentifierFieldKey(fieldKey) && (/管理|Management|LD[-_/]?EQ/i.test(line) || looksLikeManagementIdentifier(identifier))) {
        sourceBonus += 24;
      }

      if (isUsableExtractedValue(normalized, field, { rawValue: line, sourceBonus })) {
        candidates.push({ value: normalized, rawValue: line, sourceBonus });
      }
    });
  });

  return candidates;
}

function extractFieldValueFromLines(text, field) {
  return selectBestFieldCandidate(field, collectFieldCandidatesFromLines(text, field));
}

function extractFieldValueFromText(text, field) {
  const fieldPatterns = getBoundedFlexibleFieldPatterns(field);
  if (!text || !fieldPatterns.length) {
    return "";
  }
  const candidates = [];
  const patterns = fieldPatterns.flatMap((fieldPattern) => ([
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s*[：:]\\s*([^\\n\\r]+)`, "i"),
    new RegExp(`${fieldPattern}\\s*[：:]\\s*([^\\n\\r]+)`, "i"),
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s+([^\\n\\r]+)`, "i"),
    new RegExp(`${fieldPattern}\\s+([^\\n\\r]+)`, "i"),
    new RegExp(`(?:^|[\\n\\r])\\s*${fieldPattern}\\s*[：:]?\\s*[\\n\\r]+\\s*([^\\n\\r]+)`, "i"),
  ]));

  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(globalPattern)) {
      if (!match || !match[1]) {
        continue;
      }

      const candidate = normalizeFieldValueForOutput(field, truncateAtNextField(match[1], field));
      if (isUsableExtractedValue(candidate, field)) {
        candidates.push({ value: candidate, rawValue: match[0], sourceBonus: 12 });
      }
    }
  }

  candidates.push(...collectFieldCandidatesFromLines(text, field));
  candidates.push(...collectLooseIdentifierCandidates(text, field));
  return selectBestFieldCandidate(field, candidates);
}

function getLockedRecordFieldValue(record, field) {
  if (
    isCertificateTemplateProfile(record.documentProfile)
    && isCertificateTemplateField(field)
  ) {
    return normalizeFieldValueForOutput(field, record.templateFieldValues?.[field] || "");
  }
  return "";
}

function syncValuesFromContent(record, fields = state.fields) {
  const filenameFieldValues = parseStructuredFilenameFieldValues(record.originalName);
  const trustStructuredFilename = shouldTrustStructuredFilename(record, filenameFieldValues);
  const trustStructuredFilenameMetadata = hasStructuredFilenameFieldAgreement(record, filenameFieldValues);
  const documentOverrides = buildDocumentFieldOverrides(record);
  const allowFilenameFallback = !shouldDisableFilenameFallbackForDiagnostics();
  const allowKnownAddressFallback = !shouldDisableKnownAddressFallbackForDiagnostics();

  fields.forEach((field) => {
    const previousAuto = record.autoValues[field] || "";
    const fieldKey = normalizeFieldLabel(field);
    const lockedValue = getLockedRecordFieldValue(record, field);
    const filenameFallback = getFilenameFallbackFieldValue(field, filenameFieldValues);
    const overrideValue = documentOverrides?.values?.[field];
    let extracted = typeof overrideValue === "string"
      ? overrideValue
      : (lockedValue || extractFieldValueFromText(record.contentText, field));
    const shouldPreferStructuredFilenameMetadata = trustStructuredFilenameMetadata
      && filenameFallback
      && (
        fieldKey === normalizeFieldLabel("客户名称")
        || fieldKey === normalizeFieldLabel("地址")
      );
    if (
      allowFilenameFallback
      && (((!normalizeWhitespace(extracted) || trustStructuredFilename) || shouldUseFilenameFallbackForField(field, extracted, filenameFallback) || shouldPreferStructuredFilenameMetadata) && filenameFallback)
    ) {
      extracted = field === "客户名称"
        ? mergeCorruptedChineseText(filenameFallback, extracted)
        : filenameFallback;
    }
    if (!normalizeWhitespace(extracted) && allowKnownAddressFallback && fieldKey === normalizeFieldLabel("地址")) {
      const knownAddress = getKnownCustomerAddress(
        record.values["客户名称"]
        || record.autoValues["客户名称"]
        || documentOverrides?.values?.["客户名称"]
        || filenameFieldValues["客户名称"]
        || "",
      );
      if (knownAddress) {
        extracted = knownAddress;
      }
    }
    const current = record.values[field] || "";
    const shouldReplace = !normalizeWhitespace(current) || current === previousAuto;
    record.autoValues[field] = extracted || "";
    if (shouldReplace) {
      record.values[field] = extracted || "";
    }
  });

  repairFilenameFallbackArtifacts(record, filenameFieldValues);
}

function getPdfOcrTargetFields(record) {
  if (shouldForcePdfOcrForDiagnostics()) {
    return state.fields.filter((field) => !normalizeWhitespace(getLockedRecordFieldValue(record, field)));
  }

  return state.fields.filter((field) => {
    const lockedValue = getLockedRecordFieldValue(record, field);
    if (normalizeWhitespace(lockedValue)) {
      return false;
    }

    const extractedValue = normalizeFieldValueForOutput(
      field,
      record.autoValues?.[field] || record.values?.[field] || "",
    );
    if (!normalizeWhitespace(extractedValue)) {
      return true;
    }

    return !isStrongExtractedValue(field, extractedValue, {
      documentProfile: record.documentProfile,
      templateFieldValues: record.templateFieldValues,
    });
  });
}

function getEarlyRegionPriorityFields(fields = []) {
  const priorityKeys = new Set([
    normalizeFieldLabel("证书编号"),
    normalizeFieldLabel("客户名称"),
    normalizeFieldLabel("仪器名称"),
  ]);
  return fields.filter((field) => priorityKeys.has(normalizeFieldLabel(field)));
}

function hasPendingPdfOcrWork(record) {
  if (!record || record.extensionLower !== ".pdf") {
    return false;
  }
  const targetFields = getPdfOcrTargetFields(record);
  if (!targetFields.length) {
    return false;
  }
  return !hasAttemptedOcrFieldSet(record, normalizeFieldSetKey(targetFields));
}

async function getPdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = loadScript(resolveAssetUrl("./vendor/pdf.legacy.min.js"))
      .then(() => {
        if (!window.pdfjsLib?.getDocument) {
          throw new Error("PDF 引擎加载失败，请检查站点资源是否完整");
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = resolveAssetUrl("./vendor/pdf.worker.legacy.min.js");
        return window.pdfjsLib;
      })
      .catch((error) => {
        pdfJsLibPromise = null;
        throw error;
      });
  }
  return pdfJsLibPromise;
}

async function extractPdfText(file) {
  const hashStartedAt = getNowMs();
  const fileHash = await getFileFingerprint(file);
  const fileHashMs = getElapsedMs(hashStartedAt);
  const cacheKey = buildExtractionCacheKey({
    kind: "pdf-text",
    fileHash,
    page: 1,
  });
  const cached = getCachedExtractionArtifact(cacheKey);
  if (cached) {
    return {
      text: cached.text || "",
      fileHash,
      timings: {
        file_hash_ms: fileHashMs,
        pdf_text_extract_ms: 0,
        pdf_text_cache_hit: true,
      },
    };
  }

  const extractStartedAt = getNowMs();
  const pdfjsLib = await getPdfJsLib();
  const documentTask = pdfjsLib.getDocument({ data: new Uint8Array(await getFileArrayBuffer(file)) });
  const pdf = await documentTask.promise;
  const chunks = [];
  const pageCount = Math.min(pdf.numPages, PDF_MAX_PAGES_TO_READ);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
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
  const text = chunks.join("\n");
  setCachedExtractionArtifact(cacheKey, { text });
  return {
    text,
    fileHash,
    timings: {
      file_hash_ms: fileHashMs,
      pdf_text_extract_ms: getElapsedMs(extractStartedAt),
      pdf_text_cache_hit: false,
    },
  };
}

async function extractPdfTextWithOcr(file, fields = state.fields, options = {}) {
  const hashStartedAt = getNowMs();
  const fileHash = options.fileHash || await getFileFingerprint(file);
  const fileHashMs = options.fileHash ? 0 : getElapsedMs(hashStartedAt);
  const fieldSetKey = normalizeFieldSetKey(fields);
  const templateFamily = getTemplateFamilyHint(fields, options.documentProfile || "");
  const cacheKey = buildExtractionCacheKey({
    kind: "pdf-ocr",
    fileHash,
    page: 1,
    templateFamily,
    fieldSet: fieldSetKey,
  });
  const cached = getCachedExtractionArtifact(cacheKey);
  if (cached) {
    return {
      ...cached,
      fileHash,
      fieldSetKey,
      timings: {
        file_hash_ms: fileHashMs,
        ocr_render_ms: 0,
        ocr_region_ms: 0,
        ocr_fullpage_ms: 0,
        postprocess_ms: 0,
        ocr_cache_hit: true,
      },
    };
  }

  const pdfjsLib = await getPdfJsLib();
  const documentTask = pdfjsLib.getDocument({ data: new Uint8Array(await getFileArrayBuffer(file)) });
  const pdf = await documentTask.promise;
  const worker = await getOcrWorker(options.workerSlot || 0);
  const pageCount = Math.min(pdf.numPages, PDF_MAX_PAGES_TO_READ);
  const chunks = [];
  const pageDiagnostics = [];
  let mergedTemplateFieldValues = {};
  let documentProfile = "";
  let ocrRenderMs = 0;
  let ocrRegionMs = 0;
  let ocrFullpageMs = 0;
  let postprocessMs = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const renderStartedAt = getNowMs();
    const canvas = await renderPdfPageToCanvas(page, 3, 180);
    const rawCanvas = pageNumber === 1 && shouldRenderRawCanvasForFields(fields)
      ? await renderPdfPageToCanvas(page, 3, 0)
      : null;
    ocrRenderMs += getElapsedMs(renderStartedAt);

    const shouldDeferRegionFirst = fields.length > 3 && !shouldForcePdfOcrForDiagnostics();
    let regionStructuredText = "";
    let unresolvedFields = [...fields];
    const regionFirstFields = shouldDeferRegionFirst ? getEarlyRegionPriorityFields(fields) : fields;
    if (regionFirstFields.length) {
      const regionStartedAt = getNowMs();
      const regionFirst = await buildPreciseRegionStructuredText(canvas, rawCanvas, worker, regionFirstFields, pageNumber);
      ocrRegionMs += getElapsedMs(regionStartedAt);
      regionStructuredText = normalizeExtractedText(regionFirst.text);
      unresolvedFields = fields.filter((field) => !normalizeWhitespace(extractFieldValueFromText(regionStructuredText, field)));
    }
    const regionPostprocessStartedAt = getNowMs();
    const regionTemplateBundle = extractCertificateTemplateFieldBundle({
      structuredText: regionStructuredText,
      rawText: "",
      fields,
    });
    mergedTemplateFieldValues = {
      ...mergedTemplateFieldValues,
      ...regionTemplateBundle.values,
    };
    documentProfile = documentProfile || detectCertificateDocumentProfile({
      rawText: regionStructuredText,
      templateFieldValues: mergedTemplateFieldValues,
      fields,
    });
    postprocessMs += getElapsedMs(regionPostprocessStartedAt);

    if (!unresolvedFields.length) {
      if (regionStructuredText) {
        chunks.push(regionStructuredText);
      }
      pageDiagnostics.push({
        pageNumber,
        unresolvedFields,
        regionStructuredText,
        structuredText: "",
        rawTextPreview: "",
        templateFieldValues: regionTemplateBundle.values,
        fieldCandidates: regionTemplateBundle.fieldCandidates,
      });
      break;
    }

    await worker.setParameters({
      tessedit_pageseg_mode: "3",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const fullpageStartedAt = getNowMs();
    const result = await worker.recognize(canvas, {}, { tsv: true });
    ocrFullpageMs += getElapsedMs(fullpageStartedAt);
    const rawText = normalizeExtractedText(result?.data?.text || "");
    const ocrLines = parseTesseractTsv(result?.data?.tsv || "");
    const tentativeProfile = detectCertificateDocumentProfile({
      rawText,
      templateFieldValues: mergedTemplateFieldValues,
      fields,
    });
    const profileRegionStartedAt = getNowMs();
    const profileRegionText = tentativeProfile === GIMT_CERTIFICATE_PROFILE_ID
      ? await buildGimtProfileStructuredText(canvas, rawCanvas, worker, unresolvedFields)
      : "";
    ocrRegionMs += getElapsedMs(profileRegionStartedAt);
    const rawCombinedText = normalizeExtractedText([regionStructuredText, rawText].filter(Boolean).join("\n"));
    const rawStructuredText = buildStructuredFieldLinesFromText(rawCombinedText, unresolvedFields);
    const preStructuredText = normalizeExtractedText([regionStructuredText, profileRegionText, rawStructuredText].filter(Boolean).join("\n"));
    const unresolvedAfterPre = unresolvedFields.filter((field) => {
      const extractedValue = normalizeFieldValueForOutput(field, extractFieldValueFromText(preStructuredText, field));
      if (!normalizeWhitespace(extractedValue)) {
        return true;
      }
      if (normalizeFieldLabel(field) === normalizeFieldLabel("证书编号") && isAmbiguousCertificateIdentifierValue(extractedValue)) {
        return true;
      }
      return !isStrongExtractedValue(field, extractedValue, {
        documentProfile: tentativeProfile || documentProfile,
        templateFieldValues: mergedTemplateFieldValues,
      });
    });
    let structuredText = rawStructuredText;
    if (unresolvedAfterPre.length) {
      const structuredRegionStartedAt = getNowMs();
      structuredText = await buildStructuredTextFromOcrPage(canvas, rawCanvas, worker, ocrLines, unresolvedAfterPre, pageNumber);
      ocrRegionMs += getElapsedMs(structuredRegionStartedAt);
    }
    const combinedStructuredText = normalizeExtractedText([regionStructuredText, profileRegionText, structuredText].filter(Boolean).join("\n"));
    const templatePostprocessStartedAt = getNowMs();
    const templateBundle = extractCertificateTemplateFieldBundle({
      structuredText: combinedStructuredText,
      rawText,
      fields,
    });
    mergedTemplateFieldValues = {
      ...mergedTemplateFieldValues,
      ...templateBundle.values,
    };
    documentProfile = documentProfile || tentativeProfile || detectCertificateDocumentProfile({
      rawText,
      templateFieldValues: mergedTemplateFieldValues,
      fields,
    });
    postprocessMs += getElapsedMs(templatePostprocessStartedAt);
    pageDiagnostics.push({
      pageNumber,
      unresolvedFields,
      regionStructuredText,
      profileRegionText,
      structuredText,
      rawTextPreview: rawText.slice(0, 2000),
      templateFieldValues: templateBundle.values,
      fieldCandidates: templateBundle.fieldCandidates,
    });
    const pageText = normalizeExtractedText([regionStructuredText, structuredText, rawText].filter(Boolean).join("\n"));

    if (pageText) {
      chunks.push(pageText);
      if (fields.length && countMatchedFieldsInText(chunks.join("\n\n"), fields) >= fields.length) {
        break;
      }
    }
  }

  const ocrResult = {
    text: chunks.join("\n\n"),
    fileHash,
    fieldSetKey,
    documentProfile,
    templateFieldValues: isCertificateTemplateProfile(documentProfile) ? mergedTemplateFieldValues : {},
    templateDiagnostics: looksLikeCertificateFieldSelection(fields)
      ? {
        ocr: {
          documentProfile,
          templateFieldValues: mergedTemplateFieldValues,
          pages: pageDiagnostics,
        },
      }
      : null,
    timings: {
      file_hash_ms: fileHashMs,
      ocr_render_ms: ocrRenderMs,
      ocr_region_ms: ocrRegionMs,
      ocr_fullpage_ms: ocrFullpageMs,
      postprocess_ms: postprocessMs,
      ocr_cache_hit: false,
    },
  };
  setCachedExtractionArtifact(cacheKey, ocrResult);
  return ocrResult;
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
      documentProfile: "",
      templateFieldValues: {},
      templateDiagnostics: null,
    };
  }

  if (ext === ".pdf") {
    const extractedPdf = await extractPdfText(record.file);
    const extractedText = extractedPdf.text;
    const basePostprocessStartedAt = getNowMs();
    const baseTemplateBundle = extractCertificateTemplateFieldBundle({
      structuredText: extractedText,
      rawText: extractedText,
      fields: state.fields,
    });
    const documentProfile = detectCertificateDocumentProfile({
      baseText: extractedText,
      templateFieldValues: baseTemplateBundle.values,
      fields: state.fields,
    });
    return {
      text: extractedText,
      state: "ready",
      message: normalizeExtractedText(extractedText) ? "PDF 内容读取完成" : "PDF 没有可直接提取的文字，准备尝试 OCR",
      typeLabel: "PDF",
      fileHash: extractedPdf.fileHash,
      timings: {
        ...(extractedPdf.timings || {}),
        postprocess_ms: getElapsedMs(basePostprocessStartedAt),
      },
      documentProfile,
      templateFieldValues: isCertificateTemplateProfile(documentProfile) ? baseTemplateBundle.values : {},
      templateDiagnostics: looksLikeCertificateFieldSelection(state.fields)
        ? {
          base: {
            documentProfile,
            templateFieldValues: baseTemplateBundle.values,
            fieldCandidates: baseTemplateBundle.fieldCandidates,
            rawTextPreview: normalizeExtractedText(extractedText).slice(0, 2000),
          },
        }
        : null,
    };
  }

  if (ext === ".docx") {
    return {
      text: await extractDocxText(record.file),
      state: "ready",
      message: "DOCX 内容读取完成",
      typeLabel: "DOCX",
      documentProfile: "",
      templateFieldValues: {},
      templateDiagnostics: null,
    };
  }

  return {
    text: "",
    state: "unsupported",
    message: `暂不支持自动读取 ${ext || "该文件类型"} 内容`,
    typeLabel: ext ? ext.slice(1).toUpperCase() : "UNKNOWN",
    documentProfile: "",
    templateFieldValues: {},
    templateDiagnostics: null,
  };
}

function getPayloadFieldValue(valueMap, field) {
  const entries = Object.entries(valueMap || {});
  const normalizedField = normalizeFieldLabel(field);
  if (!normalizedField || !entries.length) {
    return "";
  }

  const directValue = valueMap?.[field];
  if (normalizeWhitespace(directValue || "")) {
    return directValue;
  }

  const normalizedVariants = new Set(
    getFieldLabelVariants(field).map((variant) => normalizeFieldLabel(variant)).filter(Boolean),
  );
  normalizedVariants.add(normalizedField);

  const matchedEntry = entries.find(([label, currentValue]) => (
    normalizedVariants.has(normalizeFieldLabel(label)) && normalizeWhitespace(currentValue || "")
  ));

  return matchedEntry?.[1] || "";
}

function applyBackendExtractionPayload(record, payload = {}) {
  const filenameFieldValues = parseStructuredFilenameFieldValues(record.originalName);

  record.baseContentText = normalizeExtractedText(payload.baseContentText || "");
  record.ocrContentText = normalizeExtractedText(payload.ocrContentText || "");
  updateRecordContentText(record);
  if (normalizeExtractedText(payload.contentText || "")) {
    record.contentText = normalizeExtractedText(payload.contentText || "");
  }

  record.contentState = payload.contentState || "ready";
  record.contentTypeLabel = payload.contentTypeLabel || (record.extensionLower === ".pdf" ? "PDF" : record.contentTypeLabel);
  record.ocrAttempted = Boolean(payload.ocrAttempted || record.ocrContentText);
  record.ocrAttemptedFieldSetKeys = [...new Set([...(record.ocrAttemptedFieldSetKeys || []), ...(payload.ocrAttemptedFieldSetKeys || [])])];
  replaceRecordExtractionMetadata(record, {
    documentProfile: payload.documentProfile || "",
    fileHash: payload.fileHash || "",
    templateFieldValues: payload.templateFieldValues || {},
    templateDiagnostics: payload.templateDiagnostics || null,
    timings: payload.extractionTimings || payload.timings || {},
  });

  state.fields.forEach((field) => {
    const previousAuto = record.autoValues[field] || "";
    const current = record.values[field] || "";
    const lockedValue = getPayloadFieldValue(record.templateFieldValues, field);
    const filenameFallback = getFilenameFallbackFieldValue(field, filenameFieldValues);
    let extracted = normalizeFieldValueForOutput(
      field,
      lockedValue
        || getPayloadFieldValue(payload.autoValues, field)
        || getPayloadFieldValue(payload.values, field)
        || "",
    );
    if (shouldUseFilenameFallbackForField(field, extracted, filenameFallback)) {
      extracted = field === "客户名称"
        ? mergeCorruptedChineseText(filenameFallback, extracted)
        : filenameFallback;
    }
    const shouldReplace = !normalizeWhitespace(current) || current === previousAuto;
    record.autoValues[field] = extracted || "";
    if (shouldReplace) {
      record.values[field] = extracted || "";
    }
  });

  if (record.contentState === "ready") {
    record.contentMessage = buildExtractionMessage(record);
    return;
  }

  record.contentMessage = payload.contentMessage || buildExtractionMessage(record);
}

function shouldUseBackendForRecord(record, options = {}) {
  if (!record || !BACKEND_EXTRACTABLE_EXTENSIONS.has(record.extensionLower) || !canAttemptBackendExtraction()) {
    return false;
  }

  if (options.reReadContent || !record.contentText || record.contentState === "idle" || record.contentState === "error") {
    return true;
  }

  return record.contentState === "ready" && hasPendingPdfOcrWork(record);
}

async function ensureBackendAvailability(force = false) {
  if (!canAttemptBackendExtraction()) {
    state.backendStatus = BACKEND_DISABLED_BY_QUERY ? "disabled" : "unsupported";
    state.backendMessage = BACKEND_DISABLED_BY_QUERY
      ? "当前页面已显式关闭本地后端"
      : "当前页面不是 HTTP 服务，无法连接本地后端";
    state.backendAppVersion = "";
    refreshVersionBadge();
    return false;
  }

  if (!force && backendHealthPromise && state.backendStatus === "online") {
    return backendHealthPromise;
  }

  backendHealthPromise = fetch(buildBackendApiUrl("/api/health"), { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `本地后端不可用（${response.status}）`);
      }

      state.backendAppVersion = String(payload.appVersion || "");
      if (state.backendAppVersion && state.backendAppVersion !== APP_VERSION) {
        state.backendStatus = "offline";
        state.backendMessage = `前端版本 ${APP_VERSION}，本地后端版本 ${state.backendAppVersion}，请确认已在同一目录拉取最新代码并重启本地服务`;
        refreshVersionBadge();
        return false;
      }

      state.backendStatus = "online";
      state.backendMessage = payload.message || "本地后端已连接";
      refreshVersionBadge();
      return true;
    })
    .catch((error) => {
      console.warn("Backend health check failed:", error);
      state.backendStatus = "offline";
      state.backendMessage = formatErrorMessage(error);
      state.backendAppVersion = "";
      refreshVersionBadge();
      backendHealthPromise = null;
      return false;
    });

  return backendHealthPromise;
}

async function extractRecordsWithBackend(records, options = {}, runId = state.extractionRunId) {
  if (!records.length) {
    return new Set();
  }

  const formData = new FormData();
  formData.append("fields", JSON.stringify(state.fields));
  formData.append("recordIds", JSON.stringify(records.map((record) => record.id)));
  formData.append("options", JSON.stringify({
    reReadContent: Boolean(options.reReadContent),
    strictCertificateMode: true,
  }));
  records.forEach((record) => {
    formData.append("files", record.file, record.originalName);
  });

  try {
    const response = await fetch(buildBackendApiUrl("/api/extract"), {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `本地后端读取失败（${response.status}）`);
    }

    state.backendAppVersion = String(payload.appVersion || state.backendAppVersion || "");
    refreshVersionBadge();

    const returnedFiles = Array.isArray(payload.files) ? payload.files : [];
    const payloadByRecordId = new Map();
    returnedFiles.forEach((item, index) => {
      const recordId = item?.recordId || records[index]?.id;
      if (recordId) {
        payloadByRecordId.set(recordId, item);
      }
    });

    const handledRecordIds = new Set();
    records.forEach((record, index) => {
      const item = payloadByRecordId.get(record.id) || returnedFiles[index];
      if (!item) {
        return;
      }
      applyBackendExtractionPayload(record, item);
      handledRecordIds.add(record.id);
    });

    state.backendStatus = "online";
    state.backendMessage = payload.message || "本地后端读取完成";
    if (runId === state.extractionRunId) {
      renderDataViews();
    }
    return handledRecordIds;
  } catch (error) {
    console.error("Backend extraction failed:", error);
    state.backendStatus = "error";
    state.backendMessage = formatErrorMessage(error);
    return new Set();
  }
}

async function populateRecordFromContent(record, options = {}) {
  const totalStartedAt = getNowMs();
  const { reReadContent = false } = options;
  if (reReadContent) {
    resetRecordExtractionArtifacts(record);
  }
  record.contentState = "reading";
  record.contentMessage = "正在读取文件内容...";

  try {
    if (reReadContent || !record.contentText || record.contentState === "idle") {
      const result = await readTextFromFile(record);
      record.baseContentText = normalizeExtractedText(result.text || "");
      updateRecordContentText(record);
      record.contentState = result.state;
      record.contentMessage = result.message;
      record.contentTypeLabel = result.typeLabel;
      applyRecordExtractionMetadata(record, result);
    }

    if (record.contentState === "ready") {
      syncValuesFromContent(record);
      const ocrTargetFields = getPdfOcrTargetFields(record);
      const ocrFieldSetKey = normalizeFieldSetKey(ocrTargetFields);

      if (
        record.extensionLower === ".pdf"
        && ocrTargetFields.length
        && !hasAttemptedOcrFieldSet(record, ocrFieldSetKey)
      ) {
        const queuedTask = enqueueOcrTask(async (workerSlot) => {
          record.contentState = "reading";
          record.contentMessage = "正在识别扫描版 PDF，可能需要 1 分钟左右...";
          renderDataViews();
          return extractPdfTextWithOcr(record.file, ocrTargetFields, {
            fileHash: record.fileHash,
            documentProfile: record.documentProfile,
            workerSlot,
          });
        });
        record.contentState = "reading";
        record.contentMessage = buildQueuedOcrMessage(queuedTask.queuePosition);
        renderDataViews();
        const ocrResult = await queuedTask.promise;
        record.ocrAttempted = true;
        markAttemptedOcrFieldSet(record, ocrResult?.fieldSetKey || ocrFieldSetKey);
        record.contentState = "ready";
        applyRecordExtractionMetadata(record, ocrResult);

        if (normalizeExtractedText(ocrResult?.text || "")) {
          record.ocrContentText = mergeOcrExtractionText(record.ocrContentText, ocrResult.text, state.fields);
          updateRecordContentText(record);
          syncValuesFromContent(record, ocrTargetFields);
        }
      }

      record.contentMessage = buildExtractionMessage(record);
    }
  } catch (error) {
    console.error(error);
    record.contentState = "error";
    record.contentMessage = `读取文件内容失败：${formatErrorMessage(error)}`;
  } finally {
    mergeRecordTimings(record, {
      total_extract_ms: getElapsedMs(totalStartedAt),
    });
  }
}

function mergeExtractionRequest(request, records = state.files, options = {}) {
  const mergedRecords = [...new Set([...(request?.records || []), ...(records || [])])];
  return {
    records: mergedRecords,
    options: {
      reReadContent: Boolean(request?.options?.reReadContent || options.reReadContent),
    },
  };
}

async function runAutoExtraction(records = state.files, options = {}) {
  syncPendingFieldInputs();
  if (!records.length) {
    renderDataViews();
    return;
  }

  const runId = ++state.extractionRunId;
  state.isExtracting = true;
  const backendEligibility = new Map();
  records.forEach((record) => {
    if (!options.reReadContent && record.contentText && record.contentState === "ready") {
      syncValuesFromContent(record);
    }
    backendEligibility.set(record.id, shouldUseBackendForRecord(record, options));
    if (options.reReadContent) {
      resetRecordExtractionArtifacts(record);
    }
    record.contentState = "reading";
    record.contentMessage = backendEligibility.get(record.id)
      ? "正在通过本地后端读取 PDF 内容..."
      : "正在读取文件内容...";
  });
  renderDataViews();

  const backendRecords = records.filter((record) => backendEligibility.get(record.id));
  let handledByBackend = new Set();
  if (backendRecords.length && await ensureBackendAvailability()) {
    handledByBackend = await extractRecordsWithBackend(backendRecords, options, runId);
  }

  const localRecords = records.filter((record) => !handledByBackend.has(record.id));
  await Promise.all(localRecords.map(async (record) => {
    await populateRecordFromContent(record, options);
    if (runId === state.extractionRunId) {
      renderDataViews();
    }
  }));

  if (runId !== state.extractionRunId) {
    return;
  }

  state.isExtracting = false;
  renderDataViews();
}

function refreshAutoExtraction(records = state.files, options = {}) {
  const nextRequest = mergeExtractionRequest(null, records, options);

  if (state.isExtracting && state.activeExtractionPromise) {
    if (nextRequest.options.reReadContent) {
      setStatus("当前还在识别文件内容，请等待这一轮完成后再重新读取", "warn");
      return state.activeExtractionPromise;
    }
    state.pendingExtractionRequest = mergeExtractionRequest(state.pendingExtractionRequest, nextRequest.records, nextRequest.options);
    return state.activeExtractionPromise;
  }

  const task = runAutoExtraction(nextRequest.records, nextRequest.options).finally(async () => {
    if (state.activeExtractionPromise !== task) {
      return;
    }

    state.activeExtractionPromise = null;
    if (!state.pendingExtractionRequest) {
      return;
    }

    const pendingRequest = state.pendingExtractionRequest;
    state.pendingExtractionRequest = null;
    await refreshAutoExtraction(pendingRequest.records, pendingRequest.options);
  });

  state.activeExtractionPromise = task;
  return task;
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
if (exportDiagnosticsBtn) {
  exportDiagnosticsBtn.addEventListener("click", exportDiagnostics);
}
exportZipBtn.addEventListener("click", exportZip);

refreshVersionBadge();

render();

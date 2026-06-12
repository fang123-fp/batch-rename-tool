const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8123);
const rootDir = __dirname;
const baseDir = path.resolve(rootDir);
const tempRootDir = path.join(baseDir, '.tmp');
const APP_VERSION = '20260612-manualflow1';
const maxUploadFiles = Number(process.env.MAX_UPLOAD_FILES || 200);
const maxUploadFileSize = Number(process.env.MAX_UPLOAD_FILE_SIZE || 50 * 1024 * 1024);

let browserPromise = null;
let workerPageState = null;
let workerPageRunPromise = Promise.resolve();
let workerPageWarmPromise = null;

function getNowMs() {
  return Date.now();
}

function getElapsedMs(startedAt) {
  return Math.max(0, getNowMs() - startedAt);
}

function formatErrorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return '未知错误';
}

function buildWorkerUrl() {
  const workerUrl = new URL(`http://127.0.0.1:${port}/`);
  workerUrl.searchParams.set('backend', 'off');
  workerUrl.searchParams.set('serverWorker', '1');
  workerUrl.searchParams.set('v', String(Date.now()));
  return workerUrl.href;
}

function buildTemplateFromFields(fields) {
  if (!Array.isArray(fields) || !fields.length) {
    return '{姓名}-{编号}';
  }
  return fields.map((field) => `{${String(field || '').trim()}}`).join('-');
}

function sanitizeUploadName(filename) {
  const basename = path.basename(filename || 'upload.bin');
  return basename.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'upload.bin';
}

function safeJsonParse(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function removeDirectory(dirPath) {
  if (!dirPath) {
    return;
  }
  await fsp.rm(dirPath, { recursive: true, force: true });
}

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [`http://localhost:${port}`];
  Object.values(interfaces).forEach((items) => {
    (items || []).forEach((item) => {
      if (item.family === 'IPv4' && !item.internal) {
        urls.push(`http://${item.address}:${port}`);
      }
    });
  });
  return [...new Set(urls)];
}

function findExecutableInPath(command) {
  const whichCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(whichCommand, [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    return '';
  }
  const firstLine = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine || '';
}

function getBrowserCandidates() {
  const candidates = [
    { name: 'Env Chrome', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '' },
    { name: 'Env Chrome', executablePath: process.env.CHROME_PATH || '' },
    { name: 'Google Chrome (macOS)', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { name: 'Google Chrome Canary (macOS)', executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary' },
    { name: 'Microsoft Edge (macOS)', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
    { name: 'Google Chrome (Windows)', executablePath: path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe') },
    { name: 'Google Chrome (Windows x86)', executablePath: path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe') },
    { name: 'Google Chrome (Windows Local)', executablePath: path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe') },
    { name: 'Microsoft Edge (Windows)', executablePath: path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe') },
    { name: 'Microsoft Edge (Windows x86)', executablePath: path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe') },
    { name: 'Google Chrome (Linux)', executablePath: '/usr/bin/google-chrome' },
    { name: 'Google Chrome Stable (Linux)', executablePath: '/usr/bin/google-chrome-stable' },
    { name: 'Chromium Browser (Linux)', executablePath: '/usr/bin/chromium-browser' },
    { name: 'Chromium (Linux)', executablePath: '/usr/bin/chromium' },
    { name: 'Google Chrome (PATH)', executablePath: findExecutableInPath('google-chrome') },
    { name: 'Google Chrome Stable (PATH)', executablePath: findExecutableInPath('google-chrome-stable') },
    { name: 'Chromium (PATH)', executablePath: findExecutableInPath('chromium') },
    { name: 'Chromium Browser (PATH)', executablePath: findExecutableInPath('chromium-browser') },
    { name: 'Microsoft Edge (PATH)', executablePath: findExecutableInPath('msedge') },
  ];

  return candidates.filter((candidate) => candidate.executablePath);
}

function resolveBrowserLaunchOptions() {
  const match = getBrowserCandidates().find((candidate) => fs.existsSync(candidate.executablePath));
  if (!match) {
    throw new Error('未找到可用的 Chrome / Edge 浏览器，请安装桌面浏览器，或设置 PUPPETEER_EXECUTABLE_PATH');
  }

  return {
    browserName: match.name,
    executablePath: match.executablePath,
    launchOptions: {
      executablePath: match.executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=medium',
      ],
    },
  };
}

async function getBrowser() {
  if (!browserPromise) {
    const { launchOptions } = resolveBrowserLaunchOptions();
    browserPromise = puppeteer.launch(launchOptions).catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (workerPageState?.page) {
    await workerPageState.page.close().catch(() => {});
    workerPageState = null;
  }
  if (!browserPromise) {
    return;
  }
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (_error) {
    // Ignore shutdown errors.
  } finally {
    browserPromise = null;
  }
}

async function createWorkerPage(browser, timeoutMs) {
  const workerUrl = buildWorkerUrl();
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  page.on('pageerror', (error) => {
    console.error('Worker page error:', formatErrorMessage(error));
  });
  await page.goto(workerUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#fileInput');
  return {
    page,
    workerUrl,
  };
}

async function getWorkerPage(timeoutMs) {
  const browser = await getBrowser();
  if (workerPageState?.page && !workerPageState.page.isClosed()) {
    workerPageState.page.setDefaultTimeout(timeoutMs);
    workerPageState.page.setDefaultNavigationTimeout(timeoutMs);
    return {
      page: workerPageState.page,
      workerPageBootMs: 0,
      workerPageReused: true,
    };
  }

  const bootStartedAt = getNowMs();
  const nextState = await createWorkerPage(browser, timeoutMs);
  workerPageState = nextState;
  return {
    page: nextState.page,
    workerPageBootMs: getElapsedMs(bootStartedAt),
    workerPageReused: false,
  };
}

async function resetWorkerPage(page, fields, requestOptions = {}) {
  await page.evaluate(({ workerFields, workerTemplate, workerRequestOptions }) => {
    state.fields = [...workerFields];
    state.pendingFields = [];
    state.files = [];
    state.template = workerTemplate;
    state.status = '服务端工作页初始化完成';
    state.statusKind = '';
    state.isExtracting = false;
    state.needsProcessing = false;
    state.hasProcessedFiles = false;
    state.extractionRunId = 0;
    state.activeExtractionPromise = null;
    state.pendingExtractionRequest = null;
    state.focusPendingFieldId = '';
    state.backendStatus = 'disabled';
    state.backendMessage = '服务端工作页已禁用本地后端递归调用';
    pendingOcrTasks.length = 0;
    activeOcrJobCount = 0;
    waitingOcrJobCount = 0;
    serverWorkerOriginalNamesQueue = [];
    activeWorkerRequestOptions = { ...(workerRequestOptions || {}) };
    if (activeOcrWorkerSlots?.clear) {
      activeOcrWorkerSlots.clear();
    }
    fileInput.value = '';
    templateInput.value = workerTemplate;
    render();
  }, {
    workerFields: fields,
    workerTemplate: buildTemplateFromFields(fields),
    workerRequestOptions: requestOptions,
  });
}

function runSerializedOnWorkerPage(task) {
  const nextRun = workerPageRunPromise
    .catch(() => {})
    .then(task);
  workerPageRunPromise = nextRun.catch(() => {});
  return nextRun;
}

function warmWorkerPageResources() {
  if (!workerPageWarmPromise) {
    workerPageWarmPromise = runSerializedOnWorkerPage(async () => {
      const { page } = await getWorkerPage(180000);
      await page.evaluate(async () => {
        try {
          await getPdfJsLib();
        } catch (_error) {
          // Ignore prewarm failures and let request-time path retry.
        }
        try {
          await ensureTesseractLoaded();
        } catch (_error) {
          // Ignore prewarm failures and let request-time path retry.
        }

        const warmWorkerCount = Math.max(1, Math.min(2, Number(OCR_CONCURRENCY_LIMIT) || 1));
        await Promise.all(Array.from({ length: warmWorkerCount }, async (_unused, slot) => {
          try {
            await getOcrWorker(slot);
          } catch (_error) {
            // Ignore prewarm failures and let request-time path retry.
          }
        }));
      });
    }).catch((error) => {
      workerPageWarmPromise = null;
      throw error;
    });
  }
  return workerPageWarmPromise;
}

function isRetryableWorkerPageError(error) {
  const message = formatErrorMessage(error);
  return /frame got detached|waitForFunction failed|Waiting failed|ERR_CONNECTION_REFUSED|Target closed|Session closed|Protocol error/i.test(message);
}

async function extractFilesWithBrowser(options) {
  const {
    files,
    fields,
    recordIds,
    requestOptions,
  } = options;
  return runSerializedOnWorkerPage(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timeoutMs = Math.max(180000, Math.min(1800000, files.length * 60000));
      const workerExtractStartedAt = getNowMs();
      const { page, workerPageBootMs, workerPageReused } = await getWorkerPage(timeoutMs);

      try {
        await resetWorkerPage(page, fields, requestOptions);

      const input = await page.$('#fileInput');
      if (!input) {
        throw new Error('服务端工作页缺少文件上传输入框');
      }

      await page.evaluate((originalNames) => {
        serverWorkerOriginalNamesQueue = [...originalNames];
      }, files.map((file) => file.originalname || ''));
      await input.uploadFile(...files.map((file) => file.path));
      await page.waitForFunction((expectedCount) => state.files.length === expectedCount, {}, files.length);
      await page.waitForFunction(() => {
        const action = document.querySelector('#processFilesBtn');
        return Boolean(action && !action.disabled);
      }, { timeout: timeoutMs });
      await page.evaluate(async () => {
        await processBatchRename();
      });
      await page.waitForFunction((expectedCount) => (
        state.files.length === expectedCount
        && !state.isExtracting
          && !state.needsProcessing
          && !state.activeExtractionPromise
          && state.files.every((record) => record.contentState !== 'reading')
        ), { timeout: timeoutMs }, files.length);

        const snapshot = await page.evaluate(() => buildDiagnosticsSnapshot());
        const rows = Array.isArray(snapshot?.records) ? snapshot.records : [];

        return {
          files: rows.map((row, index) => ({
            recordId: recordIds[index] || '',
            originalName: files[index]?.originalname || row.originalName || '',
            contentState: row.contentState,
            contentMessage: row.contentMessage,
            contentTypeLabel: row.contentTypeLabel,
            ocrAttempted: Boolean(row.ocrAttempted),
            ocrAttemptedFieldSetKeys: row.ocrAttemptedFieldSetKeys || [],
            documentProfile: row.documentProfile || '',
            fileHash: row.fileHash || '',
            timings: row.extractionTimings || {},
            values: row.values || {},
            autoValues: row.autoValues || {},
            templateFieldValues: row.templateFieldValues || {},
            baseContentText: row.baseContentText || '',
            ocrContentText: row.ocrContentText || '',
            contentText: row.contentText || '',
            templateDiagnostics: row.templateDiagnostics || null,
            workerBackendStatus: snapshot.backendStatus || '',
            workerBackendMessage: snapshot.backendMessage || '',
            requestedStrictCertificateMode: Boolean(requestOptions?.strictCertificateMode),
          })),
          timings: {
            worker_page_boot_ms: workerPageBootMs,
            worker_page_reused: workerPageReused,
            worker_extract_ms: getElapsedMs(workerExtractStartedAt),
            worker_page_retry_count: attempt,
          },
        };
      } catch (error) {
        if (workerPageState?.page === page) {
          await page.close().catch(() => {});
          workerPageState = null;
        }
        if (attempt > 0 || !isRetryableWorkerPageError(error)) {
          throw error;
        }
        await closeBrowser();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  });
}

const app = express();

app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(baseDir, {
  index: false,
  extensions: ['html'],
  setHeaders(response) {
    response.setHeader('Cache-Control', 'no-store');
  },
}));

app.get('/api/health', async (_request, response) => {
  try {
    const browserInfo = resolveBrowserLaunchOptions();
    await warmWorkerPageResources().catch(() => {});
    response.json({
      ok: true,
      message: `本地后端已就绪，当前使用 ${browserInfo.browserName}`,
      browserName: browserInfo.browserName,
      executablePath: browserInfo.executablePath,
      appVersion: APP_VERSION,
    });
  } catch (error) {
    response.status(503).json({
      ok: false,
      message: formatErrorMessage(error),
    });
  }
});

const uploadStorage = multer.diskStorage({
  destination(request, _file, callback) {
    callback(null, request.uploadTempDir);
  },
  filename(request, file, callback) {
    const currentIndex = request.uploadFileIndex || 0;
    request.uploadFileIndex = currentIndex + 1;
    callback(null, `${String(currentIndex).padStart(4, '0')}-${sanitizeUploadName(file.originalname)}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    files: maxUploadFiles,
    fileSize: maxUploadFileSize,
    fieldSize: 1024 * 1024,
  },
});

async function prepareUploadTempDir(request, _response, next) {
  try {
    await ensureDirectory(tempRootDir);
    request.uploadTempDir = await fsp.mkdtemp(path.join(tempRootDir, 'upload-'));
    request.uploadFileIndex = 0;
    next();
  } catch (error) {
    next(error);
  }
}

function markRequestStart(request, _response, next) {
  request.requestStartedAt = getNowMs();
  next();
}

app.post('/api/extract', markRequestStart, prepareUploadTempDir, upload.array('files', maxUploadFiles), async (request, response) => {
  const fields = safeJsonParse(request.body.fields, []).map((field) => String(field || '').trim()).filter(Boolean);
  const recordIds = safeJsonParse(request.body.recordIds, []);
  const requestOptions = safeJsonParse(request.body.options, {});
  const files = Array.isArray(request.files) ? request.files : [];
  const backendUploadMs = getElapsedMs(request.requestStartedAt || getNowMs());
  const requestStartedAt = getNowMs();

  try {
    if (!files.length) {
      response.status(400).json({ ok: false, message: '没有收到要识别的文件' });
      return;
    }
    if (!fields.length) {
      response.status(400).json({ ok: false, message: '没有收到字段列表' });
      return;
    }

    const extractionResult = await extractFilesWithBrowser({
      files,
      fields,
      recordIds,
      requestOptions,
    });

    response.json({
      ok: true,
      appVersion: APP_VERSION,
      message: `本地后端已完成 ${extractionResult.files.length} 份文件的统一识别`,
      timings: {
        backend_upload_ms: backendUploadMs,
        total_request_ms: getElapsedMs(requestStartedAt) + backendUploadMs,
        ...extractionResult.timings,
      },
      files: extractionResult.files,
    });
  } catch (error) {
    console.error('Extraction API failed:', error);
    await closeBrowser();
    response.status(500).json({
      ok: false,
      message: formatErrorMessage(error),
    });
  } finally {
    await removeDirectory(request.uploadTempDir);
  }
});

app.get('/', (_request, response) => {
  response.sendFile(path.join(baseDir, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error('Server error:', error);
  response.status(500).json({
    ok: false,
    message: formatErrorMessage(error),
  });
});

const server = app.listen(port, host, async () => {
  await ensureDirectory(tempRootDir).catch(() => {});
  console.log('Batch rename tool server is running.');
  getNetworkUrls().forEach((url) => console.log(`Open: ${url}`));
  try {
    const browserInfo = resolveBrowserLaunchOptions();
    console.log(`Backend browser: ${browserInfo.browserName}`);
    console.log(`Executable: ${browserInfo.executablePath}`);
  } catch (error) {
    console.warn(`Backend browser not ready: ${formatErrorMessage(error)}`);
  }
  warmWorkerPageResources()
    .then(() => {
      console.log('Worker page prewarm completed.');
    })
    .catch((error) => {
      console.warn(`Worker page prewarm failed: ${formatErrorMessage(error)}`);
    });
  console.log('Press Ctrl+C to stop the server.');
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {});
  await closeBrowser();
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch(() => process.exit(1));
  });
});

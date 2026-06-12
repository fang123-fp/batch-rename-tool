#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const regressionScript = path.join(__dirname, 'run-batch-regression.js');
const baselinePath = path.join(__dirname, 'regression-expected.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const tmpRoot = path.join(repoRoot, '.tmp', 'performance-gate');

const SINGLE_SAMPLE_FILES = [
  '页面提取自－SCAN0002-2.pdf',
  '页面提取自－SCAN0002-3.pdf',
  '页面提取自－SCAN0002-4.pdf',
  '页面提取自－SCAN0002-5.pdf',
  '页面提取自－SCAN0002-6.pdf',
  '页面提取自－SCAN0002-7.pdf',
];
const SINGLE_TWO_FIELD_SAMPLE = '页面提取自－SCAN0002-2.pdf';
const REREAD_SAMPLE = '页面提取自－SCAN0002-2.pdf';
const TWO_FIELDS = ['证书编号', '客户名称'];
const SIX_FIELDS = baseline.meta.fields;

function normalizeValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function computeMedian(numbers) {
  const values = numbers.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!values.length) {
    return 0;
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[middle];
  }
  return Math.round((values[middle - 1] + values[middle]) / 2);
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function healthCheck(baseUrl) {
  try {
    const response = await fetch(new URL('/api/health', baseUrl), { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json().catch(() => null);
    return payload && payload.ok ? payload : null;
  } catch (_error) {
    return null;
  }
}

async function waitForHealth(baseUrl, attempts = 40, intervalMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await healthCheck(baseUrl);
    if (health) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function runRegression(options) {
  const port = options.port || await allocatePort();
  const outputDir = options.outputDir;
  const args = [
    regressionScript,
    '--base-url', `http://127.0.0.1:${port}`,
    '--output-dir', outputDir,
  ];

  if (options.sampleDir) {
    args.push('--sample-dir', options.sampleDir);
  }
  if (options.sampleFiles && options.sampleFiles.length) {
    args.push('--sample-files', options.sampleFiles.join(','));
  }
  if (options.fields && options.fields.length) {
    args.push('--fields', options.fields.join(','));
  }
  if (options.requestMode) {
    args.push('--request-mode', options.requestMode);
  }
  if (options.batchSize) {
    args.push('--batch-size', String(options.batchSize));
  }
  if (options.label) {
    args.push('--label', options.label);
  }

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  const reportPath = path.join(outputDir, 'latest.json');
  const report = JSON.parse(await fsp.readFile(reportPath, 'utf8'));
  return {
    exitCode,
    stdout,
    stderr,
    report,
    outputDir,
    port,
  };
}

async function startPersistentServer(port, logPath) {
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl);
  if (!health) {
    child.kill('SIGTERM');
    throw new Error(`Persistent server failed to start on ${baseUrl}`);
  }
  return { child, baseUrl };
}

async function stopPersistentServer(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function collectPhase0Keys(report) {
  const requiredRequestKeys = ['backend_upload_ms', 'worker_page_boot_ms'];
  const requiredExtractionKeys = ['pdf_text_extract_ms', 'ocr_render_ms', 'ocr_region_ms', 'ocr_fullpage_ms', 'postprocess_ms'];

  const requestFound = new Set();
  const extractionFound = new Set();
  report.results.forEach((result) => {
    Object.keys(result.requestTimings || {}).forEach((key) => {
      if (requiredRequestKeys.includes(key)) {
        requestFound.add(key);
      }
    });
    Object.keys(result.extractionTimings || {}).forEach((key) => {
      if (requiredExtractionKeys.includes(key)) {
        extractionFound.add(key);
      }
    });
  });

  return {
    ok: requiredRequestKeys.every((key) => requestFound.has(key)) && requiredExtractionKeys.every((key) => extractionFound.has(key)),
    requiredRequestKeys,
    requiredExtractionKeys,
    requestFound: [...requestFound].sort(),
    extractionFound: [...extractionFound].sort(),
  };
}

function buildScenarioSummary(label, report, extra = {}) {
  return {
    label,
    outputDir: report.outputDir || '',
    totalElapsedMs: report.summary.totalElapsedMs,
    totalRequestElapsedMs: report.summary.totalRequestElapsedMs,
    medianRequestElapsedMs: report.summary.medianRequestElapsedMs,
    passCount: report.summary.passCount,
    failCount: report.summary.failCount,
    ...extra,
  };
}

async function main() {
  await ensureDirectory(tmpRoot);
  const runDir = await fsp.mkdtemp(path.join(tmpRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));

  const fullDir = path.join(runDir, 'full');
  const twoFieldDir = path.join(runDir, 'two-field');
  const sixFieldDir = path.join(runDir, 'six-field-single');
  const batchDir = path.join(runDir, 'batch-six');
  const rereadFirstDir = path.join(runDir, 'reread-first');
  const rereadSecondDir = path.join(runDir, 'reread-second');
  await Promise.all([
    ensureDirectory(fullDir),
    ensureDirectory(twoFieldDir),
    ensureDirectory(sixFieldDir),
    ensureDirectory(batchDir),
    ensureDirectory(rereadFirstDir),
    ensureDirectory(rereadSecondDir),
  ]);

  const fullRun = await runRegression({
    outputDir: fullDir,
    label: 'full-baseline',
  });
  fullRun.report.outputDir = fullDir;

  const phase0 = collectPhase0Keys(fullRun.report);

  const twoFieldRun = await runRegression({
    outputDir: twoFieldDir,
    sampleFiles: [SINGLE_TWO_FIELD_SAMPLE],
    fields: TWO_FIELDS,
    label: 'single-two-field',
  });
  twoFieldRun.report.outputDir = twoFieldDir;

  const sixFieldRun = await runRegression({
    outputDir: sixFieldDir,
    sampleFiles: SINGLE_SAMPLE_FILES,
    fields: SIX_FIELDS,
    label: 'single-six-field-sequence',
  });
  sixFieldRun.report.outputDir = sixFieldDir;

  const batchRun = await runRegression({
    outputDir: batchDir,
    sampleFiles: SINGLE_SAMPLE_FILES,
    fields: SIX_FIELDS,
    requestMode: 'batch',
    batchSize: SINGLE_SAMPLE_FILES.length,
    label: 'batch-six-files',
  });
  batchRun.report.outputDir = batchDir;

  const rereadPort = await allocatePort();
  const rereadLogPath = path.join(runDir, 'reread-server.log');
  const persistentServer = await startPersistentServer(rereadPort, rereadLogPath);
  let rereadFirst;
  let rereadSecond;
  try {
    rereadFirst = await runRegression({
      port: rereadPort,
      outputDir: rereadFirstDir,
      sampleFiles: [REREAD_SAMPLE],
      fields: SIX_FIELDS,
      label: 'reread-first',
    });
    rereadFirst.report.outputDir = rereadFirstDir;
    rereadSecond = await runRegression({
      port: rereadPort,
      outputDir: rereadSecondDir,
      sampleFiles: [REREAD_SAMPLE],
      fields: SIX_FIELDS,
      label: 'reread-second',
    });
    rereadSecond.report.outputDir = rereadSecondDir;
  } finally {
    await stopPersistentServer(persistentServer.child);
  }

  const sixFieldTimes = sixFieldRun.report.results.map((result) => result.elapsedMs);
  const sixFieldMedianMs = computeMedian(sixFieldTimes);
  const rereadSecondResult = rereadSecond.report.results[0] || {};
  const rereadTimings = rereadSecondResult.extractionTimings || {};

  const gates = {
    correctness: fullRun.exitCode === 0
      && fullRun.report.summary.passCount === Object.keys(baseline.samples).length
      && fullRun.report.summary.failCount === 0,
    phase0,
    twoField: {
      elapsedMs: twoFieldRun.report.summary.totalRequestElapsedMs,
      ok: twoFieldRun.exitCode === 0 && twoFieldRun.report.summary.totalRequestElapsedMs <= 2500,
    },
    sixFieldMedian: {
      sampleTimesMs: sixFieldTimes,
      medianMs: sixFieldMedianMs,
      ok: sixFieldRun.exitCode === 0 && sixFieldMedianMs <= 4000,
    },
    batchSix: {
      totalRequestElapsedMs: batchRun.report.summary.totalRequestElapsedMs,
      ok: batchRun.exitCode === 0 && batchRun.report.summary.totalRequestElapsedMs <= 15000,
    },
    rereadCache: {
      firstRequestElapsedMs: rereadFirst.report.summary.totalRequestElapsedMs,
      secondRequestElapsedMs: rereadSecond.report.summary.totalRequestElapsedMs,
      pdfTextCacheHit: Boolean(rereadTimings.pdf_text_cache_hit),
      ocrCacheHit: Boolean(rereadTimings.ocr_cache_hit),
      ok: rereadSecond.exitCode === 0
        && rereadSecond.report.summary.totalRequestElapsedMs <= 800
        && Boolean(rereadTimings.pdf_text_cache_hit)
        && Boolean(rereadTimings.ocr_cache_hit),
    },
  };

  const pass = gates.correctness
    && gates.phase0.ok
    && gates.twoField.ok
    && gates.sixFieldMedian.ok
    && gates.batchSix.ok
    && gates.rereadCache.ok;

  const summary = {
    status: pass ? 'PASS' : 'FAIL',
    objective: 'Phase 0/1 delivery gate',
    runDir,
    full: buildScenarioSummary('full-baseline', fullRun.report),
    twoField: buildScenarioSummary('single-two-field', twoFieldRun.report, { elapsedMs: twoFieldRun.report.summary.totalRequestElapsedMs }),
    sixFieldMedian: buildScenarioSummary('single-six-field-sequence', sixFieldRun.report, {
      sampleTimesMs: sixFieldTimes,
      medianMs: sixFieldMedianMs,
    }),
    batchSix: buildScenarioSummary('batch-six-files', batchRun.report, {
      totalRequestElapsedMs: batchRun.report.summary.totalRequestElapsedMs,
    }),
    rereadCache: {
      firstRequestElapsedMs: rereadFirst.report.summary.totalRequestElapsedMs,
      secondRequestElapsedMs: rereadSecond.report.summary.totalRequestElapsedMs,
      pdfTextCacheHit: Boolean(rereadTimings.pdf_text_cache_hit),
      ocrCacheHit: Boolean(rereadTimings.ocr_cache_hit),
      firstOutputDir: rereadFirstDir,
      secondOutputDir: rereadSecondDir,
    },
    phase0: {
      ok: phase0.ok,
      requestFound: phase0.requestFound,
      extractionFound: phase0.extractionFound,
    },
    gates,
  };

  const summaryPath = path.join(runDir, 'summary.json');
  await fsp.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const lines = [];
  lines.push(`Performance Gate: ${summary.status}`);
  lines.push(`Artifacts: ${runDir}`);
  lines.push(`Correctness: ${summary.full.passCount}/${Object.keys(baseline.samples).length} PASS`);
  lines.push(`Phase 0 timings visible: ${phase0.ok ? 'yes' : 'no'}`);
  lines.push(`2-field single: ${formatMs(summary.twoField.elapsedMs)} (target <= 2500 ms)`);
  lines.push(`6-field single median: ${formatMs(summary.sixFieldMedian.medianMs)} (target <= 4000 ms)`);
  lines.push(`6-file batch: ${formatMs(summary.batchSix.totalRequestElapsedMs)} (target <= 15000 ms)`);
  lines.push(`Reread cache hit: ${formatMs(summary.rereadCache.secondRequestElapsedMs)} (target <= 800 ms, pdf=${summary.rereadCache.pdfTextCacheHit}, ocr=${summary.rereadCache.ocrCacheHit})`);
  console.log(lines.join(os.EOL));

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

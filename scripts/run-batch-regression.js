#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'regression-expected.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = part.slice(2).split('=');
    const key = rawKey.trim();
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined && nextValue && !nextValue.startsWith('--')) {
      options[key] = nextValue;
      index += 1;
      continue;
    }
    options[key] = inlineValue !== undefined ? inlineValue : true;
  }
  return options;
}

function normalizeValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDateToken(yyyymmdd) {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    return yyyymmdd;
  }
  return `${yyyymmdd.slice(0, 4)} 年 ${yyyymmdd.slice(4, 6)} 月 ${yyyymmdd.slice(6, 8)} 日`;
}

function parseListOption(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function chunkArray(items, size) {
  const nextSize = Math.max(1, size || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += nextSize) {
    chunks.push(items.slice(index, index + nextSize));
  }
  return chunks;
}

function computeMedian(numbers) {
  const normalized = numbers.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!normalized.length) {
    return 0;
  }
  const middle = Math.floor(normalized.length / 2);
  if (normalized.length % 2 === 1) {
    return normalized[middle];
  }
  return Math.round((normalized[middle - 1] + normalized[middle]) / 2);
}

function computeAverage(numbers) {
  const normalized = numbers.filter((value) => Number.isFinite(value));
  if (!normalized.length) {
    return 0;
  }
  return Math.round(normalized.reduce((sum, value) => sum + value, 0) / normalized.length);
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

async function waitForHealth(baseUrl, attempts, intervalMs) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const health = await healthCheck(baseUrl);
    if (health) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function startServer(baseUrl, outputDir) {
  const parsedUrl = new URL(baseUrl);
  const logPath = path.join(outputDir, 'server.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: parsedUrl.hostname,
      PORT: parsedUrl.port || '8123',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  const health = await waitForHealth(baseUrl, 40, 1000);
  if (!health) {
    child.kill('SIGTERM');
    throw new Error(`本地后端未能在 ${baseUrl} 启动成功，详情见 ${logPath}`);
  }

  return {
    child,
    logPath,
    health,
  };
}

async function stopServer(child) {
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

async function extractFiles(baseUrl, fields, filePaths, sampleKeys) {
  const form = new FormData();
  form.append('fields', JSON.stringify(fields));
  form.append('recordIds', JSON.stringify(sampleKeys));
  form.append('options', JSON.stringify({ strictCertificateMode: true }));
  filePaths.forEach((filePath) => {
    form.append('files', new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' }), path.basename(filePath));
  });

  const startedAt = Date.now();
  const response = await fetch(new URL('/api/extract', baseUrl), {
    method: 'POST',
    body: form,
    cache: 'no-store',
  });
  const elapsedMs = Date.now() - startedAt;
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    const message = payload && payload.message ? payload.message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    elapsedMs,
    requestTimings: payload.timings || {},
    payloadFiles: Array.isArray(payload.files) ? payload.files : [],
  };
}

function buildFieldComparisons(fields, expectedMap, actualMap) {
  const comparisons = [];
  const failedFields = [];
  const openQuestionFields = [];

  fields.forEach((field) => {
    const expectedValue = Object.prototype.hasOwnProperty.call(expectedMap, field) ? expectedMap[field] : undefined;
    const actualValue = Object.prototype.hasOwnProperty.call(actualMap, field) ? actualMap[field] : '';
    const normalizedExpected = expectedValue === undefined ? undefined : normalizeValue(expectedValue);
    const normalizedActual = normalizeValue(actualValue);

    if (normalizedExpected === undefined) {
      openQuestionFields.push(field);
      comparisons.push({
        field,
        expected: null,
        actual: actualValue || '',
        status: 'open-question',
      });
      return;
    }

    const matched = normalizedExpected === normalizedActual;
    comparisons.push({
      field,
      expected: expectedValue,
      actual: actualValue || '',
      status: matched ? 'pass' : 'fail',
    });
    if (!matched) {
      failedFields.push({
        field,
        expected: expectedValue,
        actual: actualValue || '',
      });
    }
  });

  return {
    comparisons,
    failedFields,
    openQuestionFields,
  };
}

function classifyResult(failedFields, openQuestionFields, requestError) {
  if (requestError || failedFields.length) {
    return 'FAIL';
  }
  if (openQuestionFields.length) {
    return 'PARTIAL';
  }
  return 'PASS';
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Batch Regression Report');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Base URL: ${report.baseUrl}`);
  lines.push(`- Sample directory: ${report.sampleDir}`);
  if (report.scenarioLabel) {
    lines.push(`- Scenario: ${report.scenarioLabel}`);
  }
  lines.push(`- Request mode: ${report.requestMode}`);
  lines.push(`- Request batch size: ${report.requestBatchSize}`);
  lines.push(`- Total samples: ${report.summary.totalSamples}`);
  lines.push(`- Total elapsed: ${report.summary.totalElapsedMs} ms`);
  lines.push(`- Total request elapsed: ${report.summary.totalRequestElapsedMs} ms`);
  lines.push(`- Request count: ${report.summary.requestCount}`);
  lines.push(`- Median request elapsed: ${report.summary.medianRequestElapsedMs} ms`);
  lines.push(`- Average request elapsed: ${report.summary.averageRequestElapsedMs} ms`);
  lines.push(`- Pass: ${report.summary.passCount}`);
  lines.push(`- Partial: ${report.summary.partialCount}`);
  lines.push(`- Fail: ${report.summary.failCount}`);
  lines.push('');
  lines.push('| Status | File | Time (ms) | Failed Fields | Open Questions |');
  lines.push('| --- | --- | ---: | --- | --- |');

  report.results.forEach((result) => {
    const failed = result.failedFields.map((item) => item.field).join(', ') || '-';
    const openQuestions = result.openQuestionFields.join(', ') || '-';
    lines.push(`| ${result.status} | ${result.fileName} | ${result.elapsedMs} | ${failed} | ${openQuestions} |`);
  });

  lines.push('');
  report.results.forEach((result) => {
    lines.push(`## ${result.fileName}`);
    lines.push('');
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Time: ${result.elapsedMs} ms`);
    if (result.requestTimings && Object.keys(result.requestTimings).length) {
      lines.push(`- Request timings: \`${JSON.stringify(result.requestTimings)}\``);
    }
    if (result.extractionTimings && Object.keys(result.extractionTimings).length) {
      lines.push(`- Extraction timings: \`${JSON.stringify(result.extractionTimings)}\``);
    }
    if (result.requestError) {
      lines.push(`- Error: ${result.requestError}`);
      lines.push('');
      return;
    }
    result.comparisons.forEach((comparison) => {
      const expected = comparison.expected === null ? 'OPEN_QUESTION' : comparison.expected;
      lines.push(`- ${comparison.field}: actual=\`${comparison.actual || ''}\` expected=\`${expected}\` status=${comparison.status}`);
    });
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sampleDir = path.resolve(String(args['sample-dir'] || baseline.meta.defaultSampleDir));
  const baseUrl = String(args['base-url'] || process.env.REGRESSION_BASE_URL || 'http://127.0.0.1:8123');
  const outputDir = path.resolve(String(args['output-dir'] || path.join(repoRoot, '.tmp', 'regression')));
  const scenarioLabel = String(args.label || args.scenario || '').trim();
  const requestMode = String(args['request-mode'] || (args.batch ? 'batch' : 'single')).trim() === 'batch' ? 'batch' : 'single';
  const requestedFiles = parseListOption(args['sample-files']);
  const fields = String(args.fields || '').trim()
    ? String(args.fields).split(',').map((part) => part.trim()).filter(Boolean)
    : baseline.meta.fields;

  await ensureDirectory(outputDir);

  const availablePdfFiles = (await fsp.readdir(sampleDir))
    .filter((entry) => entry.toLowerCase().endsWith('.pdf'))
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  const pdfFiles = requestedFiles.length
    ? requestedFiles.filter((fileName) => availablePdfFiles.includes(fileName))
    : availablePdfFiles;
  const requestBatchSize = requestMode === 'batch'
    ? Math.max(1, Number(args['batch-size'] || pdfFiles.length || 1))
    : 1;

  const knownSamples = baseline.samples || {};
  const unexpectedFiles = pdfFiles.filter((fileName) => !Object.prototype.hasOwnProperty.call(knownSamples, fileName));
  const missingFiles = requestedFiles.length
    ? requestedFiles.filter((fileName) => !availablePdfFiles.includes(fileName))
    : Object.keys(knownSamples).filter((fileName) => !pdfFiles.includes(fileName));

  let serverHandle = null;
  let health = await healthCheck(baseUrl);
  if (!health) {
    serverHandle = await startServer(baseUrl, outputDir);
    health = serverHandle.health;
  }

  const runStartedAt = Date.now();
  const results = [];
  const requestElapsedTimes = [];
  const requestGroups = requestMode === 'batch'
    ? chunkArray(pdfFiles, requestBatchSize)
    : pdfFiles.map((fileName) => [fileName]);

  for (const requestGroup of requestGroups) {
    const filePaths = requestGroup.map((fileName) => path.join(sampleDir, fileName));
    try {
      const { elapsedMs, requestTimings, payloadFiles } = await extractFiles(baseUrl, fields, filePaths, requestGroup);
      requestElapsedTimes.push(elapsedMs);
      const payloadByRecordId = new Map();
      payloadFiles.forEach((item, index) => {
        const recordId = item && item.recordId ? item.recordId : requestGroup[index];
        if (recordId) {
          payloadByRecordId.set(recordId, item);
        }
      });

      requestGroup.forEach((fileName, index) => {
        const filePath = filePaths[index];
        const sampleConfig = knownSamples[fileName] || { expected: {}, source: 'unexpected-file' };
        const payload = payloadByRecordId.get(fileName) || payloadFiles[index] || null;
        if (!payload) {
          results.push({
            fileName,
            filePath,
            status: 'FAIL',
            elapsedMs,
            failedFields: [],
            openQuestionFields: fields.slice(),
            comparisons: [],
            values: {},
            contentMessage: '',
            contentState: 'error',
            documentProfile: '',
            requestTimings,
            extractionTimings: {},
            expectedSource: sampleConfig.source || '',
            notes: sampleConfig.notes || [],
            requestError: '后端未返回该文件的识别结果',
          });
          return;
        }

        const actualValues = payload.values || {};
        const { comparisons, failedFields, openQuestionFields } = buildFieldComparisons(fields, sampleConfig.expected || {}, actualValues);
        results.push({
          fileName,
          filePath,
          status: classifyResult(failedFields, openQuestionFields, ''),
          elapsedMs,
          failedFields,
          openQuestionFields,
          comparisons,
          values: actualValues,
          contentMessage: payload.contentMessage || '',
          contentState: payload.contentState || '',
          documentProfile: payload.documentProfile || '',
          requestTimings,
          extractionTimings: payload.timings || {},
          expectedSource: sampleConfig.source || '',
          notes: sampleConfig.notes || [],
          requestMode,
          requestGroupSize: requestGroup.length,
        });
      });
    } catch (error) {
      requestGroup.forEach((fileName, index) => {
        const sampleConfig = knownSamples[fileName] || { expected: {}, source: 'unexpected-file' };
        results.push({
          fileName,
          filePath: filePaths[index],
          status: 'FAIL',
          elapsedMs: 0,
          failedFields: [],
          openQuestionFields: fields.slice(),
          comparisons: [],
          values: {},
          contentMessage: '',
          contentState: 'error',
          documentProfile: '',
          expectedSource: sampleConfig.source || '',
          notes: sampleConfig.notes || [],
          requestError: error && error.message ? error.message : String(error),
          requestMode,
          requestGroupSize: requestGroup.length,
        });
      });
    }
  }

  const totalElapsedMs = Date.now() - runStartedAt;
  const summary = {
    totalSamples: results.length,
    totalElapsedMs,
    totalRequestElapsedMs: requestElapsedTimes.reduce((sum, value) => sum + value, 0),
    requestCount: requestElapsedTimes.length,
    medianRequestElapsedMs: computeMedian(requestElapsedTimes),
    averageRequestElapsedMs: computeAverage(requestElapsedTimes),
    passCount: results.filter((item) => item.status === 'PASS').length,
    partialCount: results.filter((item) => item.status === 'PARTIAL').length,
    failCount: results.filter((item) => item.status === 'FAIL').length,
    unexpectedFiles,
    missingFiles,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sampleDir,
    scenarioLabel,
    requestMode,
    requestBatchSize,
    fields,
    server: {
      reusedExistingServer: !serverHandle,
      appVersion: health ? health.appVersion || '' : '',
      browserName: health ? health.browserName || '' : '',
      logPath: serverHandle ? serverHandle.logPath : '',
    },
    summary,
    results,
  };

  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `batch-regression-${timestamp}.json`);
  const latestJsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, `batch-regression-${timestamp}.md`);
  const latestMarkdownPath = path.join(outputDir, 'latest.md');

  const markdown = renderMarkdown(report);
  await Promise.all([
    fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fsp.writeFile(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fsp.writeFile(markdownPath, markdown, 'utf8'),
    fsp.writeFile(latestMarkdownPath, markdown, 'utf8'),
  ]);

  results.forEach((result) => {
    console.log(`[${result.status}] ${result.fileName} ${result.elapsedMs}ms`);
    if (result.requestTimings && Object.keys(result.requestTimings).length) {
      console.log(`  requestTimings: ${JSON.stringify(result.requestTimings)}`);
    }
    if (result.extractionTimings && Object.keys(result.extractionTimings).length) {
      console.log(`  extractionTimings: ${JSON.stringify(result.extractionTimings)}`);
    }
    if (result.requestError) {
      console.log(`  error: ${result.requestError}`);
      return;
    }
    result.comparisons.forEach((comparison) => {
      const expectedValue = comparison.expected === null ? 'OPEN_QUESTION' : comparison.expected;
      console.log(`  ${comparison.field}: actual="${comparison.actual || ''}" expected="${expectedValue}" status=${comparison.status}`);
    });
    if (result.failedFields.length) {
      console.log(`  failedFields: ${result.failedFields.map((item) => item.field).join(', ')}`);
    }
    if (result.openQuestionFields.length) {
      console.log(`  openQuestions: ${result.openQuestionFields.join(', ')}`);
    }
  });

  console.log(`Summary: total=${summary.totalSamples} pass=${summary.passCount} partial=${summary.partialCount} fail=${summary.failCount} totalElapsedMs=${summary.totalElapsedMs} totalRequestElapsedMs=${summary.totalRequestElapsedMs} requestCount=${summary.requestCount}`);
  if (summary.unexpectedFiles.length) {
    console.log(`Unexpected files: ${summary.unexpectedFiles.join(', ')}`);
  }
  if (summary.missingFiles.length) {
    console.log(`Missing files: ${summary.missingFiles.join(', ')}`);
  }
  console.log(`Artifacts: ${latestJsonPath} ${latestMarkdownPath}`);

  await stopServer(serverHandle && serverHandle.child);

  if (summary.failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

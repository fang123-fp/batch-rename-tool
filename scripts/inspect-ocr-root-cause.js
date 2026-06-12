#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-expected.json'), 'utf8'));

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

  const health = await waitForHealth(baseUrl, 40, 500);
  if (!health) {
    child.kill('SIGTERM');
    throw new Error(`Backend failed to start at ${baseUrl}`);
  }

  return { child, logPath, health };
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

async function extractOne(baseUrl, filePath, fields, options = {}) {
  const form = new FormData();
  form.append('fields', JSON.stringify(fields));
  form.append('recordIds', JSON.stringify([path.basename(filePath)]));
  form.append('options', JSON.stringify({
    strictCertificateMode: true,
    ...options,
  }));
  form.append('files', new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' }), path.basename(filePath));

  const response = await fetch(new URL('/api/extract', baseUrl), {
    method: 'POST',
    body: form,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload && payload.message ? payload.message : `HTTP ${response.status}`);
  }
  const filePayload = Array.isArray(payload.files) ? payload.files[0] : null;
  if (!filePayload) {
    throw new Error('No file payload returned');
  }
  return {
    requestTimings: payload.timings || {},
    payload: filePayload,
  };
}

function buildSummary(fileName, payload, fields) {
  const expected = baseline.samples[fileName]?.expected || {};
  const baseText = String(payload.baseContentText || '');
  const ocrText = String(payload.ocrContentText || '');
  const combinedText = String(payload.contentText || '');

  const fieldChecks = Object.fromEntries(fields.map((field) => {
    const finalValue = payload.values?.[field] || '';
    const expectedValue = expected[field] || '';
    const normalizedFinal = normalizeValue(finalValue);
    const normalizedExpected = normalizeValue(expectedValue);
    return [field, {
      finalValue,
      expectedValue,
      exactMatch: normalizedFinal === normalizedExpected,
      inBaseText: Boolean(normalizedFinal && normalizeValue(baseText).includes(normalizedFinal)),
      inOcrText: Boolean(normalizedFinal && normalizeValue(ocrText).includes(normalizedFinal)),
      inCombinedText: Boolean(normalizedFinal && normalizeValue(combinedText).includes(normalizedFinal)),
    }];
  }));

  return {
    fileName,
    requestTimings: payload.timings || {},
    extractionTimings: payload.timings || {},
    contentState: payload.contentState || '',
    contentMessage: payload.contentMessage || '',
    documentProfile: payload.documentProfile || '',
    values: payload.values || {},
    autoValues: payload.autoValues || {},
    fieldChecks,
    baseTextPreview: baseText.slice(0, 2000),
    ocrTextPreview: ocrText.slice(0, 2000),
    combinedTextPreview: combinedText.slice(0, 2000),
    templateDiagnostics: payload.templateDiagnostics || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args['base-url'] || 'http://127.0.0.1:8123');
  const sampleDir = path.resolve(String(args['sample-dir'] || baseline.meta.defaultSampleDir));
  const outputRoot = path.resolve(String(args['output-dir'] || path.join(repoRoot, '.tmp', 'ocr-root-cause')));
  const fields = String(args.fields || '').trim()
    ? String(args.fields).split(',').map((part) => part.trim()).filter(Boolean)
    : baseline.meta.fields;
  const sampleFiles = String(args['sample-files'] || '').split(',').map((part) => part.trim()).filter(Boolean);
  const diagnosticOptions = {
    diagnosticDisableFilenameFallback: args['disable-filename-fallback'] !== 'false',
    diagnosticDisableKnownAddressFallback: args['disable-known-address-fallback'] !== 'false',
    diagnosticForceOcrForAllFields: args['force-ocr'] !== 'false',
  };
  const targetFiles = sampleFiles.length ? sampleFiles : Object.keys(baseline.samples);

  const runDir = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  await ensureDirectory(runDir);

  let serverHandle = null;
  let health = await healthCheck(baseUrl);
  if (!health) {
    serverHandle = await startServer(baseUrl, runDir);
    health = serverHandle.health;
  }

  const reports = [];
  try {
    for (const fileName of targetFiles) {
      const filePath = path.join(sampleDir, fileName);
      const result = await extractOne(baseUrl, filePath, fields, diagnosticOptions);
      const summary = buildSummary(fileName, result.payload, fields);
      summary.requestTimings = result.requestTimings;
      reports.push(summary);

      const safeLabel = fileName.replace(/[\\/:*?"<>|]/g, '_');
      await fsp.writeFile(
        path.join(runDir, `${safeLabel}.json`),
        `${JSON.stringify(summary, null, 2)}\n`,
        'utf8',
      );
    }

    const indexPath = path.join(runDir, 'index.json');
    await fsp.writeFile(indexPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl,
      health,
      fields,
      reports,
    }, null, 2)}\n`, 'utf8');

    console.log(`Root-cause artifacts: ${indexPath}`);
    reports.forEach((report) => {
      console.log(`[${report.fileName}] customer="${report.values['客户名称'] || ''}" address="${report.values['地址'] || ''}"`);
    });
  } finally {
    await stopServer(serverHandle && serverHandle.child);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

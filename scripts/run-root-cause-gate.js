#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression-expected.json'), 'utf8'));

function normalizeValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function main() {
  const runRoot = path.join(repoRoot, '.tmp', 'root-cause-gate');
  await ensureDirectory(runRoot);
  const runDir = await fsp.mkdtemp(path.join(runRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));

  const child = spawn(process.execPath, [
    path.join(__dirname, 'inspect-ocr-root-cause.js'),
    '--output-dir', runDir,
  ], {
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

  if (exitCode !== 0) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    process.exitCode = exitCode;
    return;
  }

  const runSubdirs = (await fsp.readdir(runDir)).sort();
  const latestDirName = runSubdirs[runSubdirs.length - 1];
  const indexPath = path.join(runDir, latestDirName, 'index.json');
  const payload = JSON.parse(await fsp.readFile(indexPath, 'utf8'));

  const failures = [];
  payload.reports.forEach((report) => {
    const failedFields = Object.entries(report.fieldChecks || {})
      .filter(([, details]) => !details.exactMatch)
      .map(([field]) => field);
    if (failedFields.length) {
      failures.push({
        fileName: report.fileName,
        failedFields,
        values: report.values || {},
      });
    }
  });

  const summary = {
    status: failures.length ? 'FAIL' : 'PASS',
    totalSamples: payload.reports.length,
    passSamples: payload.reports.length - failures.length,
    failures,
    artifactDir: path.join(runDir, latestDirName),
  };
  const summaryPath = path.join(runDir, latestDirName, 'summary.json');
  await fsp.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Root Cause Gate: ${summary.status}`);
  console.log(`Artifacts: ${path.join(runDir, latestDirName)}`);
  console.log(`Samples: ${summary.passSamples}/${summary.totalSamples}`);
  if (failures.length) {
    failures.forEach((failure) => {
      console.log(`FAIL ${failure.fileName}: ${failure.failedFields.join(', ')}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

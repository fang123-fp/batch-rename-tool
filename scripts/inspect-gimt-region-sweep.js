#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const repoRoot = path.resolve(__dirname, '..');

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

async function waitForHealth(baseUrl, attempts = 40, intervalMs = 500) {
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

  const health = await waitForHealth(baseUrl);
  if (!health) {
    child.kill('SIGTERM');
    throw new Error(`Backend failed to start at ${baseUrl}`);
  }
  return { child, logPath };
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

function findExecutableInPath(command) {
  const result = require('child_process').spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    return '';
  }
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function getBrowserCandidates() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH || '',
    process.env.CHROME_PATH || '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    findExecutableInPath('google-chrome'),
    findExecutableInPath('google-chrome-stable'),
    findExecutableInPath('chromium'),
    findExecutableInPath('chromium-browser'),
    findExecutableInPath('msedge'),
  ];
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(String(args.file || ''));
  if (!filePath) {
    throw new Error('Missing --file');
  }

  const baseUrl = String(args['base-url'] || 'http://127.0.0.1:8170');
  const outputDir = path.resolve(String(args['output-dir'] || path.join(repoRoot, '.tmp', 'gimt-region-sweep', new Date().toISOString().replace(/[:.]/g, '-'))));
  await ensureDirectory(outputDir);

  let serverHandle = null;
  if (!(await healthCheck(baseUrl))) {
    serverHandle = await startServer(baseUrl, outputDir);
  }

  const executablePath = getBrowserCandidates();
  if (!executablePath) {
    throw new Error('No local Chrome/Edge executable found for puppeteer');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(new URL('/?backend=off&serverWorker=1', baseUrl).href, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#fileInput');

    const trials = await page.evaluate(async ({ fileName, fileBytes }) => {
      const blob = new Blob([new Uint8Array(fileBytes)], { type: 'application/pdf' });
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const pdfjsLib = await getPdfJsLib();
      const documentTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const pdf = await documentTask.promise;
      const worker = await getOcrWorker(0);
      const page1 = await pdf.getPage(1);
      const thresholdedCanvas = await renderPdfPageToCanvas(page1, 3, 180);
      const rawCanvas = await renderPdfPageToCanvas(page1, 3, 0);

      const seeds = {
        customer: [
          { left: 0.30, top: 0.235, width: 0.48, height: 0.05, psm: '7', useThresholded: false, scale: 4 },
          { left: 0.32, top: 0.24, width: 0.45, height: 0.05, psm: '7', useThresholded: true, scale: 4 },
          { left: 0.28, top: 0.235, width: 0.52, height: 0.06, psm: '6', useThresholded: false, scale: 4 },
        ],
        address: [
          { left: 0.30, top: 0.285, width: 0.50, height: 0.07, psm: '6', useThresholded: false, scale: 4 },
          { left: 0.32, top: 0.29, width: 0.46, height: 0.07, psm: '7', useThresholded: true, scale: 4 },
          { left: 0.28, top: 0.285, width: 0.54, height: 0.075, psm: '6', useThresholded: false, scale: 5 },
        ],
        cert: [
          { left: 0.20, top: 0.19, width: 0.24, height: 0.045, psm: '7', useThresholded: false, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.22, top: 0.19, width: 0.22, height: 0.045, psm: '7', useThresholded: true, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.18, top: 0.185, width: 0.28, height: 0.05, psm: '6', useThresholded: false, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.16, top: 0.182, width: 0.32, height: 0.055, psm: '6', useThresholded: false, scale: 5, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
        ],
        instrument: [
          { left: 0.28, top: 0.345, width: 0.34, height: 0.05, psm: '7', useThresholded: false, scale: 4 },
          { left: 0.30, top: 0.345, width: 0.30, height: 0.05, psm: '7', useThresholded: true, scale: 4 },
          { left: 0.26, top: 0.34, width: 0.40, height: 0.06, psm: '6', useThresholded: false, scale: 4 },
          { left: 0.18, top: 0.34, width: 0.48, height: 0.065, psm: '6', useThresholded: false, scale: 5 },
        ],
        manage: [
          { left: 0.34, top: 0.555, width: 0.25, height: 0.05, psm: '7', useThresholded: false, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.36, top: 0.555, width: 0.22, height: 0.05, psm: '7', useThresholded: true, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.32, top: 0.55, width: 0.28, height: 0.055, psm: '6', useThresholded: false, scale: 4, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
          { left: 0.20, top: 0.54, width: 0.44, height: 0.07, psm: '6', useThresholded: false, scale: 5, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' },
        ],
        calibrationDate: [
          { left: 0.44, top: 0.74, width: 0.30, height: 0.05, psm: '6', useThresholded: false, scale: 5, whitelist: '0123456789-.年月日 ' },
          { left: 0.48, top: 0.75, width: 0.24, height: 0.045, psm: '7', useThresholded: false, scale: 5, whitelist: '0123456789-.年月日 ' },
          { left: 0.56, top: 0.79, width: 0.20, height: 0.045, psm: '7', useThresholded: false, scale: 4, whitelist: '0123456789-.年月日 ' },
          { left: 0.54, top: 0.785, width: 0.24, height: 0.05, psm: '7', useThresholded: true, scale: 4, whitelist: '0123456789-.年月日 ' },
          { left: 0.52, top: 0.78, width: 0.28, height: 0.055, psm: '6', useThresholded: false, scale: 4, whitelist: '0123456789-.年月日 ' },
          { left: 0.46, top: 0.79, width: 0.34, height: 0.06, psm: '6', useThresholded: false, scale: 5, whitelist: '0123456789-.年月日 ' },
        ],
      };

      function preprocessGimtGreenCanvasLocal(context, width, height) {
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

      async function runHint(field, hint) {
        const sourceCanvas = hint.useThresholded ? thresholdedCanvas : rawCanvas;
        const cropCanvas = document.createElement('canvas');
        const left = Math.floor(sourceCanvas.width * hint.left);
        const top = Math.floor(sourceCanvas.height * hint.top);
        const width = Math.floor(sourceCanvas.width * hint.width);
        const height = Math.floor(sourceCanvas.height * hint.height);
        cropCanvas.width = Math.max(1, Math.floor(width * hint.scale));
        cropCanvas.height = Math.max(1, Math.floor(height * hint.scale));
        const context = cropCanvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(sourceCanvas, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);

        for (const preprocess of ['none', 'gimt-green']) {
          if (preprocess === 'gimt-green') {
            preprocessGimtGreenCanvasLocal(context, cropCanvas.width, cropCanvas.height);
          }
          await worker.setParameters({
            tessedit_pageseg_mode: hint.psm,
            preserve_interword_spaces: '1',
            user_defined_dpi: '300',
          });
          const result = await worker.recognize(cropCanvas, {}, { text: true });
          const text = cleanExtractedValue(pickBestOcrTextLine(result?.data?.text || ''));
          yieldTrial.push({
            field,
            hint,
            preprocess,
            text,
          });
        }
      }

      const yieldTrial = [];
      for (const hint of seeds.customer) {
        await runHint('客户名称', hint);
      }
      for (const hint of seeds.address) {
        await runHint('地址', hint);
      }
      for (const hint of seeds.cert) {
        await runHint('证书编号', hint);
      }
      for (const hint of seeds.instrument) {
        await runHint('仪器名称', hint);
      }
      for (const hint of seeds.manage) {
        await runHint('管理编号', hint);
      }
      for (const hint of seeds.calibrationDate) {
        await runHint('校准日期', hint);
      }
      return yieldTrial;
    }, {
      fileName: path.basename(filePath),
      fileBytes: Array.from(fs.readFileSync(filePath)),
    });

    const outputPath = path.join(outputDir, 'region-sweep.json');
    await fsp.writeFile(outputPath, `${JSON.stringify(trials, null, 2)}\n`, 'utf8');
    console.log(`Region sweep artifacts: ${outputPath}`);
    trials.forEach((trial) => {
      console.log(`${trial.field} ${trial.preprocess} ${trial.hint.psm} ${trial.hint.left},${trial.hint.top},${trial.hint.width},${trial.hint.height} => ${trial.text}`);
    });
  } finally {
    await browser.close().catch(() => {});
    await stopServer(serverHandle && serverHandle.child);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

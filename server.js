const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8123);
const rootDir = __dirname;
const baseDir = path.resolve(rootDir);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function resolveRequestPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const trimmed = decodedPath === '/' ? '/index.html' : decodedPath;
  const fullPath = path.resolve(baseDir, `.${trimmed}`);
  if (!fullPath.startsWith(baseDir)) {
    return null;
  }
  return fullPath;
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

const server = http.createServer((request, response) => {
  const targetPath = resolveRequestPath(request.url || '/');
  if (!targetPath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.stat(targetPath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(targetPath).pipe(response);
  });
});

server.listen(port, host, () => {
  console.log('Batch rename tool server is running.');
  getNetworkUrls().forEach((url) => console.log(`Open: ${url}`));
  console.log('Press Ctrl+C to stop the server.');
});

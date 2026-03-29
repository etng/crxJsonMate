import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, '.output', 'wxt', 'chrome-mv3');
const fixturesDir = path.join(rootDir, 'tests', 'fixtures');
const port = Number(process.env.PORT || 4311);
const host = process.env.HOST || '127.0.0.1';

const contentTypeByExt = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonl', 'application/jsonl; charset=utf-8'],
  ['.jsonp', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon']
]);

const resolveRequestPath = (requestUrl) => {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const normalizedPath = path.posix.normalize(url.pathname).replace(/^(\.\.(?:\/|$))+/, '');

  if (normalizedPath === '/fixtures' || normalizedPath.startsWith('/fixtures/')) {
    return {
      baseDir: fixturesDir,
      relativePath: normalizedPath === '/fixtures' ? '/index.html' : normalizedPath.slice('/fixtures'.length)
    };
  }

  return {
    baseDir: buildDir,
    relativePath: normalizedPath
  };
};

const sendNotFound = (response) => {
  response.statusCode = 404;
  response.end('Not found');
};

const sendFile = async (response, filePath) => {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    return false;
  }

  const contentType = contentTypeByExt.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  response.statusCode = 200;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', fileStat.size);
  createReadStream(filePath).pipe(response);
  return true;
};

const server = http.createServer(async (request, response) => {
  if (!request.url || (request.method !== 'GET' && request.method !== 'HEAD')) {
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  try {
    const { baseDir, relativePath } = resolveRequestPath(request.url);
    const candidatePaths = [];
    const decodedRelativePath = decodeURIComponent(relativePath);

    if (decodedRelativePath.endsWith('/')) {
      candidatePaths.push(path.join(baseDir, decodedRelativePath, 'index.html'));
    } else {
      candidatePaths.push(path.join(baseDir, decodedRelativePath));
      candidatePaths.push(path.join(baseDir, `${decodedRelativePath}.html`));
    }

    for (const candidatePath of candidatePaths) {
      const resolvedPath = path.resolve(candidatePath);
      if (!resolvedPath.startsWith(path.resolve(baseDir) + path.sep) && resolvedPath !== path.resolve(baseDir)) {
        continue;
      }

      if (await sendFile(response, resolvedPath)) {
        return;
      }
    }

    sendNotFound(response);
  } catch {
    response.statusCode = 500;
    response.end('Internal server error');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Serving ${buildDir} and ${fixturesDir} at http://${host}:${port}\n`);
});

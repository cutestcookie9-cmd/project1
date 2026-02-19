import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4173);
const FETCH_TIMEOUT_MS = 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(payload));
}

function toNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function sanitizeQuery(value, fallback = '', maxLen = 80) {
  return String(value ?? fallback).trim().slice(0, maxLen);
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RobloxLauncherCompanion/1.1' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromFallbacks(urls) {
  const attempts = [];

  for (const url of urls) {
    try {
      const data = await fetchJsonWithTimeout(url);
      return { ok: true, data, source: url, attempts };
    } catch (error) {
      attempts.push({
        source: url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { ok: false, attempts };
}

async function handleApi(url, res) {
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'roblox-launcher-companion',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === '/api/games') {
    const query = encodeURIComponent(sanitizeQuery(url.searchParams.get('q')));
    const page = toNumber(url.searchParams.get('page'), 1, 1, 200);
    const limit = toNumber(url.searchParams.get('limit'), 12, 1, 50);
    const startRows = (page - 1) * limit;

    const urls = [
      `https://games.roblox.com/v1/games/list?model.keyword=${query}&model.maxRows=${limit}&model.startRows=${startRows}`,
      `https://games.roproxy.com/v1/games/list?model.keyword=${query}&model.maxRows=${limit}&model.startRows=${startRows}`,
    ];

    const result = await fetchFromFallbacks(urls);
    if (!result.ok) {
      return sendJson(res, 502, {
        error: 'Failed to fetch games from upstream providers',
        attempts: result.attempts,
      });
    }

    return sendJson(res, 200, {
      ...result.data,
      meta: { page, limit, source: result.source, partialFailures: result.attempts },
    });
  }

  if (url.pathname === '/api/catalog') {
    const query = encodeURIComponent(sanitizeQuery(url.searchParams.get('q')));
    const page = toNumber(url.searchParams.get('page'), 1, 1, 500);
    const limit = toNumber(url.searchParams.get('limit'), 12, 1, 30);
    const category = toNumber(url.searchParams.get('category'), 1, 1, 11);
    const cursor = encodeURIComponent(sanitizeQuery(url.searchParams.get('cursor'), '', 120));

    const urls = [
      `https://catalog.roblox.com/v1/search/items/details?Category=${category}&Keyword=${query}&Limit=${limit}&Cursor=${cursor}`,
      `https://catalog.roproxy.com/v1/search/items/details?Category=${category}&Keyword=${query}&Limit=${limit}&Cursor=${cursor}`,
    ];

    const result = await fetchFromFallbacks(urls);
    if (!result.ok) {
      return sendJson(res, 502, {
        error: 'Failed to fetch catalog from upstream providers',
        attempts: result.attempts,
      });
    }

    return sendJson(res, 200, {
      ...result.data,
      meta: { page, limit, source: result.source, partialFailures: result.attempts },
    });
  }

  if (url.pathname === '/api/avatar') {
    const userId = toNumber(url.searchParams.get('userId'), 1, 1, 9999999999);
    const urls = [
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
      `https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
    ];

    const result = await fetchFromFallbacks(urls);
    if (!result.ok) {
      return sendJson(res, 502, {
        error: 'Failed to fetch avatar from upstream providers',
        attempts: result.attempts,
      });
    }

    return sendJson(res, 200, {
      ...result.data,
      meta: { source: result.source, partialFailures: result.attempts },
    });
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

async function handleStatic(url, res) {
  const rawPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safeRelative = path.posix.normalize(rawPath).replace(/^\/+/, '');
  const filePath = path.join(__dirname, safeRelative);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const ext = path.extname(filePath);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || '/', `http://${host}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(url, res);
    }

    return await handleStatic(url, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Roblox launcher companion running at http://localhost:${PORT}`);
});

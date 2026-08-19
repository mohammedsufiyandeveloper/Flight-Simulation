const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

/** Minimal .env loader — no dotenv dependency for a project with none installed. */
function loadEnv(file) {
  const env = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return env;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(path.join(__dirname, '.env'));

/**
 * Server-side proxy for the garden video's wind-speed control (see
 * WIND_API in main.js). The WeatherAPI.com key lives only in .env / this
 * process's env — it never reaches the browser, unlike calling the API
 * directly from client JS.
 */
async function handleWindRequest(res) {
  const key = process.env.WEATHERAPI_KEY || env.WEATHERAPI_KEY;
  if (!key) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'WEATHERAPI_KEY not configured' }));
    return;
  }

  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=Bengaluru&_=${Date.now()}`;
    const apiRes = await fetch(url);
    if (!apiRes.ok) throw new Error(`weatherapi → HTTP ${apiRes.status}`);
    const data = await apiRes.json();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ kph: data.current.wind_kph }));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.url.split('?')[0] === '/api/wind') {
    handleWindRequest(res);
    return;
  }

  // Normalize URL path to prevent directory traversal
  let filePath = req.url.split('?')[0];
  if (filePath === '/') {
    filePath = '/index.html';
  }

  const absolutePath = path.join(__dirname, filePath);

  // Ensure the requested file is within the project directory
  if (!absolutePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isStaticImage = ext === '.png' || ext === '.jpg' || ext === '.gif' || ext === '.svg';

    const range = req.headers.range;
    if (range) {
      // Video elements need 206 Partial Content to seek/stream — without
      // this, browsers that require Range support (notably Safari) refuse
      // to play a large video served whole.
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;

      if (start >= stats.size || end >= stats.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(absolutePath, { start, end }).pipe(res);
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': stats.size,
    };
    if (isStaticImage) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    fs.createReadStream(absolutePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
});

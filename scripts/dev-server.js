const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('./build');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Unregisters any service worker before reloading, so the dev server never
// serves stale cached content while iterating.
const LIVE_RELOAD_SCRIPT = `<script>
(function () {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) { reg.unregister(); });
    });
  }
  new EventSource('/__livereload').onmessage = function () { location.reload(); };
})();
</script>`;

let clients = [];
let building = false;
let rebuildQueued = false;

async function rebuild() {
  if (building) {
    rebuildQueued = true;
    return;
  }
  building = true;
  try {
    await build();
    console.log('Rebuilt at %s', new Date().toLocaleTimeString());
    clients.forEach((res) => res.write('data: reload\n\n'));
  } catch (err) {
    console.error('Build failed:', err.message);
  } finally {
    building = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      rebuild();
    }
  }
}

function watchSource() {
  let timer;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    clients.push(res);
    req.on('close', () => {
      clients = clients.filter((client) => client !== res);
    });
    return;
  }

  let urlPath = req.url.split('?')[0];
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(DIST, decodeURIComponent(urlPath));

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    if (ext === '.html') {
      res.end(data.toString('utf8').replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`));
    } else {
      res.end(data);
    }
  });
});

build()
  .then(() => {
    watchSource();
    server.listen(PORT, () => {
      console.log(`Dev server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

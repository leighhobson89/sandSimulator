// tools/serve.mjs
// -----------------------------------------------------------------------------
// A tiny static file server, so the page can be opened over http instead of
// file://. That matters because ES modules and fetch (which is how
// particles.json is loaded) are both blocked on file:// URLs.
//
//     npm start          then open http://localhost:8080
//
// Uses nothing but what ships with node.
// -----------------------------------------------------------------------------

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = process.env.PORT || 8080;

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

createServer(async (request, response) => {
    const requested = decodeURIComponent(request.url.split('?')[0]);
    const relative = normalize(requested === '/' ? 'index.html' : requested).replace(/^(\.\.[\\/])+/, '');
    const file = join(root, relative);

    try {
        const body = await readFile(file);
        response.writeHead(200, {
            'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        response.end(body);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Not found: ' + relative);
    }
}).listen(port, () => {
    console.log(`Elemental Foundry running at http://localhost:${port}`);
});

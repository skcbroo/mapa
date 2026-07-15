// Servidor mínimo, dependência ZERO (só Node puro). Sem banco.
// Guarda o estado dos estandes num único arquivo JSON compartilhado.
import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// DATA_DIR permite apontar pra um volume do Railway (persistência entre deploys).
// Sem volume, funciona igual — só reseta se você fizer um redeploy.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
// Senha opcional: se APP_PASSWORD estiver setada, escrever exige o header.
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- estado em memória (fonte da verdade) + escrita atômica em disco ----
let state = { booths: {} };
let writeChain = Promise.resolve();

async function loadState() {
  try {
    if (existsSync(DATA_FILE)) {
      state = JSON.parse(await readFile(DATA_FILE, 'utf8')) || { booths: {} };
      if (!state.booths) state.booths = {};
    }
  } catch (e) {
    console.error('Falha ao ler data.json, começando vazio:', e.message);
    state = { booths: {} };
  }
}

// grava serializado (uma escrita por vez) e atômico (tmp + rename)
function persist() {
  writeChain = writeChain.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(state), 'utf8');
    await rename(tmp, DATA_FILE);
  }).catch(e => console.error('Erro ao salvar:', e.message));
  return writeChain;
}

// ---- helpers HTTP ----
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function authOK(req) {
  if (!APP_PASSWORD) return true;
  return req.headers['x-app-password'] === APP_PASSWORD;
}

function cleanBooth(b = {}) {
  return {
    status: String(b.status || 'pendente'),
    zona: String(b.zona || '1'),
    cacador: String(b.cacador || '').slice(0, 120),
    nota: String(b.nota || '').slice(0, 2000),
    updatedAt: Date.now(),
  };
}

async function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

// ---- servidor ----
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // GET estado completo
  if (req.method === 'GET' && url === '/api/booths') {
    return sendJSON(res, 200, state);
  }

  // config pública (só diz se exige senha) — pro front saber se pede senha
  if (req.method === 'GET' && url === '/api/config') {
    return sendJSON(res, 200, { needsPassword: !!APP_PASSWORD });
  }

  // PUT um estande
  if (req.method === 'PUT' && url.startsWith('/api/booths/')) {
    if (!authOK(req)) return sendJSON(res, 401, { error: 'senha' });
    const id = decodeURIComponent(url.slice('/api/booths/'.length));
    if (!id) return sendJSON(res, 400, { error: 'id' });
    try {
      const body = await readBody(req);
      state.booths[id] = cleanBooth(body);
      await persist();
      return sendJSON(res, 200, { ok: true, booth: state.booths[id] });
    } catch { return sendJSON(res, 400, { error: 'json' }); }
  }

  // POST import em massa (merge: mais recente vence)
  if (req.method === 'POST' && url === '/api/import') {
    if (!authOK(req)) return sendJSON(res, 401, { error: 'senha' });
    try {
      const body = await readBody(req);
      const incoming = body.booths || {};
      let merged = 0;
      for (const id of Object.keys(incoming)) {
        const cur = state.booths[id];
        const inc = incoming[id];
        if (!cur || (inc.updatedAt || 0) > (cur.updatedAt || 0)) {
          state.booths[id] = { ...cleanBooth(inc), updatedAt: inc.updatedAt || Date.now() };
          merged++;
        }
      }
      await persist();
      return sendJSON(res, 200, { ok: true, merged });
    } catch { return sendJSON(res, 400, { error: 'json' }); }
  }

  if (url.startsWith('/api/')) return sendJSON(res, 404, { error: 'rota' });

  return serveStatic(req, res);
});

await loadState();
server.listen(PORT, () => {
  console.log(`Mapa Estandes rodando na porta ${PORT}`);
  console.log(`Dados em: ${DATA_FILE}`);
  console.log(APP_PASSWORD ? 'Senha: ATIVADA' : 'Senha: aberto (sem senha)');
});

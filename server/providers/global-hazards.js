import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { fetchGdacsHazards } from './global-hazards/gdacs.js';

export function globalHazardsProxy() {
  const TTL_MS = 15 * 60_000;
  const CACHE_PATH = path.join(
    process.cwd(),
    '.gev-cache',
    'global-hazards.json',
  );
  let mem = null;
  let diskChecked = false;
  let inflight = null;

  async function readDiskOnce() {
    if (diskChecked) return;
    diskChecked = true;
    try {
      const parsed = JSON.parse(await fsp.readFile(CACHE_PATH, 'utf8'));
      if (Number.isFinite(parsed?.at) && Array.isArray(parsed?.hazards))
        mem = parsed;
    } catch {}
  }

  async function writeDisk(entry) {
    try {
      await fsp.mkdir(path.dirname(CACHE_PATH), { recursive: true });
      await fsp.writeFile(CACHE_PATH, JSON.stringify(entry), 'utf8');
    } catch (err) {
      console.warn('[global-hazards] cache write failed:', err?.message || err);
    }
  }

  function payload(entry, stale) {
    return {
      fetchedAt: entry.at,
      stale,
      ttlMs: TTL_MS,
      sources: entry.sources || [],
      count: entry.hazards.length,
      hazards: entry.hazards,
      advisory:
        'Awareness only. Follow official emergency services and local authorities for protective action.',
    };
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/global-hazards', async (req, res) => {
      const sendJson = (status, obj) => {
        if (res.headersSent) return;
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(obj));
      };
      try {
        await readDiskOnce();
        const entry = mem;
        if (entry && Date.now() - entry.at < TTL_MS)
          return sendJson(200, payload(entry, false));
        if (!inflight) {
          inflight = fetchGdacsHazards()
            .then(async (fresh) => {
              mem = fresh;
              await writeDisk(fresh);
              return fresh;
            })
            .catch((err) => {
              console.warn(
                '[global-hazards] refresh failed:',
                err?.message || err,
              );
              return null;
            })
            .finally(() => {
              inflight = null;
            });
        }
        const fresh = await inflight;
        if (fresh) return sendJson(200, payload(fresh, false));
        if (entry) return sendJson(200, payload(entry, true));
        sendJson(502, {
          error: 'global hazards fetch failed and no cache available',
        });
      } catch (err) {
        console.warn('[global-hazards] error:', err?.message || err);
        sendJson(500, { error: 'global hazards proxy error' });
      }
    });
  };
  return {
    name: 'global-hazards-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}

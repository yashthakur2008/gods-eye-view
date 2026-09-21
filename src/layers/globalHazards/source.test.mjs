import test from 'node:test';
import assert from 'node:assert/strict';

import { createGlobalHazardsSource } from './source.js';

test('global hazards source returns hazards from proxy JSON', async () => {
  const source = createGlobalHazardsSource({
    apiUrl: '/custom-hazards',
    fetchImpl: async (url, options) => {
      assert.equal(url, '/custom-hazards');
      assert.equal(options.headers.Accept, 'application/json');
      return { ok: true, json: async () => ({ hazards: [{ id: 'a' }] }) };
    },
  });
  assert.deepEqual(await source.getSnapshot(), [{ id: 'a' }]);
});

test('global hazards source rejects failed proxy responses', async () => {
  const source = createGlobalHazardsSource({
    fetchImpl: async () => ({ ok: false, status: 502 }),
  });
  await assert.rejects(source.getSnapshot(), /Global hazards HTTP 502/);
});

test('global hazards source treats malformed payloads as empty snapshots', async () => {
  const source = createGlobalHazardsSource({
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  assert.deepEqual(await source.getSnapshot(), []);
});
